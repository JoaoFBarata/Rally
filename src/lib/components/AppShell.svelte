<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { onAuthStateChanged } from 'firebase/auth';
	import RallyLogo from '$lib/components/RallyLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import type { UserProfile } from '$lib/schema';
	import { ensureUserProfile } from '$lib/services/user.service';
	import {
		notificationState,
		startNotifications,
		stopNotifications
	} from '$lib/notifications.svelte';

	let { children } = $props();

	let profile = $state<UserProfile | null>(null);
	let loadingProfile = $state(true);

	let pathname = $derived(page.url.pathname);

	let organizationId = $derived(
		profile?.accountType === 'organization' && profile.activeOrganizationId
			? profile.activeOrganizationId
			: null
	);

	let organizationManageHref = $derived(
		organizationId ? `/organizations/${organizationId}/manage` : null
	);

	let organizationPublicHref = $derived(
		organizationId ? `/organizations/${organizationId}` : null
	);

	let createEventHref = $derived(
		organizationId ? `/organizations/${organizationId}/events/create` : '/events/create'
	);

	let navItems = $derived.by(() => {
		if (organizationId && organizationManageHref && organizationPublicHref) {
			return [
				{
					label: 'Create event',
					href: createEventHref,
					icon: '+',
					primary: true
				},
				{
					label: 'Explore',
					href: '/explore',
					icon: '⌖'
				},
				{
					label: 'Organization',
					href: organizationManageHref,
					icon: '◆'
				},
				{
					label: 'Messages',
					href: '/messages',
					icon: '✉'
				},
				{
					label: 'Public page',
					href: organizationPublicHref,
					icon: '✓'
				}
			];
		}

		return [
			{
				label: 'Create event',
				href: '/events/create',
				icon: '+',
				primary: true
			},
			{
				label: 'Explore',
				href: '/explore',
				icon: '⌖'
			},
			{
				label: 'My events',
				href: '/dashboard',
				icon: '◷'
			},
			{
				label: 'Messages',
				href: '/messages',
				icon: '✉'
			},
			{
				label: 'Profile',
				href: '/profile',
				icon: '☻'
			}
		];
	});

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
		return pathname === '/' || pathname === '/login' || pathname.startsWith('/register') || pathname === '/discover';
	}

	function formatBadge(count: number) {
		return count > 9 ? '9+' : String(count);
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

	onMount(() => {
		const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
			profile = null;
			loadingProfile = true;

			if (user) {
				startNotifications(user.uid);

				try {
					profile = await ensureUserProfile(user);
				} catch (err) {
					console.error('Load shell profile error:', err);
					profile = null;
				} finally {
					loadingProfile = false;
				}
			} else {
				stopNotifications();
				loadingProfile = false;
			}
		});

		return () => {
			unsubscribeAuth();
			stopNotifications();
		};
	});
</script>

{#if shouldHideNavigation()}
	{@render children()}
{:else}
	<div class="min-h-screen bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
		<div class="flex min-h-screen">
			<!-- Desktop sidebar -->
			<aside
				class="hidden w-72 border-r border-slate-200 bg-white px-5 py-6 dark:border-slate-800 dark:bg-slate-900 md:block"
			>
				<div>
					<div class="flex items-center justify-between gap-3">
						<RallyLogo size="sm" href={organizationManageHref ?? '/dashboard'} />
						<ThemeToggle />
					</div>

					<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
						{organizationId ? 'Manage official sports experiences' : 'Make sports happen'}
					</p>
				</div>

				<nav class="mt-10 space-y-1">
					{#each navItems as item (item.href)}
						<a
							href={resolve(item.href)}
							class={`flex items-center text-sm font-semibold transition ${
								item.primary
									? 'mb-6 w-fit gap-3 rounded-2xl bg-blue-300 px-3 py-2.5 pr-5 text-slate-800 shadow-none hover:bg-blue-300 hover:text-slate-800 hover:shadow-lg hover:shadow-slate-400/30 dark:bg-blue-950/70 dark:text-blue-300 dark:hover:bg-blue-950/70 dark:hover:text-blue-300 dark:hover:shadow-black/40'
									: `-ml-5 mr-3 w-auto gap-5 rounded-l-none rounded-r-full py-3 pl-10 pr-5 ${
											isActive(item.href)
												? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
												: 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
										}`
							}`}
						>
							<span
								class={`flex items-center justify-center rounded-xl ${
									item.primary ? 'h-7 w-7 text-blue-700 dark:text-blue-200' : 'h-7 w-7 text-lg'
								}`}
							>
								{#if item.primary}
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.6"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="h-5 w-5"
									>
										<path d="M12 5v14" />
										<path d="M5 12h14" />
									</svg>
								{:else}
									{item.icon}
								{/if}
							</span>

							<span>{item.label}</span>

							{#if item.href === '/messages' && notificationState.total > 0}
								<span
									class={`ml-auto flex min-h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-black ${
										isActive(item.href)
											? 'bg-white text-blue-600'
											: 'bg-red-500 text-white'
									}`}
								>
									{formatBadge(notificationState.total)}
								</span>
							{/if}
						</a>
					{/each}
				</nav>
			</aside>

			<div class="flex min-w-0 flex-1 flex-col">
				<main class="min-h-screen pb-24 md:pb-0">
					{@render children()}
				</main>
			</div>
		</div>

		<!-- Mobile bottom navigation -->
		<nav
			class="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 py-2 shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:hidden"
		>
			<div class="mx-auto grid max-w-md grid-cols-5 items-end gap-1">
				{#each navItems as item (item.href)}
					<a href={resolve(item.href)} class="flex flex-col items-center justify-end gap-1">
						<span
							class={`relative flex h-9 w-9 items-center justify-center rounded-2xl text-lg ${
								item.primary
									? isActive(item.href)
										? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
										: 'bg-blue-50 text-blue-600 shadow-sm dark:bg-blue-950 dark:text-blue-300'
									: isActive(item.href)
										? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
										: 'text-slate-400 dark:text-slate-500'
							}`}
						>
							{#if item.primary}
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.6"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="h-5 w-5"
								>
									<path d="M12 5v14" />
									<path d="M5 12h14" />
								</svg>
							{:else}
								{item.icon}
							{/if}

							{#if item.href === '/messages' && notificationState.total > 0}
								<span
									class="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white"
								>
									{formatBadge(notificationState.total)}
								</span>
							{/if}
						</span>

						<span
							class={`text-[11px] font-medium ${
								item.primary
									? isActive(item.href)
										? 'text-blue-600 dark:text-blue-400'
										: 'text-blue-600 dark:text-blue-300'
									: isActive(item.href)
										? 'text-blue-600 dark:text-blue-400'
										: 'text-slate-400 dark:text-slate-500'
							}`}
						>
							{item.label}
						</span>
					</a>
				{/each}
			</div>
		</nav>
	</div>
{/if}