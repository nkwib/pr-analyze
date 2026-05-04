<script>
  import Sidebar from '$lib/components/Sidebar.svelte';

  let { children } = $props();

  const sections = [
    {
      label: 'Guide',
      items: [
        { href: '/docs', label: 'Overview' },
        { href: '/docs#install', label: 'Install' },
        { href: '/docs#quick-start', label: 'Quick start' },
        { href: '/docs#diff-range', label: 'Diff range syntax' },
        { href: '/docs#adapters', label: 'Adapters' },
        { href: '/docs#exit-codes', label: 'Exit codes' }
      ]
    },
    {
      label: 'Reference',
      items: [
        { href: '/commands', label: 'Commands' },
        { href: '/output-schema', label: 'Output schema' },
        { href: '/api', label: 'Programmatic API' }
      ]
    }
  ];
</script>

<div class="docs-shell">
  <Sidebar {sections} />
  <article class="docs-article">
    {@render children()}
  </article>
</div>

<style>
  .docs-shell {
    max-width: var(--wide-max);
    margin: 0 auto;
    padding: 0 var(--sp-5);
    display: grid;
    grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
    gap: var(--sp-7);
    align-items: start;
  }

  .docs-article {
    padding: var(--sp-7) 0 var(--sp-9);
    max-width: var(--content-max);
    width: 100%;
  }

  .docs-article :global(h1) {
    font-size: var(--fs-2xl);
    margin-top: 0;
  }

  @media (max-width: 960px) {
    .docs-shell { grid-template-columns: 1fr; gap: 0; }
    .docs-article { padding: var(--sp-4) 0 var(--sp-7); }
  }
</style>
