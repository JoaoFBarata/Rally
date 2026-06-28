<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import { auth } from '$lib/firebase';
	import type { EventStatus, SportEvent } from '$lib/schema';
	import {
		isPromotionActive,
		trackEventPromotionClick,
		trackEventPromotionView
	} from '$lib/services/event.service';

	let { event, showImage = true } = $props<{
		event: SportEvent;
		showImage?: boolean;
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

	function getTimestampMillis(value: unknown) {
		try {
			const timestamp = value as {
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

		const finishAtMs = getTimestampMillis(event.endAt) || getTimestampMillis(event.startAt);

		if (finishAtMs && finishAtMs < Date.now()) return 'finished';

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
		if (status === 'finished' || status === 'cancelled') {
			return 'border-red-100 bg-white/80 shadow-slate-200/60 hover:border-red-200 hover:bg-red-50/30 dark:border-red-950/50 dark:bg-slate-900/80 dark:shadow-none dark:hover:border-red-900/60 opacity-75';
		}
		if (showPromotion) {
			return 'border-blue-200 bg-white shadow-blue-100/80 hover:border-blue-400 hover:bg-blue-50/30 dark:border-blue-900/70 dark:bg-slate-900 dark:shadow-none dark:hover:border-blue-500';
		}

		return 'border-slate-200 bg-white shadow-slate-200/70 hover:border-blue-200 hover:bg-blue-50/30 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none dark:hover:border-blue-700 dark:hover:bg-slate-800';
	}

	function getMiniMapUrl() {
		const lat = event.location?.lat;
		const lng = event.location?.lng;

		if (!PUBLIC_MAPBOX_ACCESS_TOKEN || typeof lat !== 'number' || typeof lng !== 'number') {
			return '';
		}

		const marker = `pin-s+2563eb(${lng},${lat})`;
		return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${marker}/${lng},${lat},13,0/176x128@2x?access_token=${PUBLIC_MAPBOX_ACCESS_TOKEN}`;
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
	class={`group flex h-full min-h-[8.25rem] overflow-hidden rounded-[1.5rem] border shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${getCardClasses()}`}
>
	{#if showImage}
		<div
			class={`relative w-24 shrink-0 overflow-hidden bg-blue-50 dark:bg-blue-950/40 sm:w-32 lg:w-40 ${
				showPromotion ? 'bg-blue-50 dark:bg-blue-950/40' : 'bg-slate-100 dark:bg-slate-800'
			}`}
		>
			{#if event.groupPhotoURL}
				<img src={event.groupPhotoURL} alt={event.title} class="h-full w-full object-cover" />
			{:else if getMiniMapUrl()}
				<img src={getMiniMapUrl()} alt={event.location.name} class="h-full w-full object-cover" />
			{:else}
				<div class="grid h-full w-full place-items-center text-3xl font-black text-blue-500/70">
					{event.title.charAt(0).toUpperCase()}
				</div>
			{/if}

			{#if showPromotion}
				<span
					class="absolute left-3 top-3 rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-lg shadow-blue-700/20"
				>
					Promoted
				</span>
			{:else}
				<span
					class="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black text-slate-700 shadow-sm backdrop-blur dark:bg-slate-950/85 dark:text-slate-200"
				>
					{formatDate(event.startAt)}
				</span>
			{/if}
		</div>
	{/if}

	<div class="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
		{#if showPromotion}
			<div class="mb-3 flex items-center justify-between gap-3">
				<span
					class="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-blue-700 dark:bg-blue-950 dark:text-blue-300"
				>
					Sponsored
				</span>

				<span class="truncate text-xs font-bold text-slate-500 dark:text-slate-400">
					Selected for you
				</span>
			</div>
		{/if}

		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0 flex-1">
				{#if event.hostType === 'organization'}
					<div class="mb-2 hidden min-w-0 items-center gap-2 sm:flex">
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

				<div class="flex min-h-8 flex-wrap items-center gap-2">
					<p class="text-xs font-black uppercase tracking-wide text-blue-600 dark:text-blue-400">
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

				<h3 class="mt-1 line-clamp-2 text-base font-black leading-tight text-slate-950 dark:text-slate-50 sm:text-lg">
					{event.title}
				</h3>

				<p class="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
					📍 {event.location.name}
				</p>

				<p class="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:mt-1 sm:text-sm">
					🕒 {formatDate(event.startAt)}
				</p>
			</div>

			<div class="shrink-0 rounded-2xl bg-slate-50 px-3 py-2 text-center dark:bg-slate-800">
				<p class="text-sm font-black text-blue-600 dark:text-blue-300">
					{event.participantIds.length}/{event.maxParticipants}
				</p>

				<p class="text-xs font-medium text-slate-500 dark:text-slate-400">players</p>
			</div>
		</div>

		<div class="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2 sm:pt-3">
			<span
				class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300"
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
