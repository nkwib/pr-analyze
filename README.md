# @prcompass/cli

The PR Compass command-line interface. Runs the deterministic OSS analysis pipeline over a local git diff. Output is JSON by default; `--format human` for a terminal summary.

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

## What you get

A JSON object containing:

- `version` — `ANALYSIS_SCHEMA_VERSION` from `@prcompass/core`.
- `head.sha` / `head.baseSha` — resolved SHAs for the diff range.
- `pr` — PR metadata when a GitHub adapter is used programmatically; `null` for the CLI's local mode.
- `diff.files` — per-file status, additions, deletions, and unified-diff patch.
- `mining` — bug-fix vs total commit stats over the repo history.
- `hotspots` — Bayesian-smoothed bug-fix density per file.
- `churn` — per-file commit count, bug-fix count, defect density, first/last touched.
- `cochange` — file×file co-modification graph (Jaccard + counts).
- `risk` — per-file combined risk score with `groundedIn` SHA pointers and caveats.
- `triage` — Tier 1 file-priority verdicts (`skip` / `skim` / `review-candidate`) from `@prcompass/pr-triage-filter`.

Every numeric claim in `risk` is grounded by real commit SHAs or is `null`. The CLI never fabricates.

## Adapters

The CLI uses `LocalAdapter`, which shells out to `git` against a local repository — no network I/O. A `GitHubAdapter` is also exported from the programmatic API for callers who want to enrich a local diff with PR metadata via Octokit; the CLI does not yet expose it as a flag.

## Releasing

1. Bump the version in package.json and add a CHANGELOG.md entry (where the repo keeps one).
2. Tag and push: git tag vX.Y.Z && git push origin vX.Y.Z.
3. .github/workflows/release.yml builds, tests, and runs npm publish --provenance for that tag. The tag must equal "v" plus the package.json version, otherwise the job stops before publishing.

One-time setup on npmjs.com (package Settings, Trusted Publisher): provider GitHub Actions, organization or user nkwib, repository pr-analyze, workflow filename release.yml, environment left blank. Under Allowed actions tick "Allow npm publish": a new trusted publisher only allows "npm stage publish" by default, and the workflow's direct npm publish then fails with "403 OIDC permission denied for this action". Set this when you create the connection: npm does not allow editing a trusted publisher afterwards, so a stage-only connection has to be deleted and added again.

## License

[Apache-2.0](./LICENSE).
