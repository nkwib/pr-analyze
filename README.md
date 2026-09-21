# @prcompass/cli

The PR Compass command-line interface. Runs the deterministic OSS analysis pipeline over a local git diff, or a GitHub pull request. Output is JSON by default; `--format human` for a terminal summary.

## Install

```bash
npm install -g @prcompass/cli
```

ESM-only. Requires Node 20+ and `git` available on `$PATH`.

## Quick start

Local diff (no network):

```bash
prcompass analyze --repo . --diff HEAD~1..HEAD
```

A single ref expands to `<ref>..HEAD`:

```bash
prcompass analyze --repo . --diff main
```

Human-friendly summary:

```bash
prcompass analyze --repo . --diff HEAD~1 --format human
```

A GitHub pull request, using a local clone that already has the PR's base and head commits fetched (e.g. via `gh pr checkout 42`):

```bash
GITHUB_TOKEN=... prcompass analyze --repo . --github nkwib/pr-analyze#42
```

`--diff` and `--github` are mutually exclusive; pass exactly one.

## What you get

A JSON object containing:

- `version` — `ANALYSIS_SCHEMA_VERSION` from `@prcompass/core`.
- `head.sha` / `head.baseSha` — resolved SHAs for the diff range.
- `pr`: PR metadata when `--github` is used, `null` for `--diff`.
- `diff.files` — per-file status, additions, deletions, and unified-diff patch.
- `mining` — bug-fix vs total commit stats over the repo history.
- `hotspots` — Bayesian-smoothed bug-fix density per file.
- `churn` — per-file commit count, bug-fix count, defect density, first/last touched.
- `cochange` — file×file co-modification graph (Jaccard + counts).
- `risk` — per-file combined risk score with `groundedIn` SHA pointers and caveats.
- `triage` — Tier 1 file-priority verdicts (`skip` / `skim` / `review-candidate`) from `@prcompass/pr-triage-filter`.

Every numeric claim in `risk` is grounded by real commit SHAs or is `null`. The CLI never fabricates.

## Adapters

`LocalAdapter` shells out to `git` against a local repository, no network I/O; used by `--diff`.

`GitHubAdapter`, used by `--github`, fetches the PR's title, body, author, and base/head SHAs from the GitHub REST API (implemented over global `fetch`, no `octokit` dependency), then delegates commit history and diff extraction to `LocalAdapter` against the local clone at `--repo`. This means:

- `pr` metadata is real GitHub API data.
- `mining`, `hotspots`, `churn`, `cochange`, and `risk` are computed the same way as `--diff`, from the local clone's `git log` and `git diff`, not from anything GitHub-only. They are only as complete as the clone: the PR's base and head commits must already be fetched (`gh pr checkout <n>`, or a manual `git fetch`).
- Auth: set `GITHUB_TOKEN` (or `GH_TOKEN`) in the environment. Never pass a token as a CLI argument.
- Errors: a missing token, a 401/403 from GitHub, a 404 (bad owner/repo/number, or no access), and rate limiting (read from `x-ratelimit-remaining` / `x-ratelimit-reset`) all fail with a specific message instead of a generic HTTP error.

## Releasing

1. Bump the version in package.json and add a CHANGELOG.md entry (where the repo keeps one).
2. Tag and push: git tag vX.Y.Z && git push origin vX.Y.Z.
3. .github/workflows/release.yml builds, tests, and runs npm publish --provenance for that tag. The tag must equal "v" plus the package.json version, otherwise the job stops before publishing.

One-time setup on npmjs.com (package Settings, Trusted Publisher): provider GitHub Actions, organization or user nkwib, repository pr-analyze, workflow filename release.yml, environment left blank. Under Allowed actions tick "Allow npm publish": a new trusted publisher only allows "npm stage publish" by default, and the workflow's direct npm publish then fails with "403 OIDC permission denied for this action". Set this when you create the connection: npm does not allow editing a trusted publisher afterwards, so a stage-only connection has to be deleted and added again.

## License

[Apache-2.0](./LICENSE).
