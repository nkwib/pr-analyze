import type { GitHubClientLike } from "../adapters/github.js";

const GITHUB_API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";

type PullResponseData = Awaited<
  ReturnType<GitHubClientLike["rest"]["pulls"]["get"]>
>["data"];

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

/**
 * Reads the GitHub token from the environment. `GITHUB_TOKEN` is the
 * primary variable; `GH_TOKEN` (the `gh` CLI's own variable) is
 * accepted as a fallback so users who already have `gh` configured
 * don't need a second secret. Never accept a token as a CLI argument.
 */
export function resolveGitHubToken(env: NodeJS.ProcessEnv): string {
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  if (token === undefined || token.length === 0) {
    throw new Error(
      "--github requires a GitHub token: set the GITHUB_TOKEN environment variable (GH_TOKEN also works).",
    );
  }
  return token;
}

export interface FetchGitHubClientOpts {
  readonly token: string;
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
}

/**
 * `GitHubClientLike` implemented over global `fetch` instead of
 * `octokit`, so the CLI stays dependency-free. Only the one endpoint
 * `GitHubAdapter` calls (`GET /repos/{owner}/{repo}/pulls/{number}`) is
 * implemented.
 */
export function createFetchGitHubClient(opts: FetchGitHubClientOpts): GitHubClientLike {
  const doFetch = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl ?? GITHUB_API_BASE;

  return {
    rest: {
      pulls: {
        async get({ owner, repo, pull_number }) {
          const url = `${baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pull_number}`;
          const res = await doFetch(url, {
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${opts.token}`,
              "X-GitHub-Api-Version": API_VERSION,
              "User-Agent": "prcompass-cli",
            },
          });
          if (!res.ok) {
            throw await buildApiError(res, owner, repo, pull_number);
          }
          const data = (await res.json()) as PullResponseData;
          return { data };
        },
      },
    },
  };
}

async function buildApiError(
  res: Response,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<GitHubApiError> {
  const remaining = res.headers.get("x-ratelimit-remaining");
  const reset = res.headers.get("x-ratelimit-reset");

  if (res.status === 403 && remaining === "0") {
    const resetAt = reset !== null ? new Date(Number(reset) * 1000).toISOString() : "unknown";
    return new GitHubApiError(
      `GitHub API rate limit exceeded; resets at ${resetAt}.`,
      res.status,
    );
  }
  if (res.status === 401 || res.status === 403) {
    return new GitHubApiError(
      `GitHub API rejected the request (${res.status}); check that the token has access to ${owner}/${repo}.`,
      res.status,
    );
  }
  if (res.status === 404) {
    return new GitHubApiError(
      `pull request ${owner}/${repo}#${prNumber} not found (404); check owner, repo, PR number, and that the token can see the repo.`,
      res.status,
    );
  }
  const body = await safeText(res);
  return new GitHubApiError(`GitHub API request failed (${res.status}): ${body}`, res.status);
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<no body>";
  }
}
