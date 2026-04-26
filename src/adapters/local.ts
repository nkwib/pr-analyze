import {
  parseCommitFiles,
  parseCommitMetadata,
  type AnalyzeContext,
  type CommitRecord,
  type DiffFile,
  type DiffStatus,
  type ProviderAdapter,
} from "@prcompass/core";

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

    // One pass for status (R*/C* rename/copy), one for numstat, one
    // batched per file for the patch text.
    const nameStatus = parseNameStatus(
      await this.git(["diff", "--name-status", range]),
    );
    const numstat = parseNumstat(await this.git(["diff", "--numstat", range]));

    const files: DiffFile[] = [];
    for (const entry of nameStatus) {
      const stats = numstat.get(entry.path) ?? { additions: 0, deletions: 0 };
      const patch = await this.git([
        "diff",
        range,
        "--",
        entry.previousPath ?? entry.path,
        ...(entry.previousPath ? [entry.path] : []),
      ]);
      files.push({
        path: entry.path,
        previousPath: entry.previousPath,
        status: entry.status,
        additions: stats.additions,
        deletions: stats.deletions,
        patch: patch.length > 0 ? patch : null,
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

export function parseNameStatus(output: string): readonly NameStatusEntry[] {
  const entries: NameStatusEntry[] = [];
  for (const rawLine of output.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.length === 0) continue;
    const parts = line.split("\t");
    const code = (parts[0] ?? "").charAt(0);
    const status = STATUS_MAP[code] ?? "modified";
    if (status === "renamed" || status === "copied") {
      const previousPath = parts[1] ?? null;
      const path = parts[2] ?? "";
      if (path.length === 0) continue;
      entries.push({ status, path, previousPath });
      continue;
    }
    const path = parts[1] ?? "";
    if (path.length === 0) continue;
    entries.push({ status, path, previousPath: null });
  }
  return entries;
}

interface NumstatEntry {
  readonly additions: number;
  readonly deletions: number;
}

export function parseNumstat(output: string): Map<string, NumstatEntry> {
  const map = new Map<string, NumstatEntry>();
  for (const rawLine of output.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.length === 0) continue;
    const parts = line.split("\t");
    const a = parts[0] ?? "0";
    const d = parts[1] ?? "0";
    let path = parts[2] ?? "";
    // Rename: "old => new" or "{prefix => prefix2}name"
    const renameMatch = /\{(.+) => (.+)\}/.exec(path);
    if (renameMatch) {
      path = path.replace(/\{.+ => (.+)\}/, "$1");
    } else if (path.includes(" => ")) {
      const split = path.split(" => ");
      path = split[1] ?? path;
    }
    if (path.length === 0) continue;
    map.set(path, {
      additions: a === "-" ? 0 : Number(a) || 0,
      deletions: d === "-" ? 0 : Number(d) || 0,
    });
  }
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
