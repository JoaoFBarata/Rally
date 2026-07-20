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
	import { App as CapacitorApp } from '@capacitor/app';
	import { Capacitor } from '@capacitor/core';
	import { onMount } from 'svelte';

	let { children } = $props();
	let shouldBypassLanding = $state(false);

	onMount(() => {
		shouldBypassLanding =
			Capacitor.isNativePlatform() || window.matchMedia('(max-width: 767px)').matches;

		const backButtonListener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
			if (window.history.state !== null || canGoBack) {
				window.history.back();
			} else {
				CapacitorApp.exitApp();
			}
		});

		return () => {
			void backButtonListener.then((listener) => listener.remove());
		};
	});

	// Proteção de rota simples no cliente
	$effect(() => {
		if (!authState.loading) {
			if (shouldBypassLanding && page.url.pathname === '/') {
				void goto(resolve(authState.user ? '/dashboard' : '/login'), { replaceState: true });
				return;
			}

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

{#if authState.loading || (shouldBypassLanding && page.url.pathname === '/')}
	<div class="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">
		<div
			class="h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600 dark:border-slate-800 dark:border-t-blue-400"
		></div>
	</div>
{:else}
	<AppShell>
		{@render children()}
	</AppShell>
{/if}
