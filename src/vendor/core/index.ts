/**
 * Vendored, minimal implementation of the deterministic analysis engine.
 *
 * Originally consumed from `@prcompass/core` (an unpublished workspace
 * package). The CLI was extracted from a monorepo and the upstream
 * package is not on npm; rather than depend on something users cannot
 * resolve, we vendor the consumed surface here. The shape and the
 * "no-fabrication" invariant (risk score is `null` when there is no
 * bug-fix history to ground it in) are preserved.
 *
 * @public
 */

export const ANALYSIS_SCHEMA_VERSION = "0.1.0";

export type DiffStatus =
  | "added"
  | "modified"
  | "removed"
  | "renamed"
  | "copied";

export interface DiffFile {
  readonly path: string;
  readonly previousPath: string | null;
  readonly status: DiffStatus;
  readonly additions: number;
  readonly deletions: number;
  readonly patch: string | null;
}

export interface CommitRecord {
  readonly sha: string;
  readonly parentSha: string | null;
  readonly message: string;
  readonly authorLogin: string | null;
  readonly authoredAt: string;
  readonly filesTouched: readonly string[];
}

export interface AnalyzeContextDiff {
  readonly baseSha: string;
  readonly headSha: string;
  readonly files: readonly DiffFile[];
}

export interface AnalyzeContextPR {
  readonly title: string;
  readonly body: string | null;
  readonly number: number;
  readonly authorLogin: string | null;
}

export interface AnalyzeContext {
  readonly commits: readonly CommitRecord[];
  readonly diff: AnalyzeContextDiff;
  readonly pr: AnalyzeContextPR | null;
}

export interface ProviderAdapter {
  readonly name: string;
  collect(): Promise<AnalyzeContext>;
}

export interface DefectDensity {
  /**
   * Bayesian-smoothed defect density. Pulls each per-file rate toward
   * the repo-wide bug-fix rate so files with very few touches don't
   * dominate the ranking.
   */
  readonly value: number;
  /** Bug-fix commit SHAs that touched this file. */
  readonly groundedIn: readonly string[];
}

export interface FileChurnReport {
  readonly file: string;
  readonly commits: number;
  readonly bugFixCommits: number;
  readonly firstTouchedAt: string | null;
  readonly lastTouchedAt: string | null;
}

export interface FileRiskReport {
  readonly file: string;
  /** Composite risk score in [0, 1], or `null` if not enough signal. */
  readonly score: number | null;
  readonly defectDensity: DefectDensity;
  readonly caveats: readonly string[];
}

export interface CoChangeEdge {
  readonly a: string;
  readonly b: string;
  readonly count: number;
  readonly jaccard: number;
}

export interface AnalysisOutput {
  readonly version: string;
  readonly head: { readonly sha: string; readonly baseSha: string };
  readonly diff: { readonly fileCount: number };
  readonly pr: AnalyzeContextPR | null;
  readonly mining: {
    readonly totalCommits: number;
    readonly bugFixCommits: number;
  };
  readonly hotspots: ReadonlyArray<{
    readonly file: string;
    readonly density: number;
    readonly bugFixCommits: number;
  }>;
  readonly churn: {
    readonly files: readonly string[];
    readonly byFile: { readonly [path: string]: FileChurnReport };
  };
  readonly cochange: {
    readonly edges: readonly CoChangeEdge[];
  };
  readonly risk: {
    readonly files: readonly string[];
    readonly byFile: { readonly [path: string]: FileRiskReport };
  };
}

const BUGFIX_PATTERN = /^\s*(fix|fixes|fixed|bugfix|hotfix)([\s(:]|$)/i;
const ALT_BUGFIX_PATTERN = /\b(fix|fixes|fixed)\b/i;

/** Heuristic: is this commit a bug-fix? Conservative — prefers conventional-commit prefix. */
export function isBugFixMessage(message: string): boolean {
  const firstLine = message.split("\n")[0] ?? "";
  if (BUGFIX_PATTERN.test(firstLine)) return true;
  // Fall back to any "fix" word anywhere in the subject line for non-conventional commits.
  return ALT_BUGFIX_PATTERN.test(firstLine);
}

/**
 * Parse `git log --format=%x1e%H%x1f%P%x1f%aN%x1f%aI%x1f%B` output.
 *
 * Each record starts with RS (\x1e); fields within a record are
 * separated by US (\x1f). The message is the last field and may
 * itself contain newlines.
 */
export function parseCommitMetadata(
  output: string,
): ReadonlyArray<{
  sha: string;
  parentSha: string | null;
  authorLogin: string | null;
  authoredAt: string;
  message: string;
}> {
  const RS = "\x1e";
  const US = "\x1f";
  const records: Array<{
    sha: string;
    parentSha: string | null;
    authorLogin: string | null;
    authoredAt: string;
    message: string;
  }> = [];
  // Skip leading characters before the first RS.
  const chunks = output.split(RS);
  for (const chunk of chunks) {
    if (chunk.length === 0) continue;
    const fields = chunk.split(US);
    const sha = (fields[0] ?? "").trim();
    if (sha.length === 0) continue;
    const parents = (fields[1] ?? "").trim();
    const author = (fields[2] ?? "").trim();
    const authoredAt = (fields[3] ?? "").trim();
    const message = (fields[4] ?? "").replace(/\n+$/, "");
    const firstParent = parents.length === 0 ? null : (parents.split(/\s+/)[0] ?? null);
    records.push({
      sha,
      parentSha: firstParent,
      authorLogin: author.length === 0 ? null : author,
      authoredAt,
      message,
    });
  }
  return records;
}

/**
 * Parse `git log --name-only --format=\x1eCOMMIT %H` output into a
 * map of commit-sha → files-touched.
 */
export function parseCommitFiles(output: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const RS = "\x1e";
  const sections = output.split(RS);
  for (const section of sections) {
    if (section.length === 0) continue;
    const lines = section.split("\n");
    const header = lines[0] ?? "";
    if (!header.startsWith("COMMIT ")) continue;
    const sha = header.slice("COMMIT ".length).trim();
    if (sha.length === 0) continue;
    const files: string[] = [];
    for (let i = 1; i < lines.length; i += 1) {
      const f = lines[i]?.replace(/\r$/, "") ?? "";
      if (f.length === 0) continue;
      files.push(f);
    }
    result.set(sha, files);
  }
  return result;
}

/**
 * Run the deterministic analysis pipeline. Pure: same input → same
 * output, byte-for-byte.
 *
 * @public
 */
export function analyze(ctx: AnalyzeContext): AnalysisOutput {
  const totalCommits = ctx.commits.length;
  const bugFixCommits: CommitRecord[] = [];
  for (const c of ctx.commits) {
    if (isBugFixMessage(c.message)) bugFixCommits.push(c);
  }

  // Per-file commit counts and bug-fix counts.
  const commitsPerFile = new Map<string, number>();
  const fixesPerFile = new Map<string, string[]>();
  const firstTouched = new Map<string, string>();
  const lastTouched = new Map<string, string>();

  // Walk commits in order. `git log` is newest-first by default, so we
  // reverse to get chronological order for first/last bookkeeping.
  const chronological = [...ctx.commits].reverse();
  for (const c of chronological) {
    for (const f of c.filesTouched) {
      commitsPerFile.set(f, (commitsPerFile.get(f) ?? 0) + 1);
      if (!firstTouched.has(f)) firstTouched.set(f, c.authoredAt);
      lastTouched.set(f, c.authoredAt);
    }
  }
  for (const c of bugFixCommits) {
    for (const f of c.filesTouched) {
      const list = fixesPerFile.get(f);
      if (list === undefined) {
        fixesPerFile.set(f, [c.sha]);
      } else if (!list.includes(c.sha)) {
        list.push(c.sha);
      }
    }
  }

  // Repo-wide bug-fix rate (per file-touch). Used as the prior in
  // Bayesian smoothing of per-file density.
  let totalFileTouches = 0;
  for (const v of commitsPerFile.values()) totalFileTouches += v;
  let totalFixTouches = 0;
  for (const v of fixesPerFile.values()) totalFixTouches += v.length;
  const priorRate = totalFileTouches === 0 ? 0 : totalFixTouches / totalFileTouches;
  const priorWeight = 5;

  // Files in scope: diff files plus any file we have any history for.
  // Including history-only files keeps the per-file reports defined
  // for callers that want to look up arbitrary paths from the commit
  // walk (and preserves the "score is `null` when grounding is absent"
  // contract).
  const filesInScope = new Set<string>();
  for (const f of ctx.diff.files) filesInScope.add(f.path);
  for (const f of commitsPerFile.keys()) filesInScope.add(f);

  const churnByFile: Record<string, FileChurnReport> = {};
  const churnFiles: string[] = [];
  for (const file of [...filesInScope].sort()) {
    const commits = commitsPerFile.get(file) ?? 0;
    const fixes = (fixesPerFile.get(file) ?? []).length;
    churnByFile[file] = {
      file,
      commits,
      bugFixCommits: fixes,
      firstTouchedAt: firstTouched.get(file) ?? null,
      lastTouchedAt: lastTouched.get(file) ?? null,
    };
    churnFiles.push(file);
  }

  // Hotspots: smoothed defect density per file, sorted descending.
  const hotspots: Array<{ file: string; density: number; bugFixCommits: number }> = [];
  for (const file of filesInScope) {
    const commits = commitsPerFile.get(file) ?? 0;
    const fixes = (fixesPerFile.get(file) ?? []).length;
    const smoothed =
      (fixes + priorRate * priorWeight) / (commits + priorWeight);
    hotspots.push({ file, density: smoothed, bugFixCommits: fixes });
  }
  hotspots.sort((a, b) => {
    if (b.density !== a.density) return b.density - a.density;
    return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
  });

  // Co-change graph: pairs of files that appear together in commits.
  const pairCounts = new Map<string, number>();
  for (const c of ctx.commits) {
    const touched = [...new Set(c.filesTouched)].sort();
    for (let i = 0; i < touched.length; i += 1) {
      for (let j = i + 1; j < touched.length; j += 1) {
        const a = touched[i]!;
        const b = touched[j]!;
        const key = `${a}\x00${b}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const edges: CoChangeEdge[] = [];
  for (const [key, count] of pairCounts) {
    const [a, b] = key.split("\x00") as [string, string];
    if (!filesInScope.has(a) && !filesInScope.has(b)) continue;
    const ca = commitsPerFile.get(a) ?? 0;
    const cb = commitsPerFile.get(b) ?? 0;
    const union = ca + cb - count;
    const jaccard = union === 0 ? 0 : count / union;
    edges.push({ a, b, count, jaccard });
  }
  edges.sort((x, y) => {
    if (y.count !== x.count) return y.count - x.count;
    if (x.a !== y.a) return x.a < y.a ? -1 : 1;
    return x.b < y.b ? -1 : 1;
  });

  // Risk: composite of smoothed density × log(churn). Only emit a
  // numeric score if the repo has at least one bug-fix commit;
  // otherwise the score is `null` (no fabrication).
  const haveSignal = bugFixCommits.length > 0;
  const riskByFile: Record<string, FileRiskReport> = {};
  const riskFiles: string[] = [];
  for (const file of [...filesInScope].sort()) {
    const commits = commitsPerFile.get(file) ?? 0;
    const fixSha = fixesPerFile.get(file) ?? [];
    const smoothed =
      (fixSha.length + priorRate * priorWeight) / (commits + priorWeight);
    const caveats: string[] = [];
    if (commits === 0) caveats.push("no-history");
    if (!haveSignal) caveats.push("no-bugfix-history");
    const score = haveSignal ? smoothed * Math.log1p(commits) : null;
    riskByFile[file] = {
      file,
      score,
      defectDensity: { value: smoothed, groundedIn: [...fixSha].sort() },
      caveats,
    };
    riskFiles.push(file);
  }

  return {
    version: ANALYSIS_SCHEMA_VERSION,
    head: { sha: ctx.diff.headSha, baseSha: ctx.diff.baseSha },
    diff: { fileCount: ctx.diff.files.length },
    pr: ctx.pr,
    mining: { totalCommits, bugFixCommits: bugFixCommits.length },
    hotspots,
    churn: { files: churnFiles, byFile: churnByFile },
    cochange: { edges },
    risk: { files: riskFiles, byFile: riskByFile },
  };
}
