<!--src/routes/locations/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { onAuthStateChanged } from 'firebase/auth';
	import { goto } from '$app/navigation';
	import type { Sport, Venue, VenueReview } from '$lib/schema';
	import { getVenues, getVenueReviews, getRatingSummary } from '$lib/services/venue.service';
	import { formatSport, getSportBackgroundImage } from '$lib/utils/format.utils';
	import { i18n } from '$lib/services/i18n.svelte';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';

	let venues = $state<Venue[]>([]);
	let ratings = $state<Record<string, { average: number; count: number }>>({});
	let loading = $state(true);
	let error = $state('');
	let selectedSport = $state<Sport | null>(null);
	let selectedCity = $state<string | null>(null);

	let cities = $derived.by(() => {
		return [...new Set(venues.map((venue) => venue.city))].sort();
	});

	let filteredVenues = $derived.by(() => {
		return venues.filter((venue) => {
			if (selectedSport && !venue.sports.includes(selectedSport)) return false;
			if (selectedCity && venue.city !== selectedCity) return false;
			return true;
		});
	});

	async function loadVenues() {
		loading = true;
		error = '';
		try {
			venues = await getVenues();

			const ratingEntries = await Promise.all(
				venues.map(async (venue) => {
					try {
						const reviews = await getVenueReviews(venue.id);
						return [venue.id, getRatingSummary(reviews)] as [string, { average: number; count: number }];
					} catch (err) {
						console.error(`Load reviews for venue ${venue.id} error:`, err);
						return [venue.id, { average: 0, count: 0 }] as [string, { average: number; count: number }];
					}
				})
			);
			ratings = Object.fromEntries(ratingEntries);
		} catch (err) {
			console.error('Load venues error:', err);
			error = getFriendlyErrorMessage(err, i18n.t('no_locations_found'));
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, async (user) => {
			if (!user) {
				await goto(resolve('/login'));
				return;
			}
			await loadVenues();
		});

		return () => unsubscribe();
	});
</script>

<main class="mx-auto w-full max-w-6xl px-5 py-5 sm:px-8 sm:py-8">
	<header class="mb-6">
		<h1 class="text-2xl font-black text-slate-950 dark:text-white sm:text-3xl">
			{i18n.t('locations')}
		</h1>
		<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
			{i18n.t('locations_sub')}
		</p>
	</header>

	{#if !loading}
		<div class="mb-6 space-y-3">
			<div class="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				<button
					type="button"
					onclick={() => (selectedSport = null)}
					class={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
						selectedSport === null
							? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
							: 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-blue-950'
					}`}
				>
					{i18n.t('all')}
				</button>
				{#each [...new Set(venues.flatMap((v) => v.sports))].sort() as sport (sport)}
					<button
						type="button"
						onclick={() => (selectedSport = selectedSport === sport ? null : sport)}
						class={`shrink-0 rounded-full px-4 py-2 text-sm font-bold capitalize transition ${
							selectedSport === sport
								? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
								: 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-blue-950'
						}`}
					>
						{formatSport(sport)}
					</button>
				{/each}
			</div>

			{#if cities.length > 1}
				<div class="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					<button
						type="button"
						onclick={() => (selectedCity = null)}
						class={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
							selectedCity === null
								? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
								: 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
						}`}
					>
						{i18n.t('all_cities')}
					</button>
					{#each cities as city (city)}
						<button
							type="button"
							onclick={() => (selectedCity = selectedCity === city ? null : city)}
							class={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
								selectedCity === city
									? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
									: 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
							}`}
						>
							{city}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if loading}
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
			{#each Array(8) as _}
				<div class="h-56 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800"></div>
			{/each}
		</div>
	{:else if error}
		<div
			class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
		>
			{error}
		</div>
	{:else if filteredVenues.length === 0}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<div class="rounded-full bg-slate-100 p-4 text-3xl dark:bg-slate-800">📍</div>
			<h3 class="mt-4 text-lg font-black text-slate-950 dark:text-slate-50">
				{i18n.t('no_locations_found')}
			</h3>
		</div>
	{:else}
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
			{#each filteredVenues as venue (venue.id)}
				<a
					href={resolve(`/locations/${venue.id}`)}
					class="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-none"
				>
					<div class="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
						<img
							src={venue.photoURL || getSportBackgroundImage(venue.sports[0])}
							alt={venue.name}
							class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
						/>
						<div class="absolute inset-x-2 top-2 flex flex-wrap gap-1.5">
							{#if venue.verificationStatus === 'verified'}
								<span class="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-lg">
									{i18n.t('verified')}
								</span>
							{:else}
								<span class="rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-lg backdrop-blur">
									{i18n.t('not_verified')}
								</span>
							{/if}
						</div>
					</div>

					<div class="flex flex-1 flex-col p-3.5">
						<span class="text-[10px] font-black uppercase tracking-wide text-blue-600 dark:text-blue-400">
							{venue.sports.map((s) => formatSport(s)).join(' · ')}
						</span>

						<h3 class="mt-1 line-clamp-1 text-sm font-black leading-tight text-slate-950 dark:text-slate-50">
							{venue.name}
						</h3>

						<p class="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
							📍 {venue.city}
						</p>

						<div class="mt-auto pt-2.5">
							{#if ratings[venue.id]?.count}
								<p class="text-xs font-black text-yellow-500">
									★ {ratings[venue.id].average.toFixed(1)}
									<span class="font-bold text-slate-400 dark:text-slate-500">
										({ratings[venue.id].count})
									</span>
								</p>
							{:else}
								<p class="text-xs font-bold text-slate-400 dark:text-slate-500">
									{i18n.t('no_reviews_yet')}
								</p>
							{/if}
						</div>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</main>
