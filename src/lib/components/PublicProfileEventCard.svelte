<script lang="ts">
	import { resolve } from '$app/paths';
	import { i18n } from '$lib/services/i18n.svelte';
	import type { SportEvent } from '$lib/schema';
	import {
		formatCapacity,
		formatPrice,
		formatSport,
		getCurrentLocale,
		getSportBackgroundImage
	} from '$lib/utils/format.utils';

	let {
		event,
		variant = 'featured',
		contextLabel = ''
	} = $props<{
		event: SportEvent;
		variant?: 'featured' | 'compact';
		contextLabel?: string;
	}>();

	function getEventStartMs() {
		const ts = event.startAt as unknown as { toMillis?: () => number; toDate?: () => Date };
		return ts?.toMillis?.() ?? ts?.toDate?.()?.getTime() ?? 0;
	}

	function getEventDate() {
		const startMs = getEventStartMs();
		return startMs ? new Date(startMs) : null;
	}

	function formatEventMonth() {
		const date = getEventDate();
		return date?.toLocaleDateString(getCurrentLocale(), { month: 'short' }).toUpperCase() ?? '-';
	}

	function formatEventDay() {
		const date = getEventDate();
		return date?.toLocaleDateString(getCurrentLocale(), { day: '2-digit' }) ?? '--';
	}

	function formatEventSchedule() {
		const date = getEventDate();
		if (!date) return i18n.t('date_not_set');
		return date.toLocaleDateString(getCurrentLocale(), {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getEventImage() {
		return event.groupPhotoURL || getSportBackgroundImage(event.sport);
	}

	function getEventLocation() {
		return event.location?.address || event.location?.name || i18n.t('location_not_set');
	}

	function formatEventCapacity() {
		return formatCapacity({
			participantIds: event.participantIds,
			maxParticipants: event.maxParticipants,
			eventKind: event.eventKind,
			maxTournamentEntries: event.maxTournamentEntries ?? undefined
		});
	}

	function formatEventPrice() {
		return formatPrice({
			pricePerPerson: event.pricePerPerson ?? undefined,
			entryFeeAmount: event.entryFeeAmount ?? undefined,
			priceTotal: event.priceTotal ?? undefined,
			maxParticipants: event.maxParticipants,
			currency: event.currency
		});
	}
</script>

{#if variant === 'compact'}
	<a
		href={resolve(`/events/${event.id}`)}
		class="group flex items-center gap-3 rounded-[1.5rem] bg-white p-3 shadow-sm shadow-slate-200/70 ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-100 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800"
	>
		<img src={getEventImage()} alt="" class="h-14 w-14 shrink-0 rounded-2xl object-cover" loading="lazy" />
		<div class="min-w-0 flex-1">
			{#if contextLabel}
				<p class="line-clamp-1 text-sm font-bold text-slate-500 dark:text-slate-400">{contextLabel}</p>
			{/if}
			<h3 class="line-clamp-1 text-base font-black text-slate-950 dark:text-slate-50">
				{event.title}
			</h3>
			<p class="mt-0.5 line-clamp-1 text-xs font-bold text-slate-500 dark:text-slate-400">
				{formatEventSchedule()}
			</p>
		</div>
	</a>
{:else}
	<a
		href={resolve(`/events/${event.id}`)}
		class="group flex min-w-0 gap-3 overflow-hidden rounded-[1.7rem] bg-white p-3 shadow-sm shadow-slate-200/70 ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-100 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800 dark:hover:shadow-none sm:gap-4 sm:p-4"
	>
		<div class="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800 sm:h-28 sm:w-36">
			<img
				src={getEventImage()}
				alt=""
				class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
				loading="lazy"
			/>
			<div class="absolute left-2 top-2 rounded-xl bg-blue-600 px-2 py-1 text-center text-white shadow-lg shadow-blue-950/20">
				<p class="text-[10px] font-black uppercase leading-none">{formatEventMonth()}</p>
				<p class="text-lg font-black leading-none">{formatEventDay()}</p>
			</div>
		</div>

		<div class="min-w-0 flex-1 py-0.5">
			<div class="flex min-w-0 items-center gap-2">
				<p class="truncate text-xs font-black uppercase tracking-wide text-blue-600 dark:text-blue-300">
					{formatSport(event.sport)}
				</p>
				{#if event.status}
					<span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black capitalize text-slate-500 dark:bg-slate-800 dark:text-slate-300">
						{i18n.t('status_' + event.status)}
					</span>
				{/if}
			</div>

			<h3 class="mt-1 line-clamp-1 text-lg font-black text-slate-950 dark:text-slate-50 sm:text-xl">
				{event.title}
			</h3>
			<p class="mt-1 line-clamp-1 text-xs font-bold text-slate-500 dark:text-slate-400 sm:text-sm">
				{formatEventSchedule()}
			</p>
			<p class="mt-1 line-clamp-1 text-xs font-bold text-slate-500 dark:text-slate-400 sm:text-sm">
				{getEventLocation()}
			</p>

			<div class="mt-3 flex min-w-0 items-center gap-2 text-xs font-black">
				<span class="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
					{formatEventCapacity()}
				</span>
				<span class="min-w-0 truncate rounded-full bg-slate-100 px-3 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
					{formatEventPrice()}
				</span>
			</div>
		</div>

		<div class="hidden shrink-0 place-items-center text-slate-300 transition group-hover:text-blue-600 sm:grid">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6" />
			</svg>
		</div>
	</a>
{/if}
