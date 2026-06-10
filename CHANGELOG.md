# Changelog

All notable changes to this package will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Pre-1.0 minor bumps may break compatibility.

## [Unreleased]

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

### Added

- GitHub Actions CI workflow (`typecheck`, `test`, `build`, `smoke`,
  dist-import smoke, and a docs-site build).
- `repository.url` now uses the canonical `git+https://` form.

## [0.1.0] — 2026-04-27

Initial public-release-ready version. Engine + CLI surface frozen for v0.1.x.
