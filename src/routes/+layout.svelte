<!-- C:\Users\henri\Fct3Ano\ADC\Rally\src\routes\+layout.svelte -->
<script lang="ts">
	import { authState } from '$lib/auth.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
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

	let pageTitle = $derived.by(() => {
		const pathname = page.url.pathname;

		if (pathname === '/') return 'Rally';
		if (pathname.startsWith('/dashboard')) return 'Dashboard | Rally';
		if (pathname.startsWith('/explore')) return 'Explore | Rally';
		if (pathname.startsWith('/payments')) return 'Payments | Rally';
		if (pathname.startsWith('/messages')) return 'Messages | Rally';
		if (pathname.startsWith('/profile')) return 'Profile | Rally';
		if (pathname.startsWith('/users')) return 'User profile | Rally';
		if (pathname.startsWith('/organizations')) return 'Organizations | Rally';
		if (pathname.startsWith('/locations')) return 'Locations | Rally';
		if (pathname.startsWith('/events/create')) return 'Create event | Rally';
		if (pathname.includes('/edit')) return 'Edit event | Rally';
		if (pathname.startsWith('/events')) return 'Event | Rally';
		if (pathname.startsWith('/login')) return 'Log in | Rally';
		if (pathname.startsWith('/register')) return 'Create account | Rally';
		if (pathname.startsWith('/verify-email')) return 'Verify email | Rally';

		return 'Rally';
	});

	onMount(() => {
		initTheme();

		let backButtonListener: Promise<{ remove: () => Promise<void> }> | null = null;
		if (Capacitor.getPlatform() === 'android') {
			backButtonListener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
				if (window.history.state !== null || canGoBack) {
					window.history.back();
				} else {
					CapacitorApp.exitApp();
				}
			});
		}
		const openAppUrl = async (url: string) => {
			try {
				const appUrl = new URL(url);
				if (appUrl.hostname !== 'synqo-rally.web.app') return;
				await goto(`${appUrl.pathname}${appUrl.search}${appUrl.hash}`);
				// `goto` can reuse the current /verify-2fa component. Notify it so
				// a newly-arrived Firebase oobCode is processed without requiring a
				// reload (the normal case when an Android app link reopens Rally).
				window.dispatchEvent(new CustomEvent('rally:app-url-opened'));
			} catch (error) {
				console.error('Invalid Rally app link:', error);
			}
		};
		const appUrlListener = CapacitorApp.addListener('appUrlOpen', ({ url }) => void openAppUrl(url));
		void CapacitorApp.getLaunchUrl().then((launch) => {
			if (launch?.url) void openAppUrl(launch.url);
		});

		return () => {
			if (backButtonListener) void backButtonListener.then((listener) => listener.remove());
			void appUrlListener.then((listener) => listener.remove());
		};
	});

	// Client-side route protection and initial root navigation
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

			if (Capacitor.getPlatform() !== 'web' && page.url.pathname === '/') {
				void goto(authState.user ? '/dashboard' : '/login', { replaceState: true });
				return;
			}

			if (page.url.pathname === '/' && !authState.user) {
				void goto('/login', { replaceState: true });
				return;
			}

			const protectedRoutes =
				page.url.pathname.startsWith('/dashboard') ||
				page.url.pathname.startsWith('/events') ||
				page.url.pathname.startsWith('/messages') ||
				page.url.pathname.startsWith('/profile');

			if (protectedRoutes && !authState.user) {
				void goto('/login');
				return;
			}

			if (page.url.pathname === '/verify-email' && !authState.user) {
				void goto('/login');
				return;
			}

			if (requiresEmailVerification && !emailVerificationAllowedRoute) {
				void goto('/verify-email');
				return;
			}

			if (
				page.url.pathname === '/verify-email' &&
				authState.user &&
				(!isPasswordAccount || authState.user.emailVerified)
			) {
				void goto('/dashboard');
			}
		}
	});

	$effect(() => {
		if (Capacitor.getPlatform() === 'web') return;

		const useDarkStatusBar = $themeState;
		const statusBarColor = useDarkStatusBar ? '#161616' : '#FFFFFF';
		document.documentElement.style.backgroundColor = statusBarColor;
		document.body.style.backgroundColor = statusBarColor;
		if (Capacitor.getPlatform() === 'android') {
			void StatusBar.setBackgroundColor({ color: statusBarColor });
		}
		void StatusBar.setStyle({ style: useDarkStatusBar ? Style.Dark : Style.Light });
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<AppShell>
	{@render children()}
</AppShell>

{#if authState.loading}
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
