import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const MAX_BUFFER = 256 * 1024 * 1024; // 256 MB; covers very large repos.

export interface RunGitOpts {
  readonly cwd: string;
  readonly timeoutMs?: number;
  /** When set, overrides the resolved git binary (test injection). */
  readonly gitBin?: string;
}

export type GitRunner = (args: readonly string[], opts: RunGitOpts) => Promise<string>;

/**
 * Default subprocess runner for `git`. Used by `LocalAdapter`. Tests
 * inject a fake to avoid spawning real subprocesses.
 */
export const runGit: GitRunner = async (args, opts) => {
  const { stdout } = await exec(opts.gitBin ?? "git", [...args], {
    cwd: opts.cwd,
    maxBuffer: MAX_BUFFER,
    timeout: opts.timeoutMs ?? 60_000,
    encoding: "utf8",
  });
  return stdout;
};
