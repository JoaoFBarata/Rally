<!-- C:\Users\henri\Fct3Ano\ADC\Rally\src\routes\+layout.svelte -->
<script lang="ts">
	import { authState } from '$lib/auth.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import './layout.css';
	import '../app.css';
	import 'mapbox-gl/dist/mapbox-gl.css';
	import AppShell from '$lib/components/AppShell.svelte';

	let { children } = $props();

	// Proteção de rota simples no cliente
	$effect(() => {
		if (!authState.loading) {
			const protectedRoutes =
				page.url.pathname.startsWith('/dashboard') ||
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
	<div class="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">
		<div class="h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600 dark:border-slate-800 dark:border-t-blue-400"></div>
	</div>
{:else}
	<AppShell>
		{@render children()}
	</AppShell>
{/if}