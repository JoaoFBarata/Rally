<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { auth } from '$lib/firebase';
	import type { EventStatus, SportEvent } from '$lib/schema';
	import {
		isPromotionActive,
		trackEventPromotionClick,
		trackEventPromotionView
	} from '$lib/services/event.service';

	let { event } = $props<{
		event: SportEvent;
	}>();

	let showPromotion = $derived(isPromotionActive(event) && event.promotionAudienceMatch !== false);

	function formatDate(dateValue: unknown) {
		try {
			const timestamp = dateValue as { toDate?: () => Date };

			if (timestamp?.toDate) {
				return timestamp.toDate().toLocaleString('en-GB', {
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

		const startAtMs = getEventStartAtMillis();

		if (startAtMs && startAtMs < Date.now()) return 'finished';

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

		if (status === 'cancelled') {
			return 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300';
		}

		if (status === 'finished') {
			return 'bg-red-100/70 text-red-700 dark:bg-red-900/40 dark:text-red-300';
		}

		if (status === 'full') {
			return 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300';
		}

		return 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300';
	}

	function getCardClasses() {
		const status = getEffectiveStatus();
		if (status === 'finished') {
			return 'border-red-200 bg-red-50/20 shadow-red-50/50 hover:border-red-300 hover:bg-red-50/30 dark:border-red-950/50 dark:bg-red-950/10 dark:shadow-none dark:hover:border-red-900/60 dark:hover:bg-red-950/20 opacity-75';
		}
		if (showPromotion) {
			return 'border-blue-300 bg-blue-50/40 shadow-blue-200/70 hover:border-blue-500 hover:bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20 dark:shadow-none dark:hover:border-blue-500 dark:hover:bg-blue-950/30';
		}

		return 'border-slate-200 bg-white shadow-slate-200/70 hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none dark:hover:border-blue-500 dark:hover:bg-slate-800';
	}

	function handleClick() {
		if (!showPromotion) return;
		const key = `rally:promotion-click:${event.id}`;
		if (browser && sessionStorage.getItem(key)) return;
		if (browser) sessionStorage.setItem(key, '1');
		void trackEventPromotionClick(event.id, auth.currentUser?.uid);
	}

	onMount(() => {
		if (!showPromotion) return;
		const key = `rally:promotion-view:${event.id}`;
		if (sessionStorage.getItem(key)) return;
		sessionStorage.setItem(key, '1');
		void trackEventPromotionView(event.id, auth.currentUser?.uid);
	});
</script>

<a
	href={`/events/${event.id}`}
	onclick={handleClick}
	class={`block overflow-hidden rounded-4xl border shadow-lg transition ${getCardClasses()}`}
>
	{#if event.groupPhotoURL}
		<img
			src={event.groupPhotoURL}
			alt={event.title}
			class="h-40 w-full object-cover"
		/>
	{/if}
	<div class="p-5">
	{#if showPromotion}
		<div class="mb-4 flex items-center justify-between gap-3">
			<span
				class="rounded-full bg-blue-600 px-3 py-1 text-xs font-black uppercase tracking-wide text-white dark:bg-blue-500"
			>
				Promoted
			</span>

			<span class="text-xs font-bold text-slate-500 dark:text-slate-400"> Sponsored event </span>
		</div>
	{/if}

	<div class="flex items-start justify-between gap-4">
		<div class="min-w-0 flex-1">
			{#if event.hostType === 'organization'}
				<div class="mb-3 flex min-w-0 items-center gap-2">
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-black text-blue-600 dark:bg-slate-800 dark:text-blue-300"
					>
						{#if event.organizationLogoURL}
							<img
								src={event.organizationLogoURL}
								alt={event.organizationName ?? 'Organization'}
								class="h-full w-full object-cover"
							/>
						{:else}
							{event.organizationName?.charAt(0).toUpperCase() ?? 'O'}
						{/if}
					</div>

					<p class="truncate text-xs font-black text-slate-500 dark:text-slate-400">
						Hosted by {event.organizationName ?? 'Organization'}
					</p>

					{#if event.organizationVerificationStatus === 'verified'}
						<span
							class="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300"
						>
							Verified
						</span>
					{/if}
				</div>
			{/if}

			<div class="flex flex-wrap items-center gap-2">
				<p class="text-sm font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">
					{event.sport}
				</p>

				<span class={`rounded-full px-3 py-1 text-xs font-black ${getStatusClasses()}`}>
					{getStatusLabel()}
				</span>

				{#if event.eventKind === 'tournament'}
					<span
						class="rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700 dark:bg-purple-950 dark:text-purple-300"
					>
						Tournament
					</span>
				{/if}

				{#if event.paymentMode === 'official'}
					<span
						class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
					>
						Protected payment
					</span>
				{/if}
			</div>

			<h3 class="mt-2 truncate text-xl font-black text-slate-950 dark:text-slate-50">
				{event.title}
			</h3>

			<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
				📍 {event.location.name}
			</p>

			<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
				🕒 {formatDate(event.startAt)}
			</p>
		</div>

		<div class="shrink-0 rounded-2xl bg-blue-50 px-3 py-2 text-center dark:bg-blue-950">
			<p class="text-sm font-black text-blue-600 dark:text-blue-300">
				{event.participantIds.length}/{event.maxParticipants}
			</p>

			<p class="text-xs font-medium text-slate-500 dark:text-slate-400">players</p>
		</div>
	</div>

	<div class="mt-4 flex flex-wrap items-center justify-between gap-2">
		<span
			class="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold capitalize text-slate-900 dark:bg-slate-800 dark:text-slate-300"
		>
			{event.level ?? 'casual'}
		</span>

		{#if event.pricePerPerson}
			<span class="text-sm font-medium text-slate-600 dark:text-slate-300">
				€{event.pricePerPerson.toFixed(2)} / person
			</span>
		{/if}
	</div>
	</div>
</a>
