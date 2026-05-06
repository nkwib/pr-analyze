import {
  parseCommitFiles,
  parseCommitMetadata,
  type AnalyzeContext,
  type CommitRecord,
  type DiffFile,
  type DiffStatus,
  type ProviderAdapter,
} from "../vendor/core/index.js";

import { runGit, type GitRunner } from "../lib/git.js";

const META_FORMAT = "%x1e%H%x1f%P%x1f%aN%x1f%aI%x1f%B";
const FILE_MARKER_FORMAT = "\x1eCOMMIT %H";

const STATUS_MAP: Record<string, DiffStatus> = {
  A: "added",
  M: "modified",
  D: "removed",
  R: "renamed",
  C: "copied",
};

export interface LocalAdapterOpts {
  /** Absolute path to a local git repository. */
  readonly repoDir: string;
  /**
   * Diff range. Accepts:
   *   - "HEAD~1..HEAD"    (canonical range form)
   *   - "main..feature"   (branches)
   *   - "HEAD~3"          (single ref → expanded to "<ref>..HEAD")
   */
  readonly diff: string;
  /**
   * Maximum commits to walk for history. Default 5000 — matches the
   * cochange-graph perf budget. Set higher for older repos at your own
   * (latency) cost.
   */
  readonly maxCommits?: number;
  /** Inject a fake `runGit` for tests. Default: real subprocess. */
  readonly gitRunner?: GitRunner;
}

/**
 * Filesystem-only adapter. Spawns `git` in the configured `repoDir` to
 * read commit history and the requested diff. Performs zero network
 * I/O — safe for offline analysis and air-gapped environments.
 *
 * Determinism: given the same `repoDir` state and the same `diff`,
 * output is bit-identical across runs.
 *
 * @public
 */
export class LocalAdapter implements ProviderAdapter {
  readonly name = "local";

  private readonly opts: LocalAdapterOpts;
  private readonly run: GitRunner;

  constructor(opts: LocalAdapterOpts) {
    this.opts = opts;
    this.run = opts.gitRunner ?? runGit;
  }

  async collect(): Promise<AnalyzeContext> {
    const range = normaliseRange(this.opts.diff);
    const [baseRef, headRef] = parseRange(range);

    const baseSha = (await this.git(["rev-parse", baseRef])).trim();
    const headSha = (await this.git(["rev-parse", headRef])).trim();

    const commits = await this.collectCommits();
    const files = await this.collectDiffFiles(baseSha, headSha);

    return {
      commits,
      diff: { baseSha, headSha, files },
      pr: null,
    };
  }

  private async collectCommits(): Promise<readonly CommitRecord[]> {
    const maxCommits = this.opts.maxCommits ?? 5000;
    const metaOut = await this.git([
      "log",
      `--max-count=${maxCommits}`,
      `--format=${META_FORMAT}`,
    ]);
    const meta = parseCommitMetadata(metaOut);

    const fileOut = await this.git([
      "log",
      `--max-count=${maxCommits}`,
      "--name-only",
      `--format=${FILE_MARKER_FORMAT}`,
    ]);
    const filesByCommit = parseCommitFiles(fileOut);

    return meta.map((m) => ({
      sha: m.sha,
      parentSha: m.parentSha,
      message: m.message,
      authorLogin: m.authorLogin,
      authoredAt: m.authoredAt,
      filesTouched: filesByCommit.get(m.sha) ?? [],
    }));
  }

  private async collectDiffFiles(
    baseSha: string,
    headSha: string,
  ): Promise<readonly DiffFile[]> {
    const range = `${baseSha}..${headSha}`;

    // Three git invocations total — independent of file count:
    //   1. `--name-status -z` (NUL-separated; survives tabs/newlines in paths)
    //   2. `--numstat -z`     (per-file additions/deletions)
    //   3. one full patch     (split client-side into per-file patches)
    //
    // The previous implementation spawned `git diff` once per file in
    // step 3, which is O(n) subprocess overhead on large PRs.
    const [nameStatusOut, numstatOut, patchOut] = await Promise.all([
      this.git(["diff", "--name-status", "-z", range]),
      this.git(["diff", "--numstat", "-z", range]),
      this.git(["diff", range]),
    ]);
    const nameStatus = parseNameStatus(nameStatusOut);
    const numstat = parseNumstat(numstatOut);
    const patches = splitPatchByFile(patchOut);

    const files: DiffFile[] = [];
    for (const entry of nameStatus) {
      const stats = numstat.get(entry.path) ?? { additions: 0, deletions: 0 };
      const patch =
        patches.get(entry.path) ??
        (entry.previousPath ? patches.get(entry.previousPath) : undefined) ??
        null;
      files.push({
        path: entry.path,
        previousPath: entry.previousPath,
        status: entry.status,
        additions: stats.additions,
        deletions: stats.deletions,
        patch: patch !== null && patch.length > 0 ? patch : null,
      });
    }
    return files;
  }

  private async git(args: readonly string[]): Promise<string> {
    return this.run(args, { cwd: this.opts.repoDir });
  }
}

interface NameStatusEntry {
  readonly status: DiffStatus;
  readonly path: string;
  readonly previousPath: string | null;
}

/**
 * Parse `git diff --name-status -z` output.
 *
 * `-z` separates fields and records with NUL bytes (\x00). For an
 * "R<score>" or "C<score>" rename/copy, three NUL-separated tokens
 * are emitted (status, oldPath, newPath); for everything else, two
 * tokens (status, path).
 */
export function parseNameStatus(output: string): readonly NameStatusEntry[] {
  const tokens = output.split("\x00");
  // `-z` ends with a trailing NUL → drop the empty tail token.
  if (tokens.length > 0 && tokens[tokens.length - 1] === "") tokens.pop();

  const entries: NameStatusEntry[] = [];
  let i = 0;
  while (i < tokens.length) {
    const code = (tokens[i] ?? "").charAt(0);
    if (code.length === 0) {
      i += 1;
      continue;
    }
    const status = STATUS_MAP[code] ?? "modified";
    if (status === "renamed" || status === "copied") {
      const previousPath = tokens[i + 1] ?? "";
      const path = tokens[i + 2] ?? "";
      i += 3;
      if (path.length === 0) continue;
      entries.push({ status, path, previousPath });
      continue;
    }
    const path = tokens[i + 1] ?? "";
    i += 2;
    if (path.length === 0) continue;
    entries.push({ status, path, previousPath: null });
  }
  return entries;
}

interface NumstatEntry {
  readonly additions: number;
  readonly deletions: number;
}

/**
 * Parse `git diff --numstat -z` output.
 *
 * For non-rename entries, each record is `<add>\t<del>\t<path>\x00`.
 * For renames, the old and new paths are emitted as two extra
 * NUL-separated tokens after the tab-separated counts.
 */
export function parseNumstat(output: string): Map<string, NumstatEntry> {
  const map = new Map<string, NumstatEntry>();
  const tokens = output.split("\x00");
  if (tokens.length > 0 && tokens[tokens.length - 1] === "") tokens.pop();

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i] ?? "";
    if (tok.length === 0) {
      i += 1;
      continue;
    }
    const parts = tok.split("\t");
    const a = parts[0] ?? "0";
    const d = parts[1] ?? "0";
    const inlinePath = parts[2] ?? "";

    let path = inlinePath;
    if (path.length === 0) {
      // Rename form: counts and the empty path-slot in this token,
      // then two more tokens with the old/new paths.
      // We don't need the old path; map by new path.
      const newPath = tokens[i + 2] ?? "";
      path = newPath;
      i += 3;
    } else {
      i += 1;
    }
    if (path.length === 0) continue;
    map.set(path, {
      additions: a === "-" ? 0 : Number(a) || 0,
      deletions: d === "-" ? 0 : Number(d) || 0,
    });
  }
  return map;
}

/**
 * Split a multi-file `git diff` patch into a map keyed by the
 * post-image path (for renames, also keyed by the pre-image path so
 * callers can look it up either way).
 */
export function splitPatchByFile(output: string): Map<string, string> {
  const map = new Map<string, string>();
  if (output.length === 0) return map;
  // Walk lines, splitting at each `diff --git ` header.
  const lines = output.split("\n");
  let current: string[] = [];
  let currentNew: string | null = null;
  let currentOld: string | null = null;

  const flush = (): void => {
    if (currentNew === null && currentOld === null) return;
    const text = current.join("\n");
    if (currentNew !== null) map.set(currentNew, text);
    if (currentOld !== null && currentOld !== currentNew) map.set(currentOld, text);
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      flush();
      current = [line];
      currentNew = null;
      currentOld = null;
      // The header is "diff --git a/<old> b/<new>". Filenames may
      // contain spaces; for the unquoted form, both halves of the
      // header reference the same path so we extract from the trailing
      // " b/" prefix.
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      if (match) {
        currentOld = match[1] ?? null;
        currentNew = match[2] ?? null;
      }
      continue;
    }
    if (line.startsWith("--- a/") && currentOld === null) {
      currentOld = line.slice("--- a/".length);
    } else if (line.startsWith("+++ b/") && currentNew === null) {
      currentNew = line.slice("+++ b/".length);
    }
    current.push(line);
  }
  flush();
  return map;
}

function normaliseRange(input: string): string {
  if (input.includes("..")) return input;
  return `${input}..HEAD`;
}

function parseRange(range: string): [string, string] {
  // Triple-dot (`A...B`) means symmetric diff; we collapse to two-dot
  // for our purposes (covers most "what's in this PR" expressions).
  const sep = range.includes("...") ? "..." : "..";
  const parts = range.split(sep);
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid diff range: ${range}. Use "<base>..<head>" or a single ref.`,
    );
  }
  return [parts[0], parts[1]];
}
