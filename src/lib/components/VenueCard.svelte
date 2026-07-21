<!--src/lib/components/VenueCard.svelte-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Venue } from '$lib/schema';
	import { formatSport, getSportBackgroundImage } from '$lib/utils/format.utils';
	import { i18n } from '$lib/services/i18n.svelte';

	let { venue, rating = null }: { venue: Venue; rating?: { average: number; count: number } | null } =
		$props();
</script>

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
				<span
					class="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-lg"
				>
					{i18n.t('verified')}
				</span>
			{:else}
				<span
					class="rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-lg backdrop-blur"
				>
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
			{#if rating?.count}
				<p class="text-xs font-black text-yellow-500">
					★ {rating.average.toFixed(1)}
					<span class="font-bold text-slate-400 dark:text-slate-500">
						({rating.count})
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
