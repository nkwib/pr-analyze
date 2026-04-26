# @prcompass/cli

The PR Compass command-line interface. Runs the deterministic OSS analysis pipeline over a local git diff or a GitHub PR. Output is JSON by default; `--format human` for a terminal summary.

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
- `pr` — PR metadata when a GitHub adapter was used; `null` for local mode.
- `diff.files` — per-file status, additions, deletions, and unified-diff patch.
- `mining` — bug-fix vs total commit stats over the repo history.
- `hotspots` — Bayesian-smoothed bug-fix density per file.
- `churn` — per-file commit count, bug-fix count, defect density, first/last touched.
- `cochange` — file×file co-modification graph (Jaccard + counts).
- `risk` — per-file combined risk score with `groundedIn` SHA pointers and caveats.
- `triage` — Tier 1 file-priority verdicts (`skip` / `skim` / `review-candidate`) from `@prcompass/pr-triage-filter`.

Every numeric claim in `risk` is grounded by real commit SHAs or is `null`. The CLI never fabricates.

## Adapters

`LocalAdapter` (default) shells out to `git` against a local repository. `GitHubAdapter` (programmatic API) enriches that with PR metadata via Octokit; you provide your own client and the local clone.

## License

[Apache-2.0](./LICENSE).
