<script lang="ts">
	import { authState } from '$lib/auth.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import './layout.css';
	import AppShell from '$lib/components/AppShell.svelte';

	let { children } = $props();

	// Proteção de rota simples no cliente
	$effect(() => {
		if (!authState.loading) {
			const protectedRoutes =
				page.url.pathname.startsWith('/dashboard') ||
				page.url.pathname.startsWith('/explore') ||
				page.url.pathname.startsWith('/events') ||
				page.url.pathname.startsWith('/messages') ||
				page.url.pathname.startsWith('/profile');

			if (protectedRoutes && !authState.user) {
				goto(resolve('/login'));
			}
		}
	});
</script>

{#if authState.loading}
	<div class="flex h-screen items-center justify-center bg-slate-100 text-slate-600">
		A carregar...
	</div>
{:else}
	<AppShell>
		{@render children()}
	</AppShell>
{/if}