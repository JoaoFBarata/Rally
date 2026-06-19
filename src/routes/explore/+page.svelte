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

	let events = $state<SportEvent[]>([]);
	let loading = $state(true);
	let error = $state('');
	let currentUserId = $state('');
	let friendIds = $state<string[]>([]);
	let filteredEventCount = $state(0);
	let selectedMapEventId = $state<string | null>(null);
	let promotedEvents = $derived(events.filter((event) => isPromotionActive(event)));

	onMount(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			await goto(resolve('/login'));
			return;
		}
		currentUserId = currentUser.uid;

		try {
			events = await getVisibleEventsForUser(currentUser.uid);
			filteredEventCount = events.length;
			
			const friends = await getFriendsForUser(currentUser.uid);
			friendIds = friends.map((friend) => friend.id).filter(Boolean);
		} catch (err) {
			console.error('Explore events error:', err);

			if (err instanceof Error && err.message.includes('index')) {
				error = 'Firestore needs an index for this query. Check the console link.';
			} else if (err instanceof Error) {
				error = err.message;
			} else {
				error = 'Could not load events.';
			}
		} finally {
			loading = false;
		}
	});
</script>

<main class="mx-auto max-w-[1500px] px-5 py-8">
	<header class="mb-6">
		<RallyWordmark size="sm" />
		<h1 class="mt-2 text-3xl font-bold">Explore</h1>
		<p class="mt-1 text-slate-500">Find games, teams and sports partners nearby.</p>
	</header>

	{#if loading}
		<section class="rounded-4xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800">
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
				events={events}
				currentUserId={currentUserId}
				friendIds={friendIds}
				onFilteredCountChange={(count) => (filteredEventCount = count)}
				onSelectedEventChange={(eventId) => (selectedMapEventId = eventId)}
			/>
			{#if !selectedMapEventId}
				<div
					class="pointer-events-none absolute inset-x-4 bottom-4 z-20 md:inset-x-auto md:left-5 md:top-5 md:bottom-auto md:w-80"
				>
					<div class="pointer-events-auto space-y-3">
						<section
							class="rounded-[1.5rem] border border-blue-200 bg-white/95 p-4 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-blue-900 dark:bg-slate-950/95 dark:shadow-none"
						>
							<p class="text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
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
							<div class="max-h-[420px] space-y-3 overflow-y-auto pr-1">
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
	{/if}
</main>
