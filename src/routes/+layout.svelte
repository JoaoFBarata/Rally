<script lang="ts">
  //import "../app.css";
  import { authState } from "$lib/auth.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";

  let { children } = $props();

  // Proteção de rota simples no cliente
  $effect(() => {
    if (!authState.loading) {
      const isDashboard = page.url.pathname.startsWith('/dashboard');
      if (isDashboard && !authState.user) {
        goto(resolve('/login'));
      }
    }
  });
</script>

{#if authState.loading}
  <div class="flex h-screen items-center justify-center">A carregar...</div>
{:else}
  {@render children()}
{/if}