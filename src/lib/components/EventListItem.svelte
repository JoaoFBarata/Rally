<script lang="ts">
	import { resolve } from '$app/paths';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import type { EventStatus, SportEvent } from '$lib/schema';

	let { event, label = '' } = $props<{
		event: SportEvent;
		label?: string;
	}>();

	function toDate(dateValue: unknown) {
		try {
			const timestamp = dateValue as { toDate?: () => Date };
			return timestamp?.toDate?.() ?? null;
		} catch {
			return null;
		}
	}

	function formatDate(dateValue: unknown) {
		const date = toDate(dateValue);
		if (!date) return 'Date not set';
		return date.toLocaleString('en-GB', {
			weekday: 'short',
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatShortDate(dateValue: unknown) {
		const date = toDate(dateValue);
		if (!date) return 'TBD';
		return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
	}

	function formatSport(sport: string) {
		return sport.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
	}

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
		if (status === 'cancelled') return 'Cancelled';
		if (status === 'finished') return 'Finished';
		if (status === 'full') return 'Full';
		if (status === 'open') return 'Open';
		return status;
	}

	function getStatusClasses() {
		const status = getEffectiveStatus();
		if (status === 'cancelled') return 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300';
		if (status === 'finished') return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
		if (status === 'full') return 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300';
		return 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300';
	}

	function getMiniMapUrl() {
		const lat = event.location.lat;
		const lng = event.location.lng;
		if (!PUBLIC_MAPBOX_ACCESS_TOKEN || typeof lat !== 'number' || typeof lng !== 'number') return '';

		const marker = `pin-s+2563eb(${lng},${lat})`;
		return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${marker}/${lng},${lat},13,0/168x128@2x?access_token=${PUBLIC_MAPBOX_ACCESS_TOKEN}`;
	}

	function formatPrice() {
		if (event.pricePerPerson) return `€${event.pricePerPerson.toFixed(2)} / person`;
		if (event.entryFeeAmount) return `€${event.entryFeeAmount.toFixed(2)}`;
		return 'Free';
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
		{#if getMiniMapUrl()}
			<img src={getMiniMapUrl()} alt={event.location.name} class="h-full w-full object-cover" />
		{:else if event.groupPhotoURL}
			<img src={event.groupPhotoURL} alt={event.title} class="h-full w-full object-cover" />
		{:else}
			<div class="grid h-full w-full place-items-center bg-blue-50 text-2xl font-black text-blue-600 dark:bg-blue-950 dark:text-blue-300">
				{event.title.charAt(0).toUpperCase()}
			</div>
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
			{formatSport(event.customSport ?? event.sport)} · {event.location.name}
		</p>

		<div class="mt-2 flex min-w-0 items-center justify-between gap-3 text-xs font-black text-slate-400 dark:text-slate-500">
			<span class="truncate">{formatDate(event.startAt)}</span>
			<span class="shrink-0">{formatPrice()}</span>
		</div>

		<div class="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
			<div class="h-full rounded-full bg-blue-600" style="width: {progress}%"></div>
		</div>
	</div>
</a>
