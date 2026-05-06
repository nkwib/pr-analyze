import type {
  AnalyzeContext,
  AnalyzeContextPR,
  ProviderAdapter,
} from "../vendor/core/index.js";

import { LocalAdapter, type LocalAdapterOpts } from "./local.js";

/**
 * Minimal structural type for the GitHub REST PR endpoint. Lets the
 * adapter accept an Octokit instance without `@prcompass/cli` taking a
 * runtime dependency on `octokit` (keeps CLI install size lean).
 *
 * @public
 */
export interface GitHubClientLike {
  readonly rest: {
    readonly pulls: {
      get(opts: { owner: string; repo: string; pull_number: number }): Promise<{
        data: {
          title: string;
          body: string | null;
          number: number;
          user: { login: string } | null;
          base: { sha: string };
          head: { sha: string };
        };
      }>;
    };
  };
}

export interface GitHubAdapterOpts {
  /**
   * Path to a local clone of the repo. The clone must already have the
   * PR's base and head SHAs fetched (e.g. via `gh pr checkout <n>`).
   * The adapter does NOT clone — that's a caller responsibility, both
   * for performance reasons and so the user controls the credentials.
   */
  readonly repoDir: string;
  readonly owner: string;
  readonly repo: string;
  readonly prNumber: number;
  /**
   * An Octokit-shaped client. Provide your own (`new Octokit({ auth })`).
   * The adapter uses only `octokit.rest.pulls.get`.
   */
  readonly client: GitHubClientLike;
  /** Forwarded to the underlying `LocalAdapter`. */
  readonly maxCommits?: LocalAdapterOpts["maxCommits"];
  /** Forwarded to the underlying `LocalAdapter` for testing. */
  readonly gitRunner?: LocalAdapterOpts["gitRunner"];
}

/**
 * GitHub adapter. Fetches PR metadata via the GitHub REST API and
 * delegates commit history + diff extraction to the local clone via
 * {@link LocalAdapter}.
 *
 * Performs network I/O exactly once (for the PR metadata). Subsequent
 * git operations run against the local clone.
 *
 * @public
 */
export class GitHubAdapter implements ProviderAdapter {
  readonly name = "github";

  constructor(private readonly opts: GitHubAdapterOpts) {}

  async collect(): Promise<AnalyzeContext> {
    const { data: pr } = await this.opts.client.rest.pulls.get({
      owner: this.opts.owner,
      repo: this.opts.repo,
      pull_number: this.opts.prNumber,
    });

    const local = new LocalAdapter({
      repoDir: this.opts.repoDir,
      diff: `${pr.base.sha}..${pr.head.sha}`,
      ...(this.opts.maxCommits !== undefined
        ? { maxCommits: this.opts.maxCommits }
        : {}),
      ...(this.opts.gitRunner !== undefined
        ? { gitRunner: this.opts.gitRunner }
        : {}),
    });
    const ctx = await local.collect();

    const prMeta: AnalyzeContextPR = {
      title: pr.title,
      body: pr.body,
      number: pr.number,
      authorLogin: pr.user?.login ?? null,
    };

    return {
      commits: ctx.commits,
      diff: ctx.diff,
      pr: prMeta,
    };
  }
}
