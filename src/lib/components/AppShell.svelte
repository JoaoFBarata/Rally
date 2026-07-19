<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { auth, db } from '$lib/firebase';
	import { onAuthStateChanged } from 'firebase/auth';
	import { doc, onSnapshot } from 'firebase/firestore';
	import RallyLogo from '$lib/components/RallyLogo.svelte';
	import NavIcon from '$lib/components/NavIcon.svelte';
	import { initTheme } from '$lib/theme.svelte';
	import type { UserProfile } from '$lib/schema';
	import { ensureUserProfile, removeUserFcmToken, saveUserFcmToken } from '$lib/services/user.service';
	import { i18n } from '$lib/services/i18n.svelte';
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
	let currentPushUserId = '';

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
					label: i18n.t('explore'),
					href: '/explore',
					icon: 'explore'
				},
				{
					label: i18n.t('organization'),
					href: organizationManageHref,
					icon: 'organization'
				},
				{
					label: i18n.t('messages'),
					href: '/messages',
					icon: 'messages'
				},
				{
					label: i18n.t('profile'),
					href: organizationPublicHref,
					icon: 'profile'
				}
			];
		} else {
			items = [
				{
					label: i18n.t('explore'),
					href: '/explore',
					icon: 'explore'
				},
				{
					label: i18n.t('home'),
					href: '/dashboard',
					icon: 'dashboard'
				},
				{
					label: i18n.t('messages'),
					href: '/messages',
					icon: 'messages'
				},
				{
					label: i18n.t('profile'),
					href: '/profile',
					icon: 'profile'
				}
			];
		}

		if (isPlatformAdmin) {
			items.push({
				label: i18n.t('admin'),
				href: '/admin',
				icon: 'admin'
			});
		}

		return items;
	});

	// Keep the mobile bar compact, but do not hide Profile for platform admins.
	let mobileNavItems = $derived.by(() => {
		let filtered = navItems.filter((item) => item.href !== '/admin');
		if (filtered.length > 5) {
			const replaceableHref = organizationId ? organizationManageHref : '/profile';
			filtered = filtered.filter((item) => item.href !== replaceableHref);
		}

		return filtered.slice(0, 5);
	});

	let mobileNavGridClass = $derived(
		mobileNavItems.length > 4 ? 'max-w-lg grid-cols-6 gap-0.5' : 'max-w-md grid-cols-5 gap-1'
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
			pathname === '/verify-2fa' ||
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
				localStorage.setItem('rally_fcm_token_user_id', userId);
				currentPushUserId = userId;
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

	async function removeStoredPushTokenForUser(userId: string) {
		if (!userId) return;

		const token = localStorage.getItem('rally_fcm_token');
		if (!token) return;

		try {
			await removeUserFcmToken(userId, token);
		} catch (err) {
			console.error('Error removing FCM token from previous account:', err);
		}
	}

	onMount(() => {
		initTheme();
		currentPushUserId = localStorage.getItem('rally_fcm_token_user_id') ?? '';
		let unsubscribeUserDoc: (() => void) | null = null;

		const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
			const nextUserId = user?.uid ?? '';
			if (currentPushUserId && currentPushUserId !== nextUserId) {
				await removeStoredPushTokenForUser(currentPushUserId);
				localStorage.removeItem('rally_fcm_token');
				localStorage.removeItem('rally_fcm_token_user_id');
				currentPushUserId = '';
			}

			if (unsubscribeUserDoc) {
				unsubscribeUserDoc();
				unsubscribeUserDoc = null;
			}

			profile = null;
			isPlatformAdmin = isPlatformAdminEmail(user?.email);
			loadingProfile = true;

			if (user) {
				startNotifications(user.uid);

				try {
					await ensureUserProfile(user);
					unsubscribeUserDoc = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
						if (snapshot.exists()) {
							profile = {
								...snapshot.data(),
								id: snapshot.id
							} as UserProfile;
							if (profile.language) {
								i18n.setLanguage(profile.language as any);
							}
						} else {
							profile = null;
						}
						loadingProfile = false;
					}, (err) => {
						console.error('Realtime profile load error:', err);
						loadingProfile = false;
					});
					registerPushNotifications(user.uid);
				} catch (err) {
					console.error('Load shell profile error:', err);
					profile = null;
					loadingProfile = false;
				}
			} else {
				stopNotifications();
				if (Capacitor.isNativePlatform()) {
					PushNotifications.removeAllListeners();
				}
				localStorage.removeItem('rally_fcm_token_user_id');
				loadingProfile = false;
			}
		});

		return () => {
			unsubscribeAuth();
			if (unsubscribeUserDoc) {
				unsubscribeUserDoc();
			}
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
			<aside class="hidden md:flex flex-col h-screen w-71 sticky top-0 shrink-0 bg-[#f6f6f6] dark:bg-[#212121]">
				<div class="w-full pl-6.75 mt-13.25">
					<RallyLogo size="md" href={organizationManageHref ?? '/'}/>
					<button class="mt-10.25 w-53.25 h-14.5 bg-[#0095ff] hover:shadow-[0px_5px_15px_0px_rgba(100,100,111,0.7)] dark:hover:shadow-[0px_5px_15px_0px_rgba(155,155,144,0.7)] rounded-[10px] text-white cursor-pointer" onclick={() => goto(resolveNavHref(createEventHref))}>
						<h3 class="text-[20px] font-semibold">{i18n.t('new_event')}</h3>
					</button>
				</div>
				<div class="w-full grow flex flex-col justify-between bg-[#eaeaea] dark:bg-[#1A1A1A] rounded-tr-[75px] mt-10 pb-9">
					<div>
						{#each navItems as item, idx (item.href)}
							<a
								href={resolveNavHref(item.href)}
								class={`flex flex-row items-center gap-6 text-[1.25rem] ${idx==0 ? 'rounded-tr-[75px] ' : ''}font-medium transition px-[2.59375rem] py-5 w-full ${
												isActive(item.href)
													? 'bg-blue-600 text-white'
													: 'text-slate-600 hover:bg-slate-300 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
										  }`}>
								<span class="flex items-center justify-center h-6 w-6 text-lg">
									<NavIcon name={item.icon} />
								</span>
								<span>{item.label}</span>

								{#if item.href === '/messages' && notificationState.unreadMessages > 0}
									<span
										class={`ml-auto flex min-h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
											isActive(item.href) ? 'bg-white text-blue-600' : 'bg-red-500 text-white'
										}`}>
										{formatBadge(notificationState.unreadMessages)}
									</span>
								{/if}
							</a>
						{/each}
					</div>
					<div>
						<a href={resolveNavHref('/settings')}
							class={`flex flex-row items-center gap-6 text-[1.25rem] font-medium transition px-[2.59375rem] py-5 w-full ${
												isActive('/settings')
													? 'bg-blue-600 text-white'
													: 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
									}`}>
							<span class="flex items-center justify-center h-6 w-6 text-lg">
								<NavIcon name="settings"/>
							</span>
							<span>{i18n.t('settings')}</span>
						</a>
					</div>
				</div>
			</aside>
			<div class="flex min-w-0 flex-1 flex-col overflow-x-clip">
				<main class="min-h-screen min-w-0 overflow-x-clip pb-28 md:px-28">
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
							class={`relative flex items-center justify-center text-lg transition-all h-9 w-9 rounded-2xl ${
								isActive(item.href)
									? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
									: 'text-slate-400 dark:text-slate-500'
							}`}
						>
							<NavIcon name={item.icon} />

							{#if item.href === '/messages' && notificationState.unreadMessages > 0}
								<span
									class="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white"
								>
									{formatBadge(notificationState.unreadMessages)}
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
