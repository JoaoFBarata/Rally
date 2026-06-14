<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { onAuthStateChanged } from 'firebase/auth';
	import RallyLogo from '$lib/components/RallyLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import {
		notificationState,
		startNotifications,
		stopNotifications
	} from '$lib/notifications.svelte';

	let { children } = $props();

	const navItems = [
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

	let pathname = $derived(page.url.pathname);

	function isActive(href: string) {
		if (href === '/dashboard') return pathname === '/dashboard';
		return pathname.startsWith(href);
	}

	function shouldHideNavigation() {
		return pathname === '/' || pathname === '/login' || pathname === '/register';
	}

	function shouldShowCreateButton() {
		return !shouldHideNavigation() && pathname !== '/events/create';
	}

	function formatBadge(count: number) {
		return count > 9 ? '9+' : String(count);
	}

	onMount(() => {
		const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
			if (user) {
				startNotifications(user.uid);
			} else {
				stopNotifications();
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
					<div>
						<div class="flex items-center justify-between gap-3">
							<RallyLogo size="sm" href="/dashboard" />
							<ThemeToggle />
						</div>

						<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
							Make sports happen
						</p>
					</div>
				</div>

				<nav class="mt-10 space-y-2">
					{#each navItems as item (item.href)}
						<a
							href={item.href}
							class={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
								isActive(item.href)
									? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
									: 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
							}`}
						>
							<span class="text-lg">{item.icon}</span>

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

		{#if shouldShowCreateButton()}
            <a
                href={resolve('/events/create')}
                aria-label="Create event"
                title="Create event"
                class="fixed bottom-6 left-6 z-[100] flex h-18 w-18 items-center justify-center rounded-full bg-slate-200 text-blue-800 shadow-2xl shadow-slate-400/30 transition hover:scale-105 hover:bg-slate-300 active:scale-95 dark:bg-slate-800 dark:text-blue-400 dark:shadow-slate-950/40 dark:hover:bg-slate-700"
            >
                <span class="-mt-1 text-6xl font-light leading-none">+</span>
            </a>
        {/if}

		<!-- Mobile bottom navigation -->
		<nav
			class="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 py-2 shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:hidden"
		>
			<div class="mx-auto grid max-w-md grid-cols-4 items-end gap-1">
				{#each navItems as item (item.href)}
					<a href={item.href} class="flex flex-col items-center justify-end gap-1">
						<span
							class={`relative flex h-9 w-9 items-center justify-center rounded-2xl text-lg ${
								isActive(item.href)
									? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
									: 'text-slate-400 dark:text-slate-500'
							}`}
						>
							{item.icon}

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
								isActive(item.href)
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