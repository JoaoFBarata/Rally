<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { onAuthStateChanged, type User } from 'firebase/auth';
	import {
		getEventsCreatedByUser,
		getEventsForUser,
		getUpcomingEvents,
		sortEventsByStartDate,
		isEventFinished,
		isPromotionActive,
		notifyEventFinished
	} from '$lib/services/event.service';
	import { getInvitesForUser } from '$lib/services/invite.service';
	import { ensureUserProfile } from '$lib/services/user.service';
	import { subscribeToPromotedEventsForUser } from '$lib/services/explore.service';
	import type { EventInvite, SportEvent, UserProfile } from '$lib/schema';
	import EventCard from '$lib/components/EventCard.svelte';
	import UserMiniMap from '$lib/components/maps/UserMiniMap.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import PromotedEventCarousel from '$lib/components/PromotedEventCarousel.svelte';
	import {
		subscribeToEventCatalogChanges,
		subscribeToUserActivityChanges
	} from '$lib/services/realtime.service';

	let user = $state<User | null>(null);
	let profile = $state<UserProfile | null>(null);
	let loading = $state(true);
	let events = $state<SportEvent[]>([]);
	let joinedEvents = $state<SportEvent[]>([]);
	let allUserEvents = $state<SportEvent[]>([]);
	let invites = $state<EventInvite[]>([]);
	let promotedEvents = $state<SportEvent[]>([]);
	let error = $state('');
	let activeTab = $state<'hosting' | 'joined'>('hosting');
	let showPastEvents = $state(false);

	let hostingEvents = $derived(events.filter((event) => !isEventFinished(event)));
	let pastHostingEvents = $derived(events.filter((event) => isEventFinished(event)));
	let currentHostingEvents = $derived(showPastEvents ? pastHostingEvents : hostingEvents);

	let participantEvents = $derived(joinedEvents.filter((event) => !isEventFinished(event)));
	let pastParticipantEvents = $derived(joinedEvents.filter((event) => isEventFinished(event)));
	let currentJoinedEvents = $derived(showPastEvents ? pastParticipantEvents : participantEvents);
	let visiblePromotedEvents = $derived.by(() => {
		const eventsById = new Map<string, SportEvent>();

		for (const event of promotedEvents) {
			if (event.visibility === 'public' && isPromotionActive(event)) {
				eventsById.set(event.id, event);
			}
		}
		for (const event of allUserEvents) {
			if (event.visibility === 'public' && isPromotionActive(event)) {
				eventsById.set(event.id, event);
			}
		}

		return Array.from(eventsById.values());
	});

	let pendingInvites = $derived(invites.filter((i) => i.status === 'pending'));
	let nextEvent = $derived(getUpcomingEvents(allUserEvents)[0] ?? null);
	let activeEventsCount = $derived(getUpcomingEvents(allUserEvents).length);

	function greeting() {
		const h = new Date().getHours();
		if (h < 12) return 'Good morning';
		if (h < 18) return 'Good afternoon';
		return 'Good evening';
	}

	function formatDate(dateValue: unknown) {
		try {
			const ts = dateValue as { toDate?: () => Date };
			if (ts?.toDate) {
				return ts.toDate().toLocaleString('en-GB', {
					weekday: 'short',
					day: '2-digit',
					month: 'short',
					hour: '2-digit',
					minute: '2-digit'
				});
			}
			return 'Date not set';
		} catch {
			return 'Date not set';
		}
	}

	async function refreshDashboardData(userId: string) {
		const [createdEvents, participantEvents, loadedInvites] = await Promise.all([
			getEventsCreatedByUser(userId),
			getEventsForUser(userId),
			getInvitesForUser(userId)
		]);
		const eventsById = new SvelteMap<string, SportEvent>();
		for (const event of createdEvents) eventsById.set(event.id, event);
		for (const event of participantEvents) eventsById.set(event.id, event);
		allUserEvents = sortEventsByStartDate(Array.from(eventsById.values()));

		// Auto-detect and notify/mark finished events
		for (const event of allUserEvents) {
			if (isEventFinished(event) && event.status !== 'finished' && event.status !== 'cancelled') {
				void notifyEventFinished(event);
			}
		}

		events = allUserEvents.filter((event) => event.creatorId === userId);
		joinedEvents = allUserEvents.filter(
			(event) => event.creatorId !== userId && event.participantIds.includes(userId)
		);
		invites = loadedInvites;
	}

	onMount(() => {
		let unsubscribePromotions = () => {};
		let unsubscribeEvents = () => {};
		let unsubscribeActivity = () => {};
		const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
			unsubscribePromotions();
			unsubscribeEvents();
			unsubscribeActivity();
			if (!currentUser) {
				await goto(resolve('/'));
				return;
			}

			user = currentUser;
			loading = true;
			error = '';

			try {
				profile = await ensureUserProfile(currentUser);
				await refreshDashboardData(currentUser.uid);
				unsubscribePromotions = subscribeToPromotedEventsForUser(
					currentUser.uid,
					profile,
					(loadedEvents) => (promotedEvents = loadedEvents),
					(err) => console.error('Promoted events listener error:', err)
				);
				unsubscribeEvents = subscribeToEventCatalogChanges(() => {
					void refreshDashboardData(currentUser.uid);
				});
				unsubscribeActivity = subscribeToUserActivityChanges(currentUser.uid, () => {
					void refreshDashboardData(currentUser.uid);
				});
			} catch (err) {
				console.error('Dashboard load error:', err);
				if (err instanceof Error && err.message.includes('index')) {
					error = 'Your events are still being prepared. Please try again in a moment.';
				} else if (err instanceof Error && err.message.includes('permissions')) {
					error = 'You do not have permission to load these events.';
				} else {
					error = 'Could not load your dashboard data.';
				}
			} finally {
				loading = false;
			}
		});

		return () => {
			unsubscribe();
			unsubscribePromotions();
			unsubscribeEvents();
			unsubscribeActivity();
		};
	});
</script>

{#if loading}
	<div class="mx-auto max-w-6xl animate-pulse px-4 py-5 sm:px-5 sm:py-8">
		<!-- Header -->
		<div class="mb-7 flex items-start justify-between">
			<div>
				<div class="h-3 w-20 rounded-full bg-slate-200 dark:bg-slate-800"></div>
				<div class="mt-2 h-7 w-44 rounded-full bg-slate-200 dark:bg-slate-800"></div>
				<div class="mt-3 flex gap-4">
					<div class="h-3 w-24 rounded-full bg-slate-200 dark:bg-slate-800"></div>
					<div class="h-3 w-16 rounded-full bg-slate-200 dark:bg-slate-800"></div>
				</div>
			</div>
			<div class="flex items-center gap-3">
				<div class="h-10 w-32 rounded-full bg-slate-200 dark:bg-slate-800"></div>
				<div class="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800"></div>
			</div>
		</div>

		<div class="grid gap-6 lg:grid-cols-[1fr_300px]">
			<!-- Left column -->
			<div class="space-y-5">
				<!-- Next up card -->
				<div class="rounded-3xl bg-blue-50 p-6 dark:bg-blue-950/20">
					<div class="h-3 w-16 rounded-full bg-blue-100 dark:bg-blue-900/50"></div>
					<div class="mt-3 h-6 w-2/3 rounded-full bg-blue-100 dark:bg-blue-900/50"></div>
					<div class="mt-3 flex gap-5">
						<div class="h-3 w-28 rounded-full bg-blue-100 dark:bg-blue-900/50"></div>
						<div class="h-3 w-24 rounded-full bg-blue-100 dark:bg-blue-900/50"></div>
					</div>
					<div class="mt-4 flex items-center gap-3">
						<div class="h-1.5 flex-1 rounded-full bg-blue-100 dark:bg-blue-900/50"></div>
						<div class="h-3 w-20 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/50"></div>
					</div>
				</div>

				<!-- Sponsored section -->
				<div class="rounded-3xl border border-slate-200 p-5 dark:border-slate-800">
					<div class="mb-4 flex items-end justify-between">
						<div class="space-y-2">
							<div class="h-3 w-20 rounded-full bg-slate-200 dark:bg-slate-800"></div>
							<div class="h-5 w-48 rounded-full bg-slate-200 dark:bg-slate-800"></div>
						</div>
						<div class="h-3 w-14 rounded-full bg-slate-200 dark:bg-slate-800"></div>
					</div>
					<div class="h-28 rounded-2xl bg-slate-100 dark:bg-slate-800"></div>
				</div>

				<!-- Tabs + event card skeletons -->
				<div>
					<div class="mb-4 flex gap-6 border-b border-slate-200 pb-3 dark:border-slate-800">
						<div class="h-4 w-16 rounded-full bg-slate-200 dark:bg-slate-800"></div>
						<div class="h-4 w-14 rounded-full bg-slate-200 dark:bg-slate-800"></div>
					</div>
					<div class="space-y-3">
						{#each [0, 1, 2] as _}
							<div class="rounded-4xl border border-slate-200 p-5 dark:border-slate-800">
								<div class="flex items-start justify-between gap-4">
									<div class="min-w-0 flex-1 space-y-2.5">
										<div class="h-3 w-12 rounded-full bg-slate-200 dark:bg-slate-800"></div>
										<div class="h-5 w-3/4 rounded-full bg-slate-200 dark:bg-slate-800"></div>
										<div class="h-3 w-40 rounded-full bg-slate-200 dark:bg-slate-800"></div>
										<div class="h-3 w-32 rounded-full bg-slate-200 dark:bg-slate-800"></div>
									</div>
									<div class="h-14 w-14 shrink-0 rounded-2xl bg-slate-100 dark:bg-slate-800"></div>
								</div>
								<div class="mt-4">
									<div class="h-6 w-20 rounded-full bg-slate-100 dark:bg-slate-800"></div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- Right sidebar -->
			<div class="space-y-4">
				<div class="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800">
					<div
						class="flex justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800"
					>
						<div class="h-3 w-16 rounded-full bg-slate-200 dark:bg-slate-800"></div>
						<div class="h-3 w-12 rounded-full bg-slate-200 dark:bg-slate-800"></div>
					</div>
					<div class="h-44 bg-slate-100 dark:bg-slate-800"></div>
				</div>
				<div class="grid grid-cols-2 gap-2">
					<div
						class="h-20 rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
					></div>
					<div
						class="h-20 rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
					></div>
				</div>
			</div>
		</div>
	</div>
{:else}
	<div class="mx-auto max-w-6xl px-4 py-5 sm:px-5 sm:py-8">
		<!-- Header -->
		<header class="mb-6 flex items-start justify-between gap-4 sm:mb-8">
			<div class="min-w-0">
				<p class="text-sm font-bold text-slate-400 dark:text-slate-500">{greeting()}</p>
				<h1 class="mt-1 truncate text-3xl font-black tracking-tight text-slate-950 dark:text-slate-50 sm:text-4xl">
					{profile?.displayName ?? user?.displayName ?? 'Athlete'}
				</h1>
			</div>

			<div class="flex shrink-0 items-center gap-3">
				<a
					href={resolve('/events/create')}
					class="grid h-11 w-11 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 sm:hidden"
					aria-label="Create event"
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5" aria-hidden="true">
						<path d="M12 5v14" /><path d="M5 12h14" />
					</svg>
				</a>
				<a
					href={resolve('/events/create')}
					class="hidden items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 sm:inline-flex"
				>
					Create event
				</a>
				<a href={resolve('/profile')} class="rounded-full transition hover:opacity-80" aria-label="Profile">
					<UserAvatar photoURL={profile?.photoURL ?? user?.photoURL} displayName={profile?.displayName ?? user?.displayName} email={profile?.email ?? user?.email} size="md" />
				</a>
			</div>
		</header>

		<section class="mb-6 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-200 py-4 text-center dark:divide-slate-800 dark:border-slate-800 sm:max-w-xl">
			<div>
				<p class="text-xl font-black text-slate-950 dark:text-slate-50">{events.length}</p>
				<p class="text-xs font-bold text-slate-500 dark:text-slate-400">Created</p>
			</div>
			<div>
				<p class="text-xl font-black text-slate-950 dark:text-slate-50">{activeEventsCount}</p>
				<p class="text-xs font-bold text-slate-500 dark:text-slate-400">Active</p>
			</div>
			<a href={resolve('/messages')} class="block transition hover:text-blue-600 dark:hover:text-blue-400">
				<p class="text-xl font-black text-slate-950 dark:text-slate-50">{pendingInvites.length}</p>
				<p class="text-xs font-bold text-slate-500 dark:text-slate-400">Invites</p>
			</a>
		</section>

		{#if error}
			<div
				class="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
			>
				{error}
			</div>
		{/if}

		<div class="grid gap-6 lg:grid-cols-[1fr_300px]">
			<!-- Left column -->
			<div class="min-w-0 space-y-5">
				<!-- Next up -->
				<section class="space-y-3">
					<div class="flex items-center justify-between gap-3">
						<div>
							<p class="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Next up</p>
							<h2 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50">Your next rally</h2>
						</div>
						<a href={resolve('/explore')} class="text-sm font-black text-blue-600 dark:text-blue-400">Explore</a>
					</div>

					{#if nextEvent}
						<EventCard event={nextEvent} />
					{:else}
						<div class="rounded-[1.7rem] bg-white p-5 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
							<p class="font-black text-slate-950 dark:text-slate-50">No upcoming games</p>
							<p class="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">Create an event or find one near you.</p>
							<div class="mt-4 flex gap-2">
								<a href={resolve('/events/create')} class="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white transition hover:bg-blue-700">Create</a>
								<a href={resolve('/explore')} class="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">Explore</a>
							</div>
						</div>
					{/if}
				</section>

				<nav class="grid grid-cols-3 gap-2 text-center sm:hidden">
					<a href={resolve('/explore')} class="rounded-2xl bg-white px-3 py-3 text-xs font-black text-slate-600 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">Explore</a>
					<a href={resolve('/events/create')} class="rounded-2xl bg-blue-600 px-3 py-3 text-xs font-black text-white shadow-sm shadow-blue-600/20">Create</a>
					<a href={resolve('/messages')} class="rounded-2xl bg-white px-3 py-3 text-xs font-black text-slate-600 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">Messages</a>
				</nav>

				<section class="space-y-3">
					<div class="flex items-end justify-between gap-4">
						<div>
							<p class="text-xs font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">For you</p>
							<h2 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50">Promoted nearby</h2>
						</div>
						<a href={resolve('/explore')} class="shrink-0 text-sm font-black text-blue-600 hover:text-blue-700 dark:text-blue-400">See all</a>
					</div>

					{#if visiblePromotedEvents.length > 0}
						<PromotedEventCarousel events={visiblePromotedEvents} />
					{:else}
						<div class="rounded-[1.5rem] border border-dashed border-slate-200 bg-white/70 p-5 text-sm dark:border-slate-800 dark:bg-slate-900/70">
							<p class="font-black text-slate-800 dark:text-slate-100">No promoted events right now</p>
							<p class="mt-1 text-slate-500 dark:text-slate-400">When clubs promote public events near you, they will appear here.</p>
						</div>
					{/if}
				</section>

				<!-- Your activity -->
				<section class="space-y-4">
					<div class="flex items-end justify-between gap-4">
						<div>
							<p class="text-xs font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Activity</p>
							<h2 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50">My events</h2>
						</div>
					</div>

					<div
						class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800"
					>
						<div class="flex items-center gap-1">
							<button
								type="button"
								onclick={() => (activeTab = 'hosting')}
								class={`relative pb-3 pr-5 text-sm font-bold transition ${
									activeTab === 'hosting'
										? 'text-slate-950 dark:text-slate-50'
										: 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
								}`}
							>
								Hosting
								{#if currentHostingEvents.length > 0}
									<span
										class="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300"
									>
										{currentHostingEvents.length}
									</span>
								{/if}
								{#if activeTab === 'hosting'}
									<span
										class="absolute bottom-0 left-0 right-5 h-0.5 rounded-full bg-slate-950 dark:bg-white"
									></span>
								{/if}
							</button>

							<button
								type="button"
								onclick={() => (activeTab = 'joined')}
								class={`relative pb-3 pr-5 text-sm font-bold transition ${
									activeTab === 'joined'
										? 'text-slate-950 dark:text-slate-50'
										: 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
								}`}
							>
								Joined
								{#if currentJoinedEvents.length > 0}
									<span
										class="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300"
									>
										{currentJoinedEvents.length}
									</span>
								{/if}
								{#if activeTab === 'joined'}
									<span
										class="absolute bottom-0 left-0 right-5 h-0.5 rounded-full bg-slate-950 dark:bg-white"
									></span>
								{/if}
							</button>
						</div>

						<button
							type="button"
							onclick={() => (showPastEvents = !showPastEvents)}
							class={`mb-3 rounded-full border px-4 py-1.5 text-xs font-bold transition-all duration-200 flex items-center gap-1.5 shadow-sm active:scale-95 ${
								showPastEvents
									? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300'
									: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/80 dark:hover:border-slate-700'
							}`}
						>
							{#if showPastEvents}
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="h-3.5 w-3.5 text-blue-600 dark:text-blue-400"
									aria-hidden="true"
								>
									<path
										d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"
									/>
									<path d="m9 12 2 2 4-4" />
								</svg>
								View active events
							{:else}
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="h-3.5 w-3.5 text-slate-400 dark:text-slate-500"
									aria-hidden="true"
								>
									<circle cx="12" cy="12" r="10" />
									<polyline points="12 6 12 12 16 14" />
								</svg>
								View past events
							{/if}
						</button>
					</div>

					{#if activeTab === 'hosting'}
						{#if currentHostingEvents.length === 0}
							<div
								class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900"
							>
								<p class="text-sm text-slate-500 dark:text-slate-400">
									{showPastEvents ? 'No past events found.' : 'No upcoming events created yet.'}
								</p>
								{#if !showPastEvents}
									<a
										href={resolve('/events/create')}
										class="mt-3 inline-flex rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
									>
										Create your first event
									</a>
								{/if}
							</div>
						{:else}
							<div class="space-y-3">
								{#each currentHostingEvents as event (event.id)}
									<EventCard {event} />
								{/each}
							</div>
						{/if}
					{:else}
						{#if currentJoinedEvents.length === 0}
							<div
								class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900"
							>
								<p class="text-sm text-slate-500 dark:text-slate-400">
									{showPastEvents
										? 'No past joined events found.'
										: "You haven't joined any upcoming events yet."}
								</p>
								{#if !showPastEvents}
									<a
										href={resolve('/explore')}
										class="mt-3 inline-flex rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
									>
										Find events near you
									</a>
								{/if}
							</div>
						{:else}
							<div class="space-y-3">
								{#each currentJoinedEvents as event (event.id)}
									<EventCard {event} />
								{/each}
							</div>
						{/if}
					{/if}
				</section>
			</div>

			<!-- Right column -->
			<aside class="grid grid-cols-2 gap-3 lg:block lg:space-y-4">
				<!-- Nearby map -->
				<div
					class="col-span-2 overflow-hidden rounded-[1.7rem] bg-white shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800"
				>
					<div
						class="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800"
					>
						<p class="text-sm font-bold text-slate-950 dark:text-slate-50">Nearby</p>
						<a
							href={resolve('/explore')}
							class="text-xs font-bold text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
						>
							View all
						</a>
					</div>
					<UserMiniMap userId={user?.uid} />
				</div>

				<!-- Pending invites -->
				{#if pendingInvites.length > 0}
					<a
						href={resolve('/messages')}
						class="col-span-2 flex items-center justify-between rounded-[1.5rem] bg-blue-50 p-4 shadow-sm ring-1 ring-blue-100 transition hover:bg-blue-100 dark:bg-blue-950/30 dark:ring-blue-900/50 dark:hover:bg-blue-950/50"
					>
						<div>
							<p class="text-sm font-bold text-slate-950 dark:text-slate-50">
								{pendingInvites.length} pending {pendingInvites.length === 1 ? 'invite' : 'invites'}
							</p>
							<p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Tap to respond</p>
						</div>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-4 w-4 shrink-0 text-slate-400"
							aria-hidden="true"
						>
							<path d="M9 18l6-6-6-6" />
						</svg>
					</a>
				{/if}

				<!-- Quick links -->
				<div class="col-span-2 grid grid-cols-2 gap-2">
					<a
						href={resolve('/explore')}
						class="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-5 w-5 text-slate-400"
							aria-hidden="true"
						>
							<circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
						</svg>
						<p class="text-sm font-bold text-slate-950 dark:text-slate-50">Explore</p>
					</a>
					<a
						href={resolve('/messages')}
						class="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-5 w-5 text-slate-400"
							aria-hidden="true"
						>
							<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
						</svg>
						<p class="text-sm font-bold text-slate-950 dark:text-slate-50">Messages</p>
					</a>
				</div>
			</aside>
		</div>
	</div>
{/if}
