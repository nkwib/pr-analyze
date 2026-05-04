<svelte:head>
  <title>@prcompass/cli — deterministic git-diff analysis on the command line</title>
  <meta
    name="description"
    content="Run the deterministic OSS analysis pipeline over a local git diff or a GitHub PR. Triage + churn + cochange + hotspots + risk in one command."
  />
</svelte:head>

<section class="hero">
  <div class="hero-grid">
    <div class="hero-copy">
      <span class="badge">
        <span class="dot" aria-hidden="true"></span>
        v0.1 · Apache-2.0 · Node 20+ · git on $PATH
      </span>
      <h1>
        One command.<br />
        <span class="accent">Every</span> deterministic signal in your&nbsp;diff.
      </h1>
      <p class="lede">
        <strong>@prcompass/cli</strong> runs the PR Compass deterministic
        engine — triage, churn, co-change, hotspots, risk — over any git
        range. JSON to <code>stdout</code>, or
        <code>--format human</code> for a quick terminal summary.
      </p>

      <div class="cta">
        <a class="btn primary" href="/docs">Read the docs</a>
        <a class="btn ghost" href="/commands">Command reference</a>
      </div>

      <pre class="install"><span class="prompt">$</span> npm install -g @prcompass/cli</pre>
    </div>

    <aside class="demo">
      <div class="demo-tab">
        <span class="dots" aria-hidden="true">
          <i></i><i></i><i></i>
        </span>
        <span class="filename">terminal</span>
      </div>
      <pre class="demo-code"><code><span class="prompt">$</span> <span class="fn">prcompass</span> analyze <span class="opt">--repo</span> . <span class="opt">--diff</span> main..HEAD <span class="opt">--format</span> human

<span class="cmt">PR Compass · local · 14 commits · base abc1234 → head def5678</span>

  <span class="kw">triage</span>     8 files · 3 skip · 2 skim · 3 review-candidate
  <span class="kw">hotspots</span>   src/billing/checkout.ts (0.74) · src/auth/session.ts (0.61)
  <span class="kw">cochange</span>   src/billing/checkout.ts ↔ src/billing/invoice.ts (J=0.82, 18×)
  <span class="kw">risk</span>       src/billing/checkout.ts → 0.78 (high)
                grounded in 12 commits over 9 months

<span class="cmt">→ next: pipe JSON into your tier-2 reviewer</span>
<span class="prompt">$</span> <span class="fn">prcompass</span> analyze <span class="opt">--repo</span> . <span class="opt">--diff</span> HEAD~1 | <span class="fn">jq</span> <span class="str">.risk.byFile</span>
</code></pre>
    </aside>
  </div>
</section>

<section class="features">
  <div class="features-inner">
    <div class="feature">
      <div class="feature-icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </div>
      <h3>One subcommand, one job</h3>
      <p>
        <code>analyze</code>. Takes a repo path and a diff range. Returns a
        single JSON document with every metric the deterministic engine
        produces.
      </p>
    </div>

    <div class="feature">
      <div class="feature-icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" />
          <path d="M12 7v6l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </div>
      <h3>Deterministic</h3>
      <p>
        No clock, no PRNG, no network. Same repo state plus same range →
        bit-identical JSON. Re-runs always agree.
      </p>
    </div>

    <div class="feature">
      <div class="feature-icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 5h18M3 12h18M3 19h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </div>
      <h3>Pipe-friendly</h3>
      <p>
        Default output is compact JSON to <code>stdout</code> — chain it with
        <code>jq</code>, store as NDJSON, or feed straight into a downstream
        tier. <code>--pretty</code> for humans, <code>--format human</code>
        for terminals.
      </p>
    </div>

    <div class="feature">
      <div class="feature-icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        </svg>
      </div>
      <h3>Grounded numbers</h3>
      <p>
        Every claim in <code>risk</code> points to real commit SHAs in
        <code>groundedIn</code> — or it's <code>null</code>. Never a
        hallucinated <code>0</code>; never an unsupported score.
      </p>
    </div>

    <div class="feature">
      <div class="feature-icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <h3>Local + GitHub</h3>
      <p>
        <code>LocalAdapter</code> shells out to <code>git</code> — no network.
        <code>GitHubAdapter</code> (programmatic) enriches with PR metadata
        via your own Octokit.
      </p>
    </div>

    <div class="feature">
      <div class="feature-icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 12h4l3-9 4 18 3-9h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <h3>Fast core, lazy I/O</h3>
      <p>
        Engine work is ~7&nbsp;ms over 10k commits.
        <code>git&nbsp;log</code> dominates wall-clock — exactly as it should
        for a local CLI.
      </p>
    </div>
  </div>
</section>

<section class="ports">
  <div class="ports-inner">
    <div class="ports-copy">
      <h2>Single-source-of-truth output</h2>
      <p>
        Versioned via <code>ANALYSIS_SCHEMA_VERSION</code>. Pin the major
        version when you integrate; new metrics arrive as new top-level keys
        and never break parsers.
      </p>
      <a class="btn ghost compact" href="/output-schema"
        >Output schema
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </a>
    </div>
    <pre class="ports-code"><code><span class="cmt">// One document. Stable top-level keys.</span>
&lbrace;
  <span class="prop">"version"</span>:   <span class="str">"0.1.0"</span>,
  <span class="prop">"head"</span>:      &lbrace; <span class="prop">"sha"</span>: <span class="str">"def…"</span>, <span class="prop">"baseSha"</span>: <span class="str">"abc…"</span> &rbrace;,
  <span class="prop">"pr"</span>:        <span class="kw">null</span>,
  <span class="prop">"diff"</span>:      &lbrace; <span class="prop">"fileCount"</span>: <span class="num">8</span>, <span class="prop">"files"</span>: [...] &rbrace;,
  <span class="prop">"mining"</span>:    &lbrace; ... &rbrace;,
  <span class="prop">"hotspots"</span>:  &lbrace; ... &rbrace;,
  <span class="prop">"churn"</span>:     &lbrace; ... &rbrace;,
  <span class="prop">"cochange"</span>:  &lbrace; ... &rbrace;,
  <span class="prop">"risk"</span>:      &lbrace; ... &rbrace;,
  <span class="prop">"triage"</span>:    &lbrace; <span class="prop">"verdicts"</span>: [...] &rbrace;,
  <span class="prop">"adapter"</span>:   &lbrace; <span class="prop">"name"</span>: <span class="str">"local"</span> &rbrace;
&rbrace;
</code></pre>
  </div>
</section>

<section class="cta-band">
  <div class="cta-band-inner">
    <h2>Read your repo, not your luck.</h2>
    <p>Every metric grounded by a SHA. Every run reproducible. JSON-first.</p>
    <div class="cta">
      <a class="btn primary" href="/docs">Read the guide</a>
      <a class="btn ghost" href="/examples">See examples</a>
    </div>
  </div>
</section>

<style>
  .hero {
    padding: var(--sp-9) var(--sp-5) var(--sp-8);
    background:
      radial-gradient(circle at 80% -10%, var(--c-accent-soft), transparent 50%),
      radial-gradient(circle at 0% 100%, var(--c-bg-alt), transparent 60%),
      var(--c-bg);
    border-bottom: 1px solid var(--c-border);
  }

  .hero-grid {
    max-width: var(--wide-max);
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    gap: var(--sp-7);
    align-items: center;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    color: var(--c-text-muted);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 4px 10px;
    border-radius: 999px;
    box-shadow: var(--sh-sm);
    margin-bottom: var(--sp-5);
  }

  .badge .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    background: var(--c-good);
    border-radius: 999px;
  }

  .hero h1 {
    font-size: clamp(2.25rem, 4.5vw, var(--fs-4xl));
    line-height: 1.05;
    letter-spacing: -0.04em;
    margin-bottom: var(--sp-5);
  }

  .accent {
    color: var(--c-accent);
    font-style: italic;
    font-weight: 700;
  }

  .lede {
    font-size: var(--fs-md);
    color: var(--c-text-muted);
    max-width: 42ch;
    margin-bottom: var(--sp-6);
  }

  .lede strong {
    color: var(--c-text);
    font-weight: 600;
  }

  .cta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
    margin-bottom: var(--sp-5);
  }

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

  .btn.primary {
    background: var(--c-text);
    color: var(--c-bg);
    border-color: var(--c-text);
  }

  .btn.primary:hover {
    background: var(--c-accent);
    border-color: var(--c-accent);
    color: var(--c-accent-fg);
    text-decoration: none;
  }

  .btn.ghost {
    background: transparent;
    color: var(--c-text);
    border-color: var(--c-border-strong);
  }

  .btn.ghost:hover {
    background: var(--c-bg-alt);
    text-decoration: none;
  }

  .btn.compact {
    padding: 0.5rem 0.85rem;
    font-size: var(--fs-sm);
  }

  .install {
    display: inline-block;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--r-md);
    padding: var(--sp-2) var(--sp-4);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    color: var(--c-text);
    box-shadow: var(--sh-sm);
    margin: 0;
  }

  .install .prompt {
    color: var(--c-text-subtle);
    margin-right: var(--sp-2);
    user-select: none;
  }

  .demo {
    background: var(--c-code-bg);
    border: 1px solid var(--c-border);
    border-radius: var(--r-lg);
    box-shadow: var(--sh-lg);
    overflow: hidden;
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
  }

  .demo-tab {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    border-bottom: 1px solid var(--c-border);
    background: var(--c-bg-alt);
    color: var(--c-text-subtle);
    font-size: var(--fs-xs);
  }

  .dots { display: inline-flex; gap: 6px; }
  .dots i { width: 10px; height: 10px; border-radius: 999px; background: var(--c-border-strong); display: inline-block; }
  .dots i:nth-child(1) { background: var(--c-accent); opacity: 0.55; }
  .dots i:nth-child(2) { background: #f59e0b; opacity: 0.55; }
  .dots i:nth-child(3) { background: var(--c-good); opacity: 0.55; }

  .filename { font-family: var(--font-mono); }

  .demo-code {
    margin: 0;
    padding: var(--sp-5);
    background: transparent;
    color: var(--c-code-text);
    overflow-x: auto;
    font-size: var(--fs-sm);
    line-height: 1.7;
    font-family: var(--font-mono);
  }

  .demo-code code { background: transparent; border: 0; padding: 0; color: inherit; font-family: var(--font-mono); font-size: inherit; }
  .demo-code .kw   { color: var(--c-code-keyword); }
  .demo-code .str  { color: var(--c-code-string); }
  .demo-code .fn   { color: var(--c-code-fn); }
  .demo-code .cmt  { color: var(--c-code-comment); font-style: italic; }
  .demo-code .opt  { color: var(--c-code-prop); }
  .demo-code .prompt { color: var(--c-text-subtle); margin-right: 0.4em; user-select: none; }

  .features {
    padding: var(--sp-9) var(--sp-5);
  }

  .features-inner {
    max-width: var(--wide-max);
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--sp-5);
  }

  .feature {
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    padding: var(--sp-5);
    border-radius: var(--r-lg);
  }

  .feature-icon {
    width: 36px; height: 36px;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--c-bg-alt); border: 1px solid var(--c-border);
    border-radius: var(--r-md); color: var(--c-accent);
    margin-bottom: var(--sp-4);
  }

  .feature-icon svg { width: 18px; height: 18px; }

  .feature h3 { font-size: var(--fs-md); margin: 0 0 var(--sp-2); letter-spacing: -0.02em; }
  .feature p { color: var(--c-text-muted); margin: 0; font-size: var(--fs-sm); line-height: 1.65; }

  .ports {
    padding: var(--sp-8) var(--sp-5);
    background: var(--c-bg-alt);
    border-top: 1px solid var(--c-border);
    border-bottom: 1px solid var(--c-border);
  }

  .ports-inner {
    max-width: var(--wide-max);
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 1.2fr;
    gap: var(--sp-7);
    align-items: center;
  }

  .ports-copy h2 { margin: 0 0 var(--sp-3); font-size: var(--fs-2xl); letter-spacing: -0.03em; }
  .ports-copy p { color: var(--c-text-muted); margin-bottom: var(--sp-5); font-size: var(--fs-md); }

  .ports-code {
    margin: 0;
    background: var(--c-code-bg);
    border: 1px solid var(--c-border);
    border-radius: var(--r-lg);
    padding: var(--sp-5);
    overflow-x: auto;
    color: var(--c-code-text);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    line-height: 1.65;
    box-shadow: var(--sh-md);
  }

  .ports-code code { background: transparent; border: 0; padding: 0; color: inherit; font-family: var(--font-mono); }
  .ports-code .kw   { color: var(--c-code-keyword); }
  .ports-code .str  { color: var(--c-code-string); }
  .ports-code .cmt  { color: var(--c-code-comment); font-style: italic; }
  .ports-code .prop { color: var(--c-code-prop); }
  .ports-code .num  { color: var(--c-code-num); }

  .cta-band {
    padding: var(--sp-9) var(--sp-5);
    text-align: center;
  }

  .cta-band-inner {
    max-width: 40rem;
    margin: 0 auto;
  }

  .cta-band h2 { font-size: var(--fs-2xl); margin-bottom: var(--sp-2); letter-spacing: -0.03em; }
  .cta-band p { color: var(--c-text-muted); margin-bottom: var(--sp-5); font-size: var(--fs-md); }
  .cta-band .cta { justify-content: center; }

  @media (max-width: 960px) {
    .hero { padding: var(--sp-7) var(--sp-5) var(--sp-7); }
    .hero-grid { grid-template-columns: 1fr; gap: var(--sp-6); }
    .features-inner { grid-template-columns: 1fr; }
    .ports-inner { grid-template-columns: 1fr; }
  }

  @media (max-width: 720px) {
    .hero h1 { font-size: clamp(2rem, 8vw, 2.6rem); }
  }
</style>
