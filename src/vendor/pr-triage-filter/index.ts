/**
 * Vendored, minimal implementation of the Tier 1 PR triage filter.
 *
 * Originally consumed from `@prcompass/pr-triage-filter` (an unpublished
 * workspace package). Vendoring a small deterministic classifier keeps
 * the CLI installable from npm without depending on a private package.
 *
 * Verdicts:
 *   - `skip` — generated/lockfile/build-artifact paths a reviewer can ignore.
 *   - `skim` — config, docs, fixtures: usually a quick visual check.
 *   - `review-candidate` — source code worth real review attention.
 *
 * @public
 */

export type ChangeType = "added" | "modified" | "deleted" | "renamed" | "copied";

export type Verdict = "skip" | "skim" | "review-candidate";

export interface TriageFile {
  readonly path: string;
  readonly previousPath?: string;
  readonly changeType: ChangeType;
  readonly additions: number;
  readonly deletions: number;
  readonly patch?: string;
}

export interface TriageInput {
  readonly files: readonly TriageFile[];
}

export interface FileVerdict {
  readonly path: string;
  readonly verdict: Verdict;
  readonly reason: string;
}

export interface ClassifyResult {
  readonly verdicts: readonly FileVerdict[];
}

const SKIP_BASENAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "composer.lock",
  "go.sum",
  "cargo.lock",
  "gemfile.lock",
  "poetry.lock",
  "uv.lock",
]);

const SKIP_PATH_PATTERNS: readonly RegExp[] = [
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)node_modules\//,
  /(^|\/)\.next\//,
  /(^|\/)coverage\//,
  /(^|\/)\.cache\//,
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.snap$/,
];

const SKIM_PATH_PATTERNS: readonly RegExp[] = [
  /(^|\/)docs?\//i,
  /\.md$/i,
  /\.mdx$/i,
  /\.txt$/i,
  /(^|\/)CHANGELOG(\.md)?$/i,
  /(^|\/)README(\.md)?$/i,
  /(^|\/)LICENSE(\.[a-z]+)?$/i,
  /\.json$/i,
  /\.ya?ml$/i,
  /\.toml$/i,
  /\.ini$/i,
  /(^|\/)fixtures?\//i,
  /__fixtures__/i,
];

function basename(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? p : p.slice(idx + 1);
}

/**
 * Classify each file in the PR. Deterministic — same input always
 * yields the same `ClassifyResult`.
 *
 * @public
 */
export function classifyPrFiles(input: TriageInput): ClassifyResult {
  const verdicts: FileVerdict[] = [];
  for (const f of input.files) {
    const lower = f.path.toLowerCase();
    const base = basename(lower);

    if (SKIP_BASENAMES.has(base)) {
      verdicts.push({
        path: f.path,
        verdict: "skip",
        reason: `lockfile or generated artifact (${base})`,
      });
      continue;
    }

    let skipped = false;
    for (const re of SKIP_PATH_PATTERNS) {
      if (re.test(f.path)) {
        verdicts.push({
          path: f.path,
          verdict: "skip",
          reason: `generated or build artifact path (${re.source})`,
        });
        skipped = true;
        break;
      }
    }
    if (skipped) continue;

    let skimmed = false;
    for (const re of SKIM_PATH_PATTERNS) {
      if (re.test(f.path)) {
        verdicts.push({
          path: f.path,
          verdict: "skim",
          reason: `docs/config/fixture (${re.source})`,
        });
        skimmed = true;
        break;
      }
    }
    if (skimmed) continue;

    verdicts.push({
      path: f.path,
      verdict: "review-candidate",
      reason: "source code change",
    });
  }
  return { verdicts };
}
