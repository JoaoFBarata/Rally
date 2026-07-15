<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { onAuthStateChanged } from 'firebase/auth';
	import RallyLogo from '$lib/components/RallyLogo.svelte';
	import NavIcon from '$lib/components/NavIcon.svelte';
	import { initTheme } from '$lib/theme.svelte';
	import type { UserProfile } from '$lib/schema';
	import { ensureUserProfile, saveUserFcmToken } from '$lib/services/user.service';
	import { isPlatformAdminEmail } from '$lib/admin';
	import {
		notificationState,
		startNotifications,
		stopNotifications
	} from '$lib/notifications.svelte';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import { Capacitor } from '@capacitor/core';
	import { PushNotifications } from '@capacitor/push-notifications';

	let { children } = $props();

	let profile = $state<UserProfile | null>(null);
	let loadingProfile = $state(true);
	let isPlatformAdmin = $state(false);

	let pathname = $derived(page.url.pathname);

	let organizationId = $derived(
		profile?.accountType === 'organization' && profile.activeOrganizationId
			? profile.activeOrganizationId
			: null
	);

	let organizationManageHref = $derived(
		organizationId ? `/organizations/${organizationId}/manage` : null
	);

	let organizationPublicHref = $derived(organizationId ? `/organizations/${organizationId}` : null);

	let createEventHref = $derived(
		organizationId ? `/organizations/${organizationId}/events/create` : '/events/create'
	);

	let navItems = $derived.by(() => {
		let items;
		if (organizationId && organizationManageHref && organizationPublicHref) {
			items = [
				{
					label: 'Explore',
					href: '/explore',
					icon: 'explore'
				},
				{
					label: 'Organization',
					href: organizationManageHref,
					icon: 'organization'
				},
				{
					label: 'Messages',
					href: '/messages',
					icon: 'messages'
				},
				{
					label: 'Profile',
					href: organizationPublicHref,
					icon: 'profile'
				}
			];
		} else {
			items = [
				{
					label: 'Explore',
					href: '/explore',
					icon: 'explore'
				},
				{
					label: 'Home',
					href: '/dashboard',
					icon: 'dashboard'
				},
				{
					label: 'Messages',
					href: '/messages',
					icon: 'messages'
				},
				{
					label: 'Profile',
					href: '/profile',
					icon: 'profile'
				}
			];
		}

		if (isPlatformAdmin) {
			items.push({
				label: 'Admin',
				href: '/admin',
				icon: 'admin'
			});
		}

		return items;
	});

	// Keep the mobile bar compact, but do not hide Profile for platform admins.
	let mobileNavItems = $derived.by(() => {
		let filtered = navItems;
		if (navItems.length > 5 && !isPlatformAdmin) {
			const replaceableHref = organizationId ? organizationManageHref : '/profile';
			filtered = navItems.filter((item) => item.href !== replaceableHref);
		}

		return filtered.slice(0, isPlatformAdmin ? 6 : 5);
	});

	let mobileNavGridClass = $derived(
		mobileNavItems.length > 5 ? 'max-w-lg grid-cols-6 gap-0.5' : 'max-w-md grid-cols-5 gap-1'
	);

	function mobileLabel(label: string) {
		if (label === 'Organization') return 'Org';
		return label;
	}

	function isActive(href: string) {
		const cleanHref = href.split('?')[0];

		if (cleanHref.includes('/events/create')) {
			return pathname === cleanHref;
		}

		if (organizationManageHref && cleanHref === organizationManageHref) {
			return pathname === organizationManageHref;
		}

		if (organizationPublicHref && cleanHref === organizationPublicHref) {
			return pathname === organizationPublicHref;
		}

		if (cleanHref === '/dashboard') return pathname === '/dashboard';

		return pathname.startsWith(cleanHref);
	}

	function shouldHideNavigation() {
		const focusedPage =
			/^\/messages\/[^/]+$/.test(pathname) ||
			pathname === '/events/create' ||
			/^\/organizations\/[^/]+\/(events|tournaments)\/create$/.test(pathname);

		return (
			pathname === '/' ||
			pathname === '/login' ||
			pathname.startsWith('/register') ||
			pathname === '/discover' ||
			focusedPage
		);
	}

	function formatBadge(count: number) {
		return count > 9 ? '9+' : String(count);
	}

	function resolveNavHref(href: string) {
		return resolve(href as any);
	}

	$effect(() => {
		if (loadingProfile || !organizationId) return;

		if (pathname === '/dashboard') {
			goto(resolve(`/organizations/${organizationId}/manage`), { replaceState: true });
		}

		if (pathname === '/profile') {
			goto(resolve(`/organizations/${organizationId}`), { replaceState: true });
		}
	});

	async function registerPushNotifications(userId: string) {
		if (!Capacitor.isNativePlatform()) {
			return;
		}

		try {
			let permStatus = await PushNotifications.checkPermissions();

			if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
				permStatus = await PushNotifications.requestPermissions();
			}

			if (permStatus.receive !== 'granted') {
				console.warn('Push notification permission not granted:', permStatus.receive);
				return;
			}

			// Create default notification channel for Android background notifications
			await PushNotifications.createChannel({
				id: 'rally_default_channel',
				name: 'Default',
				description: 'Default notification channel',
				importance: 5, // IMPORTANCE_HIGH (value 5)
				visibility: 1, // VISIBILITY_PUBLIC (value 1)
				lights: true,
				vibration: true
			});

			await PushNotifications.removeAllListeners();

			await PushNotifications.addListener('registration', async (token) => {
				console.log('Push registration success, token:', token.value);
				localStorage.setItem('rally_fcm_token', token.value);
				try {
					await saveUserFcmToken(userId, token.value);
				} catch (err) {
					console.error('Error saving FCM token to Firestore:', err);
				}
			});

			await PushNotifications.addListener('registrationError', (error: any) => {
				console.error('Error on push registration:', JSON.stringify(error));
			});

			await PushNotifications.addListener('pushNotificationReceived', (notification) => {
				console.log('Push notification received in foreground:', notification);
			});

			await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
				console.log('Push notification action performed:', notification);
				const data = notification.notification.data;
				if (data && data.path) {
					goto(resolve(data.path));
				}
			});

			await PushNotifications.register();
		} catch (err) {
			console.error('Failed to register push notifications:', err);
		}
	}

	onMount(() => {
		initTheme();

		const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
			profile = null;
			isPlatformAdmin = isPlatformAdminEmail(user?.email);
			loadingProfile = true;

			if (user) {
				startNotifications(user.uid);

				try {
					profile = await ensureUserProfile(user);
					registerPushNotifications(user.uid);
				} catch (err) {
					console.error('Load shell profile error:', err);
					profile = null;
				} finally {
					loadingProfile = false;
				}
			} else {
				stopNotifications();
				if (Capacitor.isNativePlatform()) {
					PushNotifications.removeAllListeners();
				}
				loadingProfile = false;
			}
		});

		return () => {
			unsubscribeAuth();
			stopNotifications();
			if (Capacitor.isNativePlatform()) {
				PushNotifications.removeAllListeners();
			}
		};
	});
</script>

{#if shouldHideNavigation()}
	<div class="min-h-dvh bg-white text-black dark:bg-[#111111] dark:text-white font-montserrat">
		{@render children()}
	</div>
{:else}
	<div class="min-h-screen bg-white text-black dark:bg-[#111111] dark:text-white font-montserrat">
		<div class="flex min-h-screen min-w-0 overflow-x-clip">
			<!-- Desktop sidebar -->
			<aside class="hidden md:flex flex-col h-screen w-71 fixed bg-[#f6f6f6] dark:bg-[#212121]">
				<div class="w-full pl-6.75 mt-13.25">
					<RallyLogo size="md" href={organizationManageHref ?? '/'}/>
					<button class="mt-10.25 w-53.25 h-14.5 bg-[#48b3ff] rounded-[10px] text-white cursor-pointer" onclick={() => goto(resolve(createEventHref))}>
						<h3 class="text-[20px] font-semibold">+ New event</h3>
					</button>
				</div>
				<div class="w-full grow flex flex-col justify-between bg-[#eaeaea] dark:bg-[#1A1A1A] rounded-tr-[75px] mt-10 pb-9">
					<div>
						{#each navItems as item, idx (item.href)}
							<a
								href={resolveNavHref(item.href)}
								class={`flex flex-row items-center gap-6 text-[1.25rem] ${idx==0 ? 'rounded-tr-[75px] ' : ''}font-medium transition pl-[2.59375rem] py-5 w-full ${
												isActive(item.href)
													? 'bg-blue-600 text-white'
													: 'text-slate-600 hover:bg-slate-300 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
										  }`}>
								<span class="flex items-center justify-center h-6 w-6 text-lg">
									<NavIcon name={item.icon} />
								</span>
								<span>{item.label}</span>

								{#if item.href === '/messages' && notificationState.total > 0}
									<span
										class={`ml-auto flex min-h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
											isActive(item.href) ? 'bg-white text-blue-600' : 'bg-red-500 text-white'
										}`}>
										{formatBadge(notificationState.total)}
									</span>
								{/if}
							</a>
						{/each}
					</div>
					<div>
						<a href={resolveNavHref('/settings')}
							class={`flex flex-row items-center gap-6 text-[1.25rem] font-medium transition pl-[2.59375rem] py-5 w-full ${
												isActive('/settings')
													? 'bg-blue-600 text-white'
													: 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
									}`}>
							<span class="flex items-center justify-center h-6 w-6 text-lg">
								<NavIcon name="settings"/>
							</span>
							<span>Settings</span>
						</a>
					</div>
				</div>
			</aside>
			<!-- <aside
				class="hidden w-72 shrink-0 border-r border-slate-200 bg-white px-5 py-6 dark:border-slate-800 dark:bg-slate-900 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:overflow-y-auto"
			>
				<div>
					<div class="flex items-center justify-between gap-3">
						<RallyLogo size="sm" href={organizationManageHref ?? '/'} />
						<ThemeToggle />
					</div>

					<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
						{organizationId ? 'Manage official sports experiences' : 'Find your game.'}
					</p>
				</div>-->

			<div class="flex min-w-0 flex-1 flex-col overflow-x-clip">
				<main class="min-h-screen min-w-0 overflow-x-clip pb-28 md:px-28 pt-22.25">
					{@render children()}
				</main>
			</div>
		</div>

		<!-- Mobile bottom navigation -->
		<nav
			class="fixed inset-x-3 bottom-3 z-100 rounded-3xl border border-slate-200 bg-[#f6f6f6] px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-2xl shadow-slate-400/30 [transform:translateZ(0)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/50 md:hidden"
		>
			<div class={`mx-auto grid ${mobileNavGridClass} items-end`}>
				{#each mobileNavItems as item, idx (item.href)}
					<a href={resolveNavHref(item.href)} class="flex flex-col items-center justify-end gap-1">
						<span
							class={`relative flex items-center justify-center text-lg transition-all ${
								item.primary
									? `${mobileNavItems.length > 5 ? 'h-10 w-10' : 'h-11 w-11'} -translate-y-2 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/35 hover:bg-blue-700 active:scale-95`
									: `h-9 w-9 rounded-2xl ${
											isActive(item.href)
												? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
												: 'text-slate-400 dark:text-slate-500'
										}`
							}`}
						>
							<NavIcon name={item.icon} />

							{#if item.href === '/messages' && notificationState.total > 0}
								<span
									class="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white"
								>
									{formatBadge(notificationState.total)}
								</span>
							{/if}
						</span>

						<span
							class={`max-w-12 truncate text-[10px] font-medium sm:text-[11px] ${
								isActive(item.href)
									? 'text-blue-600 dark:text-blue-400'
									: 'text-slate-400 dark:text-slate-500'
							}`}
						>
							{mobileLabel(item.label)}
						</span>
					</a>
					{#if idx == Math.floor(mobileNavItems.length / 2) - 1}
						<a href={resolveNavHref(createEventHref)} class="flex flex-col items-center justify-end gap-1">
							<span
								class={`relative flex items-center justify-center text-lg transition-all ${mobileNavItems.length > 5 ? 'h-10 w-10' : 'h-11 w-11'} -translate-y-2 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/35 hover:bg-blue-700 active:scale-95`}
							>
								<NavIcon name="create" />
							</span>
						</a>
					{/if}
				{/each}
			</div>
		</nav>
		<ToastContainer />
	</div>
{/if}
