<script>
  const year = new Date().getFullYear();
</script>

<footer class="footer">
  <div class="inner">
    <div class="meta">
      <span class="brand-mark">@nkwib/pr-analyze</span>
      <span class="dot" aria-hidden="true">·</span>
      <span class="muted">Deterministic git-diff analysis on the command line</span>
    </div>
    <div class="links">
      <a href="https://github.com/nkwib/pr-analyze" target="_blank" rel="noopener">GitHub</a>
      <a href="https://www.npmjs.com/package/@nkwib/pr-analyze" target="_blank" rel="noopener">npm</a>
      <a
        href="https://github.com/nkwib/pr-analyze/blob/main/LICENSE"
        target="_blank"
        rel="noopener">MIT</a
      >
    </div>
    <div class="copyright">© {year} · Built with SvelteKit + MDsveX</div>
  </div>
</footer>

<style>
  .footer {
    border-top: 1px solid var(--c-border);
    background: var(--c-bg-alt);
    margin-top: var(--sp-9);
    padding: var(--sp-6) var(--sp-5);
  }

  .inner {
    max-width: var(--wide-max);
    margin: 0 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-4) var(--sp-6);
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
  }

  .meta { display: inline-flex; align-items: center; gap: var(--sp-3); }
  .brand-mark { font-family: var(--font-mono); color: var(--c-text); font-weight: 600; }
  .dot { color: var(--c-text-subtle); }
  .muted { color: var(--c-text-muted); }

  .links {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-5);
    margin-left: auto;
  }
  .links a { color: var(--c-text-muted); text-decoration: none; font-size: var(--fs-sm); }
  .links a:hover { color: var(--c-text); text-decoration: underline; }

  .copyright {
    color: var(--c-text-subtle);
    font-size: var(--fs-xs);
    flex-basis: 100%;
  }
</style>
