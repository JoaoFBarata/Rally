<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { onAuthStateChanged, type User } from 'firebase/auth';
	import {
		getEventsCreatedByUser,
		getEventsForUser,
		getUpcomingEvents,
		sortEventsByStartDate
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
		const eventsById = new Map<string, SportEvent>();
		for (const event of createdEvents) eventsById.set(event.id, event);
		for (const event of participantEvents) eventsById.set(event.id, event);
		allUserEvents = sortEventsByStartDate(Array.from(eventsById.values()));
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
	<div class="flex min-h-[70vh] items-center justify-center">
		<p class="text-slate-400 dark:text-slate-500">Loading...</p>
	</div>
{:else}
	<div class="mx-auto max-w-6xl px-4 py-5 sm:px-5 sm:py-8">
		<!-- Header -->
		<header class="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<p class="text-sm text-slate-400 dark:text-slate-500">{greeting()}</p>
				<h1 class="mt-0.5 text-2xl font-black text-slate-950 dark:text-slate-50">
					{profile?.displayName ?? user?.displayName ?? 'Athlete'}
				</h1>

				<!-- Inline stats -->
				<div
					class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400"
				>
					<span>
						<span class="font-bold text-slate-950 dark:text-slate-50">{events.length}</span>
						{events.length === 1 ? 'event' : 'events'} created
					</span>
					<span class="text-slate-300 dark:text-slate-600">·</span>
					<span>
						<span class="font-bold text-slate-950 dark:text-slate-50">{activeEventsCount}</span>
						active
					</span>
					{#if pendingInvites.length > 0}
						<span class="text-slate-300 dark:text-slate-600">·</span>
						<a
							href={resolve('/messages')}
							class="font-bold text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
						>
							{pendingInvites.length}
							{pendingInvites.length === 1 ? 'invite' : 'invites'} pending
						</a>
					{/if}
				</div>
			</div>

			<div class="flex w-full items-center gap-3 sm:w-auto sm:shrink-0">
				<a
					href={resolve('/events/create')}
					class="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 sm:flex-none"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-4 w-4"
						aria-hidden="true"
					>
						<path d="M12 5v14" /><path d="M5 12h14" />
					</svg>
					Create event
				</a>
				<a
					href={resolve('/profile')}
					class="rounded-full transition hover:opacity-80"
					aria-label="Profile"
				>
					<UserAvatar
						photoURL={profile?.photoURL ?? user?.photoURL}
						displayName={profile?.displayName ?? user?.displayName}
						email={profile?.email ?? user?.email}
						size="md"
					/>
				</a>
			</div>
		</header>

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
				{#if nextEvent}
					<a
						href={resolve(`/events/${nextEvent.id}`)}
						class="group block rounded-3xl border border-blue-100 bg-blue-50 p-6 transition hover:border-blue-200 hover:bg-blue-100/70 dark:border-blue-900/50 dark:bg-blue-950/20 dark:hover:border-blue-800 dark:hover:bg-blue-950/30"
					>
						<div class="flex items-center justify-between gap-2">
							<span
								class="text-xs font-bold uppercase tracking-widest text-blue-500 dark:text-blue-400"
							>
								Next up
							</span>
							<span
								class="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
							>
								{nextEvent.customSport ?? nextEvent.sport}
							</span>
						</div>

						<h2 class="mt-3 text-xl font-black text-slate-950 dark:text-slate-50">
							{nextEvent.title}
						</h2>

						<div
							class="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-500 dark:text-slate-400"
						>
							<span class="flex items-center gap-1.5">
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="h-4 w-4 shrink-0"
									aria-hidden="true"
								>
									<circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
								</svg>
								{formatDate(nextEvent.startAt)}
							</span>
							<span class="flex items-center gap-1.5">
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="h-4 w-4 shrink-0"
									aria-hidden="true"
								>
									<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle
										cx="12"
										cy="10"
										r="3"
									/>
								</svg>
								{nextEvent.location.name}
							</span>
						</div>

						<div class="mt-4 flex items-center gap-3">
							<div
								class="h-1.5 flex-1 overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900/60"
							>
								<div
									class="h-1.5 rounded-full bg-blue-500 dark:bg-blue-400"
									style="width: {Math.round(
										(nextEvent.participantIds.length / nextEvent.maxParticipants) * 100
									)}%"
								></div>
							</div>
							<span class="shrink-0 text-sm font-bold text-slate-700 dark:text-slate-300">
								{nextEvent.participantIds.length}/{nextEvent.maxParticipants} players
							</span>
						</div>
					</a>
				{:else}
					<div class="rounded-3xl border border-dashed border-slate-200 p-8 dark:border-slate-800">
						<p class="font-black text-slate-950 dark:text-slate-50">No upcoming games</p>
						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
							Create an event or find one near you.
						</p>
						<div class="mt-5 flex flex-wrap gap-3">
							<a
								href={resolve('/events/create')}
								class="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
							>
								Create event
							</a>
							<a
								href={resolve('/explore')}
								class="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
							>
								Explore
							</a>
						</div>
					</div>
				{/if}

				<section
					class="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-5 shadow-lg shadow-blue-100/60 dark:border-blue-900 dark:from-blue-950/40 dark:to-slate-900 dark:shadow-none"
				>
					<div class="mb-4 flex items-end justify-between gap-4">
						<div>
							<div class="flex items-center gap-2">
								<span
									class="rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white"
									>Sponsored</span
								>
								<p class="text-xs font-bold text-blue-600 dark:text-blue-400">Selected for you</p>
							</div>
							<h2 class="mt-2 text-xl font-black text-slate-950 dark:text-slate-50">
								Events worth discovering
							</h2>
						</div>
						<a
							href={resolve('/explore')}
							class="shrink-0 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
							>Explore all</a
						>
					</div>

					{#if promotedEvents.length > 0}
						<PromotedEventCarousel events={promotedEvents} />
					{:else}
						<div
							class="rounded-2xl border border-dashed border-blue-200 bg-white/70 p-5 text-sm dark:border-blue-900 dark:bg-slate-900/70"
						>
							<p class="font-black text-slate-800 dark:text-slate-100">
								No sponsored events available for you right now
							</p>
							<p class="mt-1 text-slate-500 dark:text-slate-400">
								Campaigns only appear when they are active, public, targeted to your country and not
								created or already joined by you.
							</p>
						</div>
					{/if}
				</section>

				<!-- Your activity -->
				<div>
					<div class="mb-4 flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
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
							{#if events.length > 0}
								<span
									class="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300"
								>
									{events.length}
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
							{#if joinedEvents.length > 0}
								<span
									class="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300"
								>
									{joinedEvents.length}
								</span>
							{/if}
							{#if activeTab === 'joined'}
								<span
									class="absolute bottom-0 left-0 right-5 h-0.5 rounded-full bg-slate-950 dark:bg-white"
								></span>
							{/if}
						</button>
					</div>

					{#if activeTab === 'hosting'}
						{#if events.length === 0}
							<div
								class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900"
							>
								<p class="text-sm text-slate-500 dark:text-slate-400">No events created yet.</p>
								<a
									href={resolve('/events/create')}
									class="mt-3 inline-flex rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
								>
									Create your first event
								</a>
							</div>
						{:else}
							<div class="space-y-3">
								{#each events as event (event.id)}
									<EventCard {event} />
								{/each}
							</div>
						{/if}
					{:else}
						{#if joinedEvents.length === 0}
							<div
								class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900"
							>
								<p class="text-sm text-slate-500 dark:text-slate-400">
									You haven't joined any events yet.
								</p>
								<a
									href={resolve('/explore')}
									class="mt-3 inline-flex rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
								>
									Find events near you
								</a>
							</div>
						{:else}
							<div class="space-y-3">
								{#each joinedEvents as event (event.id)}
									<EventCard {event} />
								{/each}
							</div>
						{/if}
					{/if}
				</div>
			</div>

			<!-- Right column -->
			<div class="grid grid-cols-2 gap-3 lg:block lg:space-y-4">
				<!-- Nearby map -->
				<div
					class="col-span-2 overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
				>
					<div
						class="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800"
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
						class="col-span-2 flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 p-4 transition hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/30 dark:hover:bg-blue-950/50"
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
			</div>
		</div>
	</div>
{/if}
