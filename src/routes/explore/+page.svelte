<!--src/routes/explore/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { getVisibleEventsForUser } from '$lib/services/explore.service';
	import { getFriendsForUser } from '$lib/services/social.service';
	import type { SportEvent } from '$lib/schema';
	import ExploreMap from '$lib/components/maps/ExploreMap.svelte';
	import RallyWordmark from '$lib/components/RallyWordmark.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import { isPromotionActive } from '$lib/services/event.service';
	import { subscribeToEventCatalogChanges } from '$lib/services/realtime.service';

	let events = $state<SportEvent[]>([]);
	let loading = $state(true);
	let error = $state('');
	let currentUserId = $state('');
	let friendIds = $state<string[]>([]);
	let filteredEventCount = $state(0);
	let selectedMapEventId = $state<string | null>(null);
	let promotedEvents = $derived(
		events.filter((event) => isPromotionActive(event) && event.promotionAudienceMatch !== false)
	);
	let refreshing = false;

	async function loadExploreData(userId: string) {
		if (refreshing) return;
		refreshing = true;
		try {
			events = await getVisibleEventsForUser(userId);
			filteredEventCount = events.length;
			const friends = await getFriendsForUser(userId);
			friendIds = friends.map((friend) => friend.id).filter(Boolean);
		} finally {
			refreshing = false;
		}
	}

	onMount(() => {
		let unsubscribeEvents = () => {};
		void (async () => {
			const currentUser = auth.currentUser;
			if (!currentUser) {
				await goto(resolve('/login'));
				return;
			}
			currentUserId = currentUser.uid;
			try {
				await loadExploreData(currentUser.uid);
				unsubscribeEvents = subscribeToEventCatalogChanges(() => {
					void loadExploreData(currentUser.uid);
				});
			} catch (err) {
				console.error('Explore events error:', err);
				error = err instanceof Error ? err.message : 'Could not load events.';
			} finally {
				loading = false;
			}
		})();
		return () => unsubscribeEvents();
	});
</script>

<main class="mx-auto max-w-[1500px] px-3 py-5 sm:px-5 sm:py-8">
	<header class="mb-6">
		<RallyWordmark size="sm" />
		<h1 class="mt-2 text-3xl font-bold">Explore</h1>
		<p class="mt-1 text-slate-500">Find games, teams and sports partners nearby.</p>
	</header>

	{#if loading}
		<section
			class="rounded-4xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800"
		>
			<p class="text-slate-500">Loading events...</p>
		</section>
	{:else if error}
		<section class="rounded-4xl border border-red-200 bg-red-50 p-8 text-red-700">
			{error}
		</section>
	{:else}
		<section
			class="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
		>
			<ExploreMap
				{events}
				{currentUserId}
				{friendIds}
				onFilteredCountChange={(count) => (filteredEventCount = count)}
				onSelectedEventChange={(eventId) => (selectedMapEventId = eventId)}
			/>
			{#if !selectedMapEventId}
				<div
					class="pointer-events-none absolute inset-x-3 bottom-3 z-20 hidden md:block md:inset-x-auto md:left-5 md:top-5 md:bottom-auto md:w-80"
				>
					<div class="pointer-events-auto space-y-3">
						<section
							class="rounded-[1.5rem] border border-blue-200 bg-white/95 p-4 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-blue-900 dark:bg-slate-950/95 dark:shadow-none"
						>
							<p
								class="text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400"
							>
								Promoted
							</p>

							<h2 class="mt-1 text-lg font-black text-slate-950 dark:text-slate-50">
								Featured near you
							</h2>

							<p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
								Organizations paid to boost these events.
							</p>
						</section>

						{#if promotedEvents.length}
							<div class="max-h-[48dvh] space-y-3 overflow-y-auto pr-1 md:max-h-[420px]">
								{#each promotedEvents.slice(0, 3) as event (event.id)}
									<EventCard {event} />
								{/each}
							</div>
						{:else}
							<div
								class="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/95 p-4 text-sm font-bold text-slate-500 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-950/95 dark:text-slate-400"
							>
								No promoted events right now.
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</section>

		<section class="mt-4 md:hidden">
			<div class="mb-3 flex items-end justify-between gap-3">
				<div>
					<p class="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
						Promoted
					</p>
					<h2 class="mt-1 text-lg font-black text-slate-950 dark:text-slate-50">
						Featured near you
					</h2>
				</div>
				<span class="text-xs font-bold text-slate-400">Sponsored</span>
			</div>

			{#if promotedEvents.length}
				<div class="flex snap-x gap-3 overflow-x-auto pb-2">
					{#each promotedEvents.slice(0, 5) as event (event.id)}
						<div class="w-[88vw] max-w-sm shrink-0 snap-start">
							<EventCard {event} />
						</div>
					{/each}
				</div>
			{:else}
				<div
					class="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
				>
					No promoted events right now.
				</div>
			{/if}
		</section>
	{/if}
</main>
