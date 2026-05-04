<script>
  let { size = 28 } = $props();
</script>

<span class="logo" style="--s: {size}px">
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    aria-hidden="true"
    role="img"
    fill="none"
  >
    <rect x="3" y="3" width="26" height="26" rx="5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
    <path d="M9 12 L13 16 L9 20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    <line x1="15" y1="20" x2="23" y2="20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  </svg>
  <span class="wordmark">prcompass</span>
</span>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    color: var(--c-text);
    font-weight: 600;
    letter-spacing: -0.02em;
    font-size: 1.05rem;
  }

  .wordmark {
    font-family: var(--font-mono);
    font-size: 0.95rem;
  }
</style>
