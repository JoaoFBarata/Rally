<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { getEventById } from '$lib/services/event.service';
	import { getVenueById } from '$lib/services/venue.service';
	import { bookmarkState } from '$lib/services/bookmark-state.svelte';
	import type { SportEvent, Venue } from '$lib/schema';
	import { goBack } from '$lib/utils/navigation';
	import { i18n } from '$lib/services/i18n.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import VenueCard from '$lib/components/VenueCard.svelte';

	let loading = $state(true);
	let activeTab = $state<'events' | 'venues'>('events');
	let savedEvents = $state<SportEvent[]>([]);
	let savedVenues = $state<Venue[]>([]);
	let refreshVersion = 0;

	async function loadSavedItems() {
		const version = ++refreshVersion;
		loading = true;
		const [events, venues] = await Promise.all([
			Promise.all(
				bookmarkState.getSavedIds('event').map((id) => getEventById(id).catch(() => null))
			),
			Promise.all(
				bookmarkState.getSavedIds('venue').map((id) => getVenueById(id).catch(() => null))
			)
		]);
		if (version !== refreshVersion) return;
		savedEvents = events.filter((item): item is SportEvent => Boolean(item));
		savedVenues = venues.filter((item): item is Venue => Boolean(item));
		loading = false;
	}

	onMount(() => {
		void loadSavedItems();
	});

	$effect(() => {
		bookmarkState.version;
		if (bookmarkState.ready) void loadSavedItems();
	});
</script>

<div class="mx-auto w-full max-w-4xl px-5 pb-28 pt-5 sm:px-0 sm:pb-10 sm:pt-8">
	<button
		type="button"
		onclick={() => goBack(resolve('/profile'))}
		class="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
	>
		← {i18n.t('back')}
	</button>

	<div class="mt-5">
		<p class="text-xs font-black uppercase tracking-[0.24em] text-blue-600 dark:text-blue-400">
			{i18n.t('saved')}
		</p>
		<h1 class="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-slate-50">
			{i18n.t('saved_events_venues')}
		</h1>
		<p class="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
			{i18n.t('saved_events_venues_sub')}
		</p>
	</div>

	<div class="mt-6 grid grid-cols-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
		<button
			type="button"
			onclick={() => (activeTab = 'events')}
			class={`rounded-xl px-4 py-2.5 text-sm font-black transition ${activeTab === 'events' ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
		>
			{i18n.t('saved_events')} ({savedEvents.length})
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'venues')}
			class={`rounded-xl px-4 py-2.5 text-sm font-black transition ${activeTab === 'venues' ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
		>
			{i18n.t('saved_venues')} ({savedVenues.length})
		</button>
	</div>

	{#if loading}
		<p class="mt-8 font-bold text-slate-500 dark:text-slate-400">
			{i18n.t('loading_saved_events')}
		</p>
	{:else if activeTab === 'events'}
		{#if savedEvents.length === 0}
			<section
				class="mt-8 rounded-[1.75rem] border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900"
			>
				<p class="text-lg font-black text-slate-950 dark:text-slate-50">
					{i18n.t('no_saved_events')}
				</p>
				<p class="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
					{i18n.t('save_events_hint')}
				</p>
			</section>
		{:else}
			<div class="mt-6 grid gap-4 md:grid-cols-2">
				{#each savedEvents as event (event.id)}
					<EventCard {event} variant="profile" />
				{/each}
			</div>
		{/if}
	{:else if savedVenues.length === 0}
		<section
			class="mt-8 rounded-[1.75rem] border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900"
		>
			<p class="text-lg font-black text-slate-950 dark:text-slate-50">
				{i18n.t('no_saved_venues')}
			</p>
			<p class="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
				{i18n.t('save_venues_hint')}
			</p>
		</section>
	{:else}
		<div class="mt-6 grid gap-4 md:grid-cols-2">
			{#each savedVenues as venue (venue.id)}
				<VenueCard {venue} variant="profile" />
			{/each}
		</div>
	{/if}
</div>
