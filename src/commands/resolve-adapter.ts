import type { ProviderAdapter } from "@prcompass/core";

import { GitHubAdapter, type GitHubClientLike } from "../adapters/github.js";
import { LocalAdapter, type LocalAdapterOpts } from "../adapters/local.js";
import { parseGitHubTarget } from "../lib/github-target.js";

export interface ResolveAdapterInput {
  readonly repoDir: string;
  readonly diff?: string;
  readonly github?: string;
  readonly maxCommits?: number;
  /** Inject a fake `runGit` for tests; forwarded to whichever adapter is built. */
  readonly gitRunner?: LocalAdapterOpts["gitRunner"];
}

export interface ResolveAdapterDeps {
  readonly resolveToken: () => string;
  readonly createClient: (token: string) => GitHubClientLike;
}

/**
 * Picks and builds the `analyze` command's adapter from the CLI's raw
 * `--diff` / `--github` input. Split out from `cli.ts` (commander) so
 * the mutual-exclusion rules and the GitHub wiring are unit-testable
 * with injected fakes.
 */
export function resolveAdapter(
  input: ResolveAdapterInput,
  deps: ResolveAdapterDeps,
): ProviderAdapter {
  const hasDiff = input.diff !== undefined;
  const hasGitHub = input.github !== undefined;

  if (hasDiff && hasGitHub) {
    throw new Error("--diff and --github are mutually exclusive; pass exactly one.");
  }
  if (!hasDiff && !hasGitHub) {
    throw new Error("one of --diff or --github is required.");
  }

  if (hasGitHub) {
    const target = parseGitHubTarget(input.github as string);
    const token = deps.resolveToken();
    const client = deps.createClient(token);
    return new GitHubAdapter({
      repoDir: input.repoDir,
      owner: target.owner,
      repo: target.repo,
      prNumber: target.prNumber,
      client,
      ...(input.maxCommits !== undefined ? { maxCommits: input.maxCommits } : {}),
      ...(input.gitRunner !== undefined ? { gitRunner: input.gitRunner } : {}),
    });
  }

  return new LocalAdapter({
    repoDir: input.repoDir,
    diff: input.diff as string,
    ...(input.maxCommits !== undefined ? { maxCommits: input.maxCommits } : {}),
    ...(input.gitRunner !== undefined ? { gitRunner: input.gitRunner } : {}),
  });
}
