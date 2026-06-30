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

	let { event, showImage = true, variant = 'default', compactHero = false } = $props<{
		event: SportEvent;
		showImage?: boolean;
		variant?: 'default' | 'profile' | 'hero';
		compactHero?: boolean;
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

	function formatShortDate(dateValue: unknown) {
		try {
			const timestamp = dateValue as { toDate?: () => Date };

			if (timestamp?.toDate) {
				return timestamp.toDate().toLocaleDateString('en-GB', {
					day: '2-digit',
					month: 'short'
				});
			}
		} catch {
			// fall through
		}

		return 'Soon';
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

	function getProfileStatusLabel() {
		const status = getEffectiveStatus();
		if (status === 'cancelled') return 'Cancelled';
		if (status === 'finished') return 'Finished';
		if (event.eventKind === 'tournament') return 'Tournament';
		return status === 'open' || status === 'full' ? 'Upcoming' : 'Past';
	}

	function formatCapacity() {
		if (event.eventKind === 'tournament') {
			return `${event.participantIds?.length ?? 0}/${event.maxTournamentEntries ?? event.maxParticipants} entries`;
		}

		return `${event.participantIds?.length ?? 0}/${event.maxParticipants} joined`;
	}

	function formatPrice() {
		if (event.pricePerPerson) return `€${event.pricePerPerson.toFixed(2)} / person`;
		if (event.priceTotal) return `€${event.priceTotal.toFixed(2)} total`;
		return 'Free';
	}

	function formatSportLabel() {
		return event.sport.charAt(0).toUpperCase() + event.sport.slice(1);
	}

	function getHeroBackgroundClasses() {
		const backgrounds: Record<string, string> = {
			football: 'from-emerald-700 via-blue-700 to-slate-950',
			basketball: 'from-orange-600 via-rose-800 to-slate-950',
			tennis: 'from-lime-600 via-emerald-800 to-slate-950',
			padel: 'from-cyan-600 via-blue-800 to-slate-950',
			running: 'from-purple-600 via-blue-800 to-slate-950',
			cycling: 'from-sky-600 via-blue-800 to-slate-950',
			volleyball: 'from-amber-500 via-orange-800 to-slate-950',
			gym: 'from-zinc-600 via-slate-800 to-blue-950',
			other: 'from-blue-600 via-indigo-800 to-slate-950'
		};

		return backgrounds[event.sport] ?? backgrounds.other;
	}

	function getDefaultSportImage() {
		return `/event-backgrounds/${event.sport || 'other'}.png`;
	}

	function formatHeroCapacity() {
		const max = event.eventKind === 'tournament'
			? (event.maxTournamentEntries ?? event.maxParticipants)
			: event.maxParticipants;

		return `${event.participantIds.length}/${max}`;
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

{#if variant === 'hero'}
	<a
		href={`/events/${event.id}`}
		onclick={handleClick}
		class={`group relative block overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br ${getHeroBackgroundClasses()} text-white shadow-xl shadow-slate-300/40 transition hover:-translate-y-0.5 hover:shadow-2xl dark:shadow-none ${
			compactHero ? 'min-h-[13rem]' : 'min-h-[15.5rem] sm:min-h-[18rem]'
		}`}
	>
		<div class="absolute inset-0 opacity-70">
			{#if event.groupPhotoURL}
				<img src={event.groupPhotoURL} alt={event.title} class="h-full w-full object-cover" />
			{:else}
				<img src={getDefaultSportImage()} alt="" class="h-full w-full object-cover" />
			{/if}
		</div>
		{#if !event.groupPhotoURL}
			<div class="absolute inset-0 opacity-25">
				<div class="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/35"></div>
				<div class="absolute bottom-0 left-0 right-0 h-1/2 border-t border-white/25"></div>
				<div class="absolute left-8 top-0 h-full border-l border-white/15"></div>
				<div class="absolute right-8 top-0 h-full border-l border-white/15"></div>
			</div>
		{/if}
		<div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-slate-950/10"></div>
		<div class="pointer-events-none absolute inset-0 opacity-35">
			<div class="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/20 blur-2xl"></div>
			<div class="absolute bottom-8 left-8 h-28 w-28 rounded-full bg-blue-400/30 blur-3xl"></div>
		</div>

		<div class={`relative flex h-full min-h-[inherit] flex-col justify-between p-4 ${compactHero ? 'sm:p-4' : 'sm:p-5'}`}>
			<div class="flex items-start justify-between gap-3">
				<span class="rounded-full bg-emerald-500/90 px-3 py-1 text-xs font-black text-white shadow-lg shadow-emerald-950/20">
					{formatDate(event.startAt)}
				</span>
				<span class="rounded-full bg-white/90 px-3 py-1 text-xs font-black text-slate-950">
					{formatHeroCapacity()}
				</span>
			</div>

			<div>
				<div class="mb-3 flex flex-wrap gap-2">
					<span class="rounded-full bg-white/15 px-3 py-1 text-xs font-black backdrop-blur">
						{formatSportLabel()}
					</span>
					<span class="rounded-full bg-white/15 px-3 py-1 text-xs font-black capitalize backdrop-blur">
						{event.level ?? 'casual'}
					</span>
				</div>

				<h3 class={`${compactHero ? 'text-xl' : 'text-2xl sm:text-3xl'} max-w-[18rem] font-black leading-tight text-white`}>
					{event.title}
				</h3>
				<p class="mt-2 truncate text-sm font-bold text-white/80">
					{event.location.name}
				</p>

				<div class="mt-4 flex items-center justify-between gap-3">
					<span class="truncate text-sm font-bold text-white/75">
						{formatPrice()}
					</span>
					<span class="shrink-0 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-lg shadow-blue-950/25 transition group-hover:bg-blue-500">
						Join game
					</span>
				</div>
			</div>
		</div>
	</a>
{:else if variant === 'profile'}
	<a
		href={`/events/${event.id}`}
		onclick={handleClick}
		class={`group flex max-w-full gap-3 overflow-hidden rounded-[1.45rem] p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg sm:p-4 ${getCardClasses()}`}
	>
		{#if showImage}
			<div
				class="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800 sm:h-24 sm:w-32"
			>
				{#if getMiniMapUrl()}
					<img src={getMiniMapUrl()} alt={event.location.name} class="h-full w-full object-cover" />
				{:else if event.groupPhotoURL}
					<img src={event.groupPhotoURL} alt={event.title} class="h-full w-full object-cover" />
				{:else}
					<div class="grid h-full w-full place-items-center text-2xl font-black text-blue-600 dark:text-blue-300">
						{event.title.charAt(0).toUpperCase()}
					</div>
				{/if}

				<span
					class="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-slate-700 shadow-sm dark:bg-slate-950/90 dark:text-slate-200"
				>
					{formatShortDate(event.startAt)}
				</span>
			</div>
		{/if}

		<div class="min-w-0 flex-1 py-1">
			<div class="flex min-w-0 items-center gap-2">
				<p class="min-w-0 flex-1 truncate text-sm font-black text-slate-950 dark:text-slate-50 sm:text-base">
					{event.title}
				</p>
				<span
					class={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${getStatusClasses()}`}
				>
					{getProfileStatusLabel()}
				</span>
			</div>

			<p class="mt-1 truncate text-xs font-bold text-slate-500 dark:text-slate-400">
				{formatSportLabel()} - {event.location.name}
			</p>
			<p class="mt-2 truncate text-xs font-black text-slate-400 dark:text-slate-500">
				{formatDate(event.startAt)} - {formatCapacity()} - {formatPrice()}
			</p>
		</div>
	</a>
{:else}
<a
	href={`/events/${event.id}`}
	onclick={handleClick}
	class={`group flex h-full min-h-[6.7rem] overflow-hidden rounded-[1.35rem] border shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[8.25rem] sm:rounded-[1.5rem] ${getCardClasses()}`}
>
	{#if showImage}
		<div
			class={`relative w-20 shrink-0 overflow-hidden bg-blue-50 dark:bg-blue-950/40 sm:w-32 lg:w-40 ${
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
					class="absolute left-2 top-2 rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow-lg shadow-blue-700/20 sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[10px]"
				>
					Promoted
				</span>
			{:else}
				<span
					class="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-black text-slate-700 shadow-sm backdrop-blur dark:bg-slate-950/85 dark:text-slate-200 sm:bottom-3 sm:left-3 sm:px-2.5 sm:py-1 sm:text-[10px]"
				>
					{formatDate(event.startAt)}
				</span>
			{/if}
		</div>
	{/if}

	<div class="flex min-w-0 flex-1 flex-col p-2.5 sm:p-4">
		{#if showPromotion}
			<div class="mb-2 hidden items-center justify-between gap-3 sm:flex">
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

				<div class="flex min-h-0 flex-wrap items-center gap-1.5 sm:min-h-8 sm:gap-2">
					<p class="text-xs font-black uppercase tracking-wide text-blue-600 dark:text-blue-400">
						{event.sport}
					</p>

					<span class={`rounded-full px-2 py-0.5 text-[10px] font-black sm:px-3 sm:py-1 sm:text-xs ${getStatusClasses()}`}>
						{getStatusLabel()}
					</span>

					{#if event.eventKind === 'tournament'}
						<span
							class="hidden rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700 dark:bg-purple-950 dark:text-purple-300 sm:inline-flex"
						>
							Tournament
						</span>
					{/if}

					{#if event.paymentMode === 'official'}
						<span
							class="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 sm:inline-flex"
						>
							Protected payment
						</span>
					{/if}
				</div>

				<h3 class="mt-0.5 line-clamp-1 text-sm font-black leading-tight text-slate-950 dark:text-slate-50 sm:mt-1 sm:line-clamp-2 sm:text-lg">
					{event.title}
				</h3>

				<p class="mt-0.5 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400 sm:mt-1 sm:text-sm">
					📍 {event.location.name}
				</p>

				<p class="hidden truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:mt-1 sm:block sm:text-sm">
					🕒 {formatDate(event.startAt)}
				</p>
			</div>

			<div class="shrink-0 rounded-2xl bg-slate-50 px-2 py-1 text-center dark:bg-slate-800 sm:px-3 sm:py-2">
				<p class="text-xs font-black text-blue-600 dark:text-blue-300 sm:text-sm">
					{event.participantIds.length}/{event.maxParticipants}
				</p>

				<p class="hidden text-xs font-medium text-slate-500 dark:text-slate-400 sm:block">players</p>
			</div>
		</div>

		<div class="mt-auto hidden flex-wrap items-center justify-between gap-2 pt-3 sm:flex">
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
{/if}
