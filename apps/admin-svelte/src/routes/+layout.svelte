<script lang="ts">
  import "#lib/styles.css";
  import { page } from "$app/state";

  let { children } = $props();

  const status = (path: string) =>
    page.url.pathname === path ? "active" : undefined;
</script>

<nav>
  <a href="/" data-status={status("/")}>サポート</a>
  <a href="/reports" data-status={status("/reports")}>通報</a>
  <a href="/bucket" data-status={status("/bucket")}>棚卸し</a>
</nav>
{@render children()}
