<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { getEventById, getEffectiveEventStatus } from '$lib/services/event.service';
	import type { SportEvent } from '$lib/schema';
	import { goBack } from '$lib/utils/navigation';
	import { formatDate, formatSport } from '$lib/utils/format.utils';
	import { i18n } from '$lib/services/i18n.svelte';

	let loading = $state(true);
	let savedEvents = $state<SportEvent[]>([]);

	function getSavedIds() {
		if (typeof localStorage === 'undefined') return [];
		try {
			const saved = JSON.parse(localStorage.getItem('rally-saved-events') ?? '[]') as string[];
			return Array.isArray(saved) ? saved : [];
		} catch {
			return [];
		}
	}

	function toDate(value: unknown) {
		if (!value) return null;
		if (value instanceof Date) return value;

		if (typeof value === 'string' || typeof value === 'number') {
			const date = new Date(value);
			return Number.isNaN(date.getTime()) ? null : date;
		}

		const timestamp = value as {
			toDate?: () => Date;
			toMillis?: () => number;
			seconds?: number;
		};

		if (typeof timestamp.toDate === 'function') return timestamp.toDate();
		if (typeof timestamp.toMillis === 'function') return new Date(timestamp.toMillis());
		if (typeof timestamp.seconds === 'number') return new Date(timestamp.seconds * 1000);

		return null;
	}

	function formatShortDate(value: unknown) {
		return formatDate(value);
	}

	function getStatusLabel(event: SportEvent) {
		const status = getEffectiveEventStatus(event);
		if (status === 'cancelled') return i18n.t('status_cancelled');
		if (status === 'finished') return i18n.t('status_finished');
		if (status === 'full') return i18n.t('status_full');
		if (status === 'open') return i18n.t('status_open');
		return status;
	}

	onMount(async () => {
		const ids = getSavedIds();
		const events = await Promise.all(ids.map((id) => getEventById(id).catch(() => null)));
		savedEvents = events.filter((item): item is SportEvent => Boolean(item));
		loading = false;
	});
</script>

<div class="mx-auto w-full max-w-3xl px-5 pb-28 pt-5 sm:px-0 sm:pb-10 sm:pt-8">
	<button
		type="button"
		onclick={() => goBack(resolve('/settings'))}
		class="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
	>
		← {i18n.t('back')}
	</button>

	<div class="mt-5">
		<p class="text-xs font-black uppercase tracking-[0.24em] text-blue-600 dark:text-blue-400">{i18n.t('saved')}</p>
		<h1 class="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-slate-50">{i18n.t('saved_events')}</h1>
		<p class="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
			{i18n.t('saved_events_device_sub')}
		</p>
	</div>

	{#if loading}
		<p class="mt-8 font-bold text-slate-500 dark:text-slate-400">{i18n.t('loading_saved_events')}</p>
	{:else if savedEvents.length === 0}
		<section class="mt-8 rounded-[1.75rem] border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
			<p class="text-lg font-black text-slate-950 dark:text-slate-50">{i18n.t('no_saved_events')}</p>
			<p class="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
				{i18n.t('save_events_hint')}
			</p>
		</section>
	{:else}
		<div class="mt-6 divide-y divide-slate-200 overflow-hidden rounded-[1.75rem] bg-white shadow-sm ring-1 ring-slate-200/70 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
			{#each savedEvents as event (event.id)}
				<a href={resolve(`/events/${event.id}`)} class="flex min-w-0 items-center gap-3 p-4 transition hover:bg-slate-50 dark:hover:bg-slate-800 sm:gap-4">
					<div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-50 text-lg font-black text-blue-600 dark:bg-blue-950 dark:text-blue-300">
						{event.title.slice(0, 1).toUpperCase()}
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex min-w-0 items-start gap-2">
							<p class="min-w-0 flex-1 truncate text-base font-black text-slate-950 dark:text-slate-50">{event.title}</p>
							<span class="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
								{getStatusLabel(event)}
							</span>
						</div>
						<p class="mt-1 truncate text-sm font-semibold text-slate-500 dark:text-slate-400">
							{formatSport(event.customSport ?? event.sport)} · {formatShortDate(event.startAt)} · {event.location.name}
						</p>
					</div>
					<span class="shrink-0 text-2xl text-slate-300">›</span>
				</a>
			{/each}
		</div>
	{/if}
</div>
