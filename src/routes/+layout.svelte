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
	import { StatusBar, Style } from '@capacitor/status-bar';
	import { initTheme, themeState } from '$lib/theme.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();
	let shouldBypassLanding = $state(Capacitor.isNativePlatform());
	let nativeStartupPending = $state(Capacitor.isNativePlatform());
	let showStartupLoader = $derived(
		authState.loading ||
			(shouldBypassLanding && page.url.pathname === '/') ||
			(Capacitor.isNativePlatform() && nativeStartupPending)
	);

	onMount(() => {
		initTheme();
		shouldBypassLanding =
			Capacitor.isNativePlatform() || window.matchMedia('(max-width: 767px)').matches;

		const backButtonListener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
			if (window.history.state !== null || canGoBack) {
				window.history.back();
			} else {
				CapacitorApp.exitApp();
			}
		});
		const openAppUrl = (url: string) => {
			try {
				const appUrl = new URL(url);
				if (appUrl.hostname !== 'synqo-rally.web.app') return;
				void goto(`${appUrl.pathname}${appUrl.search}${appUrl.hash}`);
			} catch (error) {
				console.error('Invalid Rally app link:', error);
			}
		};
		const appUrlListener = CapacitorApp.addListener('appUrlOpen', ({ url }) => openAppUrl(url));
		void CapacitorApp.getLaunchUrl().then((launch) => {
			if (launch?.url) openAppUrl(launch.url);
		});
		const handleDashboardReady = () => (nativeStartupPending = false);
		window.addEventListener('rally:dashboard-ready', handleDashboardReady);
		const startupSafetyTimeout = window.setTimeout(() => (nativeStartupPending = false), 15_000);

		return () => {
			window.removeEventListener('rally:dashboard-ready', handleDashboardReady);
			window.clearTimeout(startupSafetyTimeout);
			void backButtonListener.then((listener) => listener.remove());
			void appUrlListener.then((listener) => listener.remove());
		};
	});

	// Proteção de rota simples no cliente
	$effect(() => {
		if (!authState.loading) {
			const isPasswordAccount = Boolean(
				authState.user?.providerData.some((provider) => provider.providerId === 'password')
			);
			const isUnverifiedPasswordAccount =
				Boolean(authState.user) && isPasswordAccount && !authState.user?.emailVerified;
			const requiresEmailVerification =
				isUnverifiedPasswordAccount &&
				authState.requiresEmailVerification &&
				!authState.user?.emailVerified;
			const emailVerificationAllowedRoute =
				page.url.pathname === '/' ||
				page.url.pathname === '/login' ||
				page.url.pathname === '/verify-email' ||
				page.url.pathname.startsWith('/register');

			if (!authState.user || (page.url.pathname !== '/' && page.url.pathname !== '/dashboard')) {
				nativeStartupPending = false;
			}

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
				return;
			}

			if (page.url.pathname === '/verify-email' && !authState.user) {
				goto(resolve('/login'));
				return;
			}

			if (requiresEmailVerification && !emailVerificationAllowedRoute) {
				goto(resolve('/verify-email'));
				return;
			}

			if (
				page.url.pathname === '/verify-email' &&
				authState.user &&
				(!isPasswordAccount || authState.user.emailVerified)
			) {
				goto(resolve('/dashboard'));
			}
		}
	});

	$effect(() => {
		if (!Capacitor.isNativePlatform()) return;

		const useDarkStatusBar = $themeState;
		const statusBarColor = useDarkStatusBar ? '#161616' : '#FFFFFF';
		document.documentElement.style.backgroundColor = statusBarColor;
		document.body.style.backgroundColor = statusBarColor;
		void StatusBar.setBackgroundColor({ color: statusBarColor });
		void StatusBar.setStyle({ style: useDarkStatusBar ? Style.Dark : Style.Light });
	});
</script>

{#if !authState.loading && !(shouldBypassLanding && page.url.pathname === '/')}
	<AppShell>
		{@render children()}
	</AppShell>
{/if}

{#if showStartupLoader}
	<div
		class="fixed inset-0 z-[9999] flex min-h-dvh items-center justify-center bg-white dark:bg-[#161616]"
	>
		<div class="flex flex-col items-center gap-6 px-6">
			<img
				src={$themeState ? '/rally-logo-white.png' : '/rally-logo-black.png'}
				alt="Rally"
				class="h-14 w-auto object-contain"
			/>
			<div
				class="h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-400"
				aria-hidden="true"
			></div>
		</div>
	</div>
{/if}
