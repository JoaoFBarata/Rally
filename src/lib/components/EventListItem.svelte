<script lang="ts">
	import { resolve } from '$app/paths';
	import { i18n } from '$lib/services/i18n.svelte';
	import type { EventStatus, SportEvent } from '$lib/schema';
	import EventWeather from '$lib/components/EventWeather.svelte';
	import {
		formatDate as formatDateUtil,
		formatShortDate,
		formatSport,
		formatPrice,
		getSportBackgroundImage
	} from '$lib/utils/format.utils';

	let { event, label = '' } = $props<{
		event: SportEvent;
		label?: string;
	}>();

	const formattedPrice = $derived(formatPrice(event));
	const formattedSport = $derived(formatSport(event.customSport ?? event.sport));
	const formattedDate = $derived(formatDateUtil(event.startAt, true));
	const defaultSportImage = $derived(getSportBackgroundImage(event.sport));
	const routeDistanceLabel = $derived(
		event.routeDistanceKm !== null && event.routeDistanceKm !== undefined
			? `${event.routeDistanceKm.toFixed(2)} km`
			: ''
	);

	function getEventStartAtMillis() {
		try {
			const timestamp = event.startAt as unknown as {
				toDate?: () => Date;
				toMillis?: () => number;
			};

			if (timestamp?.toMillis) return timestamp.toMillis();
			if (timestamp?.toDate) return timestamp.toDate().getTime();
			return 0;
		} catch {
			return 0;
		}
	}

	function getEffectiveStatus(): EventStatus {
		if (event.status === 'cancelled') return 'cancelled';
		if (event.status === 'finished') return 'finished';
		if (getEventStartAtMillis() && getEventStartAtMillis() < Date.now()) return 'finished';
		return event.status;
	}

	function getStatusLabel() {
		const status = getEffectiveStatus();
		if (status === 'cancelled') return i18n.t('status_cancelled');
		if (status === 'finished') return i18n.t('status_finished');
		if (status === 'full') return i18n.t('status_full');
		if (status === 'open') return i18n.t('status_open');
		return status;
	}

	function getStatusClasses() {
		const status = getEffectiveStatus();
		if (status === 'cancelled') return 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300';
		if (status === 'finished') return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
		if (status === 'full') return 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300';
		return 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300';
	}



	let progress = $derived(
		event.maxParticipants > 0
			? Math.min(Math.round((event.participantIds.length / event.maxParticipants) * 100), 100)
			: 0
	);
</script>

<a
	href={resolve(`/events/${event.id}`)}
	class="group flex min-w-0 max-w-full gap-3 overflow-hidden rounded-[1.45rem] bg-white p-3 shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900 dark:ring-slate-800 sm:rounded-[1.7rem] sm:p-4"
>
	<div
		class="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800 sm:h-24 sm:w-28"
	>
		{#if event.groupPhotoURL}
			<img src={event.groupPhotoURL} alt={event.title} class="h-full w-full object-cover" />
		{:else}
			<img src={defaultSportImage} alt={event.title} class="h-full w-full object-cover" />
		{/if}

		<span
			class="absolute bottom-2 left-2 rounded-full bg-white/95 px-2 py-1 text-[10px] font-black text-slate-700 shadow-sm dark:bg-slate-950/90 dark:text-slate-200"
		>
			{formatShortDate(event.startAt)}
		</span>
	</div>

	<div class="min-w-0 flex-1 py-0.5">
		<div class="flex min-w-0 items-start justify-between gap-2">
			<div class="min-w-0 flex-1">
				<div class="flex min-w-0 items-center gap-2">
					{#if label}
						<span class="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
							{label}
						</span>
					{/if}
					<span class={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${getStatusClasses()}`}>
						{getStatusLabel()}
					</span>
				</div>

				<h3 class="mt-1 truncate text-base font-black text-slate-950 dark:text-slate-50 sm:text-lg">
					{event.title}
				</h3>
			</div>

			<span class="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">
				{event.participantIds.length}/{event.maxParticipants}
			</span>
		</div>

		<p class="mt-1 truncate text-xs font-bold text-slate-500 dark:text-slate-400 sm:text-sm">
			{formattedSport} · {event.location.name}
		</p>

		<div class="mt-2 flex min-w-0 items-center justify-between gap-3 text-xs font-black text-slate-400 dark:text-slate-500">
			<div class="min-w-0 flex-1 flex items-center gap-1.5 overflow-hidden">
				<span class="truncate">{formattedDate}</span>
				<EventWeather lat={event.location.lat} lng={event.location.lng} startAt={event.startAt} size="sm" />
			</div>
			<span class="shrink-0">{routeDistanceLabel || formattedPrice}</span>
		</div>

		<div class="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
			<div class="h-full rounded-full bg-blue-600" style="width: {progress}%"></div>
		</div>
	</div>
</a>
