# Changelog

All notable changes to this package will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Pre-1.0 minor bumps may break compatibility.

## [Unreleased]

### Added

- `prcompass analyze --github <owner>/<repo>#<number>` analyzes a GitHub pull
  request, mutually exclusive with `--diff`. It fetches PR metadata (title,
  body, author, base/head SHAs) from the GitHub REST API via a `fetch`-based
  `GitHubClientLike` (no `octokit` dependency added), then reuses
  `LocalAdapter` against the local clone at `--repo` for commit history and
  the diff itself, so `mining`, `hotspots`, `churn`, `cochange`, and `risk`
  are computed identically to `--diff`, not from anything GitHub-only. The
  clone must already have the PR's base and head commits fetched (e.g.
  `gh pr checkout <n>`). Auth reads `GITHUB_TOKEN` (falls back to
  `GH_TOKEN`) from the environment; never accepted as a CLI argument.

### Changed

- Replaced the vendored, trimmed reimplementations of the analysis engine
  (`src/vendor/core`) and the triage filter (`src/vendor/pr-triage-filter`)
  with real dependencies on `@prcompass/core` and
  `@prcompass/pr-triage-filter` (both `^0.2.0`), now that they are published
  on npm. `src/commands/analyze.ts` maps the published `AnalysisOutput` and
  `ClassifyResult` shapes onto the CLI's existing, unchanged JSON contract.
- `mining.bugFixCommits`, `churn.byFile[*].bugFixCommits`,
  `hotspots[*].density`, `risk.byFile[*].score`, and
  `risk.byFile[*].defectDensity.value` now come from the real engine's
  bug-fix heuristic and smoothing/weighting formulas instead of the frozen
  vendored copy: expect different (and more accurate) numbers on the same
  input, not just a refactor.
- `cochange.edges` now applies the published engine's minimum-co-change
  threshold and mass-refactor commit filter, so it reports fewer, more
  meaningful edges than the vendored copy did.
- `triage.verdicts` now uses the published rule set, which classifies test
  files, `.gitignore`, and CI workflow files more accurately than the
  vendored copy did at extraction time.
- `pr-analyze` maps the published triage filter's `ChangeType` (no
  `copied` member) by treating `copied` files as `renamed`, since both
  describe content that arrived from another path.

### Fixed

- Documentation site now advertises the published npm names (`@prcompass/cli`,
  `@prcompass/core`, `@prcompass/pr-triage-filter`) and working install/`npx`
  invocations.
- Documentation site output-schema and API references now match the real
  types: `GitHubAdapter` options (`client` / `prNumber`), `risk.byFile`
  (`{ score, defectDensity: { value, groundedIn }, caveats }`, no `tier`),
  `churn.byFile` fields, `diff` (`{ fileCount }` only), `pr`, `mining`,
  `triage.verdicts` (`{ path, verdict, reason }`, no `ruleId`), plus the
  `risk.files` / `churn.files` sibling arrays.
- Removed the stale "package is `private: true`" claim from the guide.
- Docs-site meta descriptions no longer imply the CLI itself can analyze a
  GitHub PR; GitHub PR enrichment is programmatic-only, via `GitHubAdapter`.

### Added

- GitHub Actions CI workflow (`typecheck`, `test`, `build`, `smoke`,
  dist-import smoke, and a docs-site build).
- `repository.url` now uses the canonical `git+https://` form.
- `package.json` now sets `homepage` to the GitHub repository.

## [0.1.0] — 2026-04-27

Initial public-release-ready version. Engine + CLI surface frozen for v0.1.x.
