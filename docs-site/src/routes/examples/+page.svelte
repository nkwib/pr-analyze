<svelte:head>
  <title>@prcompass/cli — examples</title>
  <meta
    name="description"
    content="jq recipes, GitHub Actions, CI gates, and programmatic integrations using @prcompass/cli."
  />
</svelte:head>

<div class="ex-page">
  <header class="ex-hero">
    <a href="/" class="back-link">← Back to home</a>
    <h1>Examples</h1>
    <p class="lede">
      Real invocations grouped by where this CLI tends to land —
      <code>jq</code> on the terminal, GitHub Actions in CI, programmatic
      use from Node.
    </p>
  </header>

  <section class="ex">
    <div class="ex-head">
      <span class="tag">1</span>
      <h2>One-liners with jq</h2>
    </div>
    <p class="ex-desc">
      The default JSON output is designed for piping. These are the recipes
      that come up most often when reading the result by hand.
    </p>
    <pre class="code-block language-bash" data-lang="bash"><code>{`# Triage histogram: how many files of each verdict?
prcompass analyze --repo . --diff HEAD~1 \\
  | jq '.triage.verdicts | group_by(.verdict) | map({verdict: .[0].verdict, n: length})'

# Top 5 risk-scored files
prcompass analyze --repo . --diff main..HEAD \\
  | jq '.risk.byFile
        | to_entries
        | sort_by(-.value.score)
        | .[0:5]
        | map({path: .key, score: .value.score, tier: .value.tier})'

# Files that are both review-candidate AND high-risk — the sharp end of the cone
prcompass analyze --repo . --diff main..HEAD \\
  | jq '
    [.triage.verdicts[]
      | select(.verdict == "review-candidate")
      | .path] as $review
    | .risk.byFile
    | to_entries
    | map(select(.value.tier == "high" and (.key | IN($review[]))))
    | map(.key)
  '

# Just the headline: count of files, hotspot top, risk top
prcompass analyze --repo . --diff HEAD~1 \\
  | jq '{
      files: .diff.fileCount,
      hotspot: (.hotspots.byFile | to_entries | sort_by(-.value.score) | .[0]),
      riskTop: (.risk.byFile  | to_entries | sort_by(-.value.score) | .[0])
    }'
`}</code></pre>
  </section>

  <section class="ex">
    <div class="ex-head">
      <span class="tag">2</span>
      <h2>GitHub Action — fail on high-risk files</h2>
    </div>
    <p class="ex-desc">
      The CLI itself never gates on what it found — that is policy. Wrap it
      in a job that turns the JSON into a pass/fail. This action fails the
      check if any review-candidate file scores in the high-risk tier.
    </p>
    <pre class="code-block language-yaml" data-lang="yaml"><code>{`# .github/workflows/risk-gate.yml
name: PR risk gate

on:
  pull_request:
    branches: [main]

jobs:
  risk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }   # full history needed for churn / cochange

      - uses: actions/setup-node@v4
        with: { node-version: '22' }

      - name: Install jq
        run: sudo apt-get install -y jq

      - name: Run analysis
        run: |
          npx --yes @prcompass/cli analyze \\
            --repo . \\
            --diff origin/main..HEAD \\
            > analysis.json

      - name: Gate on high-risk review-candidates
        run: |
          HIGH_RISK_REVIEW=$(jq '
            [.triage.verdicts[]
              | select(.verdict == "review-candidate")
              | .path] as $review
            | .risk.byFile
            | to_entries
            | map(select(.value.tier == "high" and (.key | IN($review[]))))
            | length
          ' analysis.json)

          echo "High-risk review-candidates: $HIGH_RISK_REVIEW"
          if [ "$HIGH_RISK_REVIEW" -gt 0 ]; then
            echo "::error::PR touches files flagged high risk; require an extra reviewer."
            exit 1
          fi

      - uses: actions/upload-artifact@v4
        with:
          name: prcompass-analysis
          path: analysis.json
`}</code></pre>
  </section>

  <section class="ex">
    <div class="ex-head">
      <span class="tag">3</span>
      <h2>Programmatic — analyse a remote PR</h2>
    </div>
    <p class="ex-desc">
      The <code>GitHubAdapter</code> needs both a local clone (for the engine
      to walk history) and a PR number (for metadata enrichment). Bring your
      own Octokit so auth and rate-limits stay under your control.
    </p>
    <pre class="code-block language-typescript" data-lang="typescript"><code>{`// scripts/analyze-pr.ts
import { GitHubAdapter, runAnalyzeCommand, formatJson } from '@prcompass/cli';
import { Octokit } from '@octokit/rest';
import { resolve } from 'node:path';

const REPO_DIR = resolve('./checkout');  // local clone you cloned beforehand
const PULL = Number(process.argv[2]);
if (!Number.isFinite(PULL)) throw new Error('usage: analyze-pr <pr-number>');

const adapter = new GitHubAdapter({
  repoDir: REPO_DIR,
  octokit: new Octokit({ auth: process.env.GITHUB_TOKEN }),
  owner: 'nkwib',
  repo: 'prcompass-cli',
  pullNumber: PULL
});

const output = await runAnalyzeCommand(adapter);
process.stdout.write(formatJson(output, { pretty: true }) + '\\n');
`}</code></pre>
  </section>

  <section class="ex">
    <div class="ex-head">
      <span class="tag">4</span>
      <h2>NDJSON: one line per analysis run</h2>
    </div>
    <p class="ex-desc">
      Long-running comparisons (every PR over 6 months, every commit on main
      in a quarter) are easier to consume as NDJSON. Default output is
      already compact JSON — append a newline and you're good.
    </p>
    <pre class="code-block language-bash" data-lang="bash"><code>{`# Walk every commit on main, one analysis per line
git rev-list main | head -200 | while read SHA; do
  prcompass analyze --repo . --diff "\${SHA}~1..\${SHA}" 2>/dev/null
  echo
done > main-walk.ndjson

# Then read it row-by-row
jq -c '{sha: .head.sha, riskCount: (.risk.byFile | length)}' main-walk.ndjson
`}</code></pre>
  </section>

  <section class="ex">
    <div class="ex-head">
      <span class="tag">5</span>
      <h2>Smoke test the binary on this monorepo</h2>
    </div>
    <p class="ex-desc">
      The repo ships a <code>smoke</code> npm script that runs the freshly
      built binary against the workspace itself. Useful to sanity-check
      changes to <code>analyze.ts</code>, the formatters, or the adapters.
    </p>
    <pre class="code-block language-bash" data-lang="bash"><code>{`# From the prcompass-cli repo
npm run build
npm run smoke
# → node dist/cli.js analyze --local --repo ../.. --diff HEAD~1
`}</code></pre>
  </section>

  <section class="cta-band">
    <h2>Got an integration not covered here?</h2>
    <p>The API surface is intentionally small. Open an issue with your use case — the answer is usually one <code>jq</code> filter.</p>
    <div class="cta">
      <a class="btn primary" href="/docs">Read the guide</a>
      <a class="btn ghost" href="/api">Programmatic API</a>
    </div>
  </section>
</div>

<style>
  .ex-page { max-width: var(--wide-max); margin: 0 auto; padding: var(--sp-7) var(--sp-5) var(--sp-9); }
  .ex-hero { max-width: 50rem; margin: 0 auto var(--sp-7); text-align: center; }

  .back-link {
    display: inline-block;
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    text-decoration: none;
    margin-bottom: var(--sp-4);
  }
  .back-link:hover { color: var(--c-text); text-decoration: underline; }

  h1 {
    font-size: clamp(2rem, 4.5vw, var(--fs-3xl));
    margin-bottom: var(--sp-3);
    margin-top: 0;
    letter-spacing: -0.03em;
  }

  .lede { color: var(--c-text-muted); font-size: var(--fs-md); margin: 0; }

  .ex {
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--r-lg);
    padding: var(--sp-5) var(--sp-6);
    margin-bottom: var(--sp-6);
    box-shadow: var(--sh-sm);
  }

  .ex-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-bottom: var(--sp-3);
  }

  .ex-head h2 { margin: 0; font-size: var(--fs-lg); letter-spacing: -0.02em; }

  .tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px; height: 26px;
    border-radius: 999px;
    background: var(--c-accent);
    color: var(--c-accent-fg);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    font-weight: 600;
  }

  .ex-desc {
    color: var(--c-text-muted);
    margin: 0 0 var(--sp-3);
    font-size: var(--fs-sm);
  }

  .ex pre.code-block { margin: 0; }

  .cta-band {
    text-align: center;
    padding: var(--sp-7) 0 0;
    max-width: 40rem;
    margin: 0 auto;
  }

  .cta-band h2 { font-size: var(--fs-xl); margin-bottom: var(--sp-2); margin-top: 0; }
  .cta-band p { color: var(--c-text-muted); margin-bottom: var(--sp-4); }

  .cta { display: flex; gap: var(--sp-3); justify-content: center; flex-wrap: wrap; }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 0.65rem 1.1rem;
    border-radius: var(--r-md);
    font-size: var(--fs-sm);
    font-weight: 500;
    text-decoration: none;
    border: 1px solid transparent;
  }

  .btn.primary { background: var(--c-text); color: var(--c-bg); border-color: var(--c-text); }
  .btn.primary:hover { background: var(--c-accent); border-color: var(--c-accent); color: var(--c-accent-fg); text-decoration: none; }
  .btn.ghost { background: transparent; color: var(--c-text); border-color: var(--c-border-strong); }
  .btn.ghost:hover { background: var(--c-bg-alt); text-decoration: none; }
</style>
