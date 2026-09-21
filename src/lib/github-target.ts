export interface GitHubTarget {
  readonly owner: string;
  readonly repo: string;
  readonly prNumber: number;
}

const TARGET_RE = /^([^/\s#]+)\/([^/\s#]+)#(\d+)$/;

/**
 * Parses the `--github <owner>/<repo>#<number>` CLI flag. Kept separate
 * from `cli.ts` so it is unit-testable without going through commander.
 */
export function parseGitHubTarget(raw: string): GitHubTarget {
  const match = TARGET_RE.exec(raw.trim());
  if (match === null) {
    throw new Error(
      `--github must look like "<owner>/<repo>#<number>" (e.g. "nkwib/pr-analyze#42"), got: ${raw}`,
    );
  }
  const [, owner, repo, prNumberRaw] = match;
  const prNumber = Number(prNumberRaw);
  if (!Number.isSafeInteger(prNumber) || prNumber < 1) {
    throw new Error(`--github PR number must be a positive integer, got: ${prNumberRaw}`);
  }
  return { owner: owner as string, repo: repo as string, prNumber };
}
