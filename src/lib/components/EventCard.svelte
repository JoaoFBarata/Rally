<script lang="ts">
	import { onMount } from 'svelte';
	import { i18n } from '$lib/services/i18n.svelte';
	import { browser } from '$app/environment';
	import { auth } from '$lib/firebase';
	import type { EventStatus, SportEvent } from '$lib/schema';
	import {
		isPromotionActive,
		trackEventPromotionClick,
		trackEventPromotionView
	} from '$lib/services/event.service';
	import EventWeather from '$lib/components/EventWeather.svelte';
	import { getUserProfile } from '$lib/services/user.service';
	import {
		formatDate,
		formatShortDate,
		formatSport,
		formatPrice,
		formatCapacity,
		getMiniMapUrl,
		getSportBackgroundImage
	} from '$lib/utils/format.utils';

	let {
		event,
		showImage = true,
		variant = 'default',
		compactHero = false,
		miniHero = false,
		heroCtaLabel = 'Join game',
		heroCtaTone = 'primary'
	} = $props<{
		event: SportEvent;
		showImage?: boolean;
		variant?: 'default' | 'profile' | 'hero' | 'vertical';
		compactHero?: boolean;
		miniHero?: boolean;
		heroCtaLabel?: string;
		heroCtaTone?: 'primary' | 'muted';
	}>();

	let showPromotion = $derived(isPromotionActive(event) && event.promotionAudienceMatch !== false);

	const formattedCapacity = $derived(formatCapacity(event));
	const formattedPrice = $derived(formatPrice(event));
	const formattedSportLabel = $derived(formatSport(event.sport));
	const miniMapUrl = $derived(getMiniMapUrl(event.location?.lat, event.location?.lng, 176, 128));

	let creatorPhotoURL = $state<string | null>(null);
	let creatorName = $state('');

	$effect(() => {
		if (variant === 'vertical' && event.hostType === 'organization') {
			creatorPhotoURL = event.organizationLogoURL || null;
			creatorName = event.organizationName || 'Organization';
			return;
		}

		if (variant === 'vertical' && event.creatorId) {
			getUserProfile(event.creatorId).then(profile => {
				if (profile) {
					creatorPhotoURL = profile.photoURL || null;
					creatorName = profile.displayName || '';
				}
			}).catch(err => {
				console.error('Error fetching creator profile:', err);
			});
		}
	});

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

		if (status === 'cancelled') return i18n.t('status_cancelled');
		if (status === 'finished') return i18n.t('status_finished');
		if (status === 'full') return i18n.t('status_full');
		if (status === 'open') return i18n.t('status_open');

		return status;
	}

	function getProfileStatusLabel() {
		const status = getEffectiveStatus();
		if (status === 'cancelled') return i18n.t('status_cancelled');
		if (status === 'finished') return i18n.t('status_finished');
		if (event.eventKind === 'tournament') return i18n.t('status_tournament');
		return status === 'open' || status === 'full' ? i18n.t('status_upcoming') : i18n.t('status_past');
	}

	function getLevelLabel(level: string | undefined | null) {
		return i18n.t(level || 'casual');
	}



	function formatHeroLocation() {
		const address = event.location?.address?.trim();
		return address || i18n.t('location_not_set');
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
		return getSportBackgroundImage(event.sport);
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
			return 'border-red-100 bg-white/80 shadow-slate-200/60 hover:border-red-200 dark:border-red-950/50 dark:bg-slate-900/80 dark:shadow-none opacity-75';
		}
		if (showPromotion) {
			return 'border-blue-200 bg-white shadow-blue-100/80 hover:border-blue-400 dark:border-blue-900/70 dark:bg-slate-900 dark:shadow-none dark:hover:border-blue-500';
		}

		return 'border-slate-200 bg-white shadow-slate-200/70 hover:border-blue-200 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none dark:hover:border-blue-700';
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
			miniHero
				? 'min-h-[7.8rem] sm:min-h-[11.5rem]'
				: compactHero
					? 'min-h-[10rem] sm:min-h-[12.25rem]'
					: 'min-h-[11.5rem] sm:min-h-[16.5rem]'
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

		<div class={`relative flex h-full min-h-[inherit] flex-col justify-between ${miniHero ? 'p-3 sm:p-4' : `p-4 ${compactHero ? 'sm:p-4' : 'sm:p-5'}`}`}>
			<div class="mb-2 flex items-start justify-between gap-3 sm:mb-0">
				<span class={`rounded-full bg-emerald-500/90 font-black text-white shadow-lg shadow-emerald-950/20 ${miniHero ? 'px-2.5 py-0.5 text-[10px] sm:px-3 sm:py-1 sm:text-xs' : 'px-3 py-1 text-xs'}`}>
					{formatDate(event.startAt)}
				</span>
				<span class={`rounded-full bg-white/90 font-black text-slate-950 ${miniHero ? 'px-2.5 py-0.5 text-[10px] sm:px-3 sm:py-1 sm:text-xs' : 'px-3 py-1 text-xs'}`}>
					{formatHeroCapacity()}
				</span>
			</div>

			<div>
				<div class={`${miniHero ? 'mb-1.5 sm:mb-3' : compactHero ? 'mb-2' : 'mb-3'} flex flex-wrap gap-2`}>
					<span class={`rounded-full bg-white/15 font-black backdrop-blur ${miniHero ? 'px-2 py-0.5 text-[10px] sm:px-3 sm:py-1 sm:text-xs' : 'px-3 py-1 text-xs'}`}>
						{formattedSportLabel}
					</span>
					<span class={`rounded-full bg-white/15 font-black capitalize backdrop-blur ${miniHero ? 'hidden px-2 py-0.5 text-[10px] sm:inline-flex sm:px-3 sm:py-1 sm:text-xs' : 'px-3 py-1 text-xs'}`}>
						{getLevelLabel(event.level)}
					</span>
				</div>

				<h3 class={`${miniHero ? 'line-clamp-1 text-base sm:text-xl' : compactHero ? 'text-lg sm:text-xl' : 'text-xl sm:text-3xl'} max-w-[18rem] font-black leading-tight text-white`}>
					{event.title}
				</h3>
				<p class={`${miniHero ? 'mt-1 text-xs sm:mt-2 sm:text-sm' : 'mt-2 text-sm'} truncate font-bold text-white/80`}>
					{formatHeroLocation()}
				</p>

				<div class={`${miniHero ? 'mt-2 sm:mt-4' : 'mt-3 sm:mt-4'} flex items-center justify-between gap-3`}>
					<span class={`${miniHero ? 'text-xs sm:text-sm' : 'text-sm'} truncate font-bold text-white/75`}>
						{formattedPrice}
					</span>
					{#if heroCtaLabel}
						<span
							class={`shrink-0 rounded-2xl font-black shadow-lg transition ${miniHero ? 'px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm' : 'px-4 py-2 text-sm'} ${
								heroCtaTone === 'muted'
									? 'bg-white/90 text-slate-950 shadow-slate-950/15'
									: 'bg-blue-600 text-white shadow-blue-950/25 group-hover:bg-blue-500'
							}`}
						>
							{heroCtaLabel}
						</span>
					{/if}
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
				{#if miniMapUrl}
					<img src={miniMapUrl} alt={event.location.name} class="h-full w-full object-cover" />
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
				{formattedSportLabel} - {event.location.name}
			</p>
			<p class="mt-2 truncate text-xs font-black text-slate-400 dark:text-slate-500">
				{formatDate(event.startAt)} - {formattedCapacity} - {formattedPrice}
			</p>
		</div>
	</a>
{:else}
	{#if variant === 'vertical'}
		<a
			href={`/events/${event.id}`}
			onclick={handleClick}
			class="group flex h-full flex-col overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 sm:rounded-3xl"
		>
			{#if showImage}
				<div class="relative h-24 w-full shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800 sm:h-28">
					{#if event.groupPhotoURL}
						<img src={event.groupPhotoURL} alt={event.title} class="h-full w-full object-cover" />
					{:else}
						<img src={getDefaultSportImage()} alt={event.title} class="h-full w-full object-cover" />
					{/if}

					{#if showPromotion}
						<span class="absolute left-2 top-2 rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow-lg">
							Promoted
						</span>
					{/if}
					<span class="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-black text-slate-700 shadow-sm backdrop-blur dark:bg-slate-950/85 dark:text-slate-200">
						{formatShortDate(event.startAt)}
					</span>

				</div>
			{/if}

			<div class="flex flex-1 flex-col p-3 sm:p-4">
				<div class="flex items-start justify-between gap-2 sm:gap-3">
					<div class="min-w-0 flex-1">
						<div class="flex min-w-0 items-center gap-1.5">
							<span class="shrink-0 text-[9px] font-black uppercase tracking-wide text-blue-600 dark:text-blue-400 sm:text-[10px]">
								{event.sport}
							</span>
							<span class={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black sm:px-2 sm:text-[9px] ${getStatusClasses()}`}>
								{getStatusLabel()}
							</span>
						</div>

						<h3 class="mt-1 line-clamp-1 text-sm font-black leading-tight text-slate-950 dark:text-slate-50 sm:mt-1.5 sm:text-sm">
							{event.title}
						</h3>
					</div>

					<!-- Creator avatar bubble -->
					{#if creatorPhotoURL}
						<div class="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-slate-200 shadow-sm dark:border-slate-800 sm:h-9 sm:w-9">
							<img src={creatorPhotoURL} alt={creatorName} class="h-full w-full object-cover" title={`Created by ${creatorName}`} />
						</div>
					{:else if creatorName}
						<div class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-500 text-xs font-black text-white shadow-sm sm:h-9 sm:w-9">
							{creatorName.charAt(0).toUpperCase()}
						</div>
					{/if}
				</div>

				<p class="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
					📍 {event.location.name}
				</p>

				<p class="mt-1 truncate text-xs font-semibold text-slate-400 dark:text-slate-500">
					🕒 {formatDate(event.startAt)}
				</p>

				<div class="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-800/60 sm:pt-3">
					<span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:px-2.5 sm:text-[10px]">
						{getLevelLabel(event.level)}
					</span>
					<div class="min-w-0 text-right">
						<p class="truncate whitespace-nowrap text-[10px] font-black text-blue-600 dark:text-blue-300 sm:text-xs">
							{event.participantIds.length}/{event.maxParticipants} {i18n.t('players_lowercase')}
						</p>
						{#if event.pricePerPerson}
							<p class="truncate text-[9px] font-bold text-slate-500 dark:text-slate-400 sm:text-[10px]">
								{formattedPrice}
							</p>
						{:else}
							<p class="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 sm:text-[10px]">
								{i18n.t('free')}
							</p>
						{/if}
					</div>
				</div>
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
			{:else if miniMapUrl}
				<img src={miniMapUrl} alt={event.location.name} class="h-full w-full object-cover" />
			{:else}
				<div class="grid h-full w-full place-items-center text-3xl font-black text-blue-500/70">
					{event.title.charAt(0).toUpperCase()}
				</div>
			{/if}

			{#if showPromotion}
				<span
					class="absolute left-2 top-2 rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow-lg shadow-blue-700/20 sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[10px]"
				>
					{i18n.t('event_promoted')}
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
					{i18n.t('sponsored')}
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

					<EventWeather lat={event.location.lat} lng={event.location.lng} startAt={event.startAt} size="sm" />
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

				<p class="hidden text-xs font-medium text-slate-500 dark:text-slate-400 sm:block">{i18n.t('players_lowercase')}</p>
			</div>
		</div>

		<div class="mt-auto hidden flex-wrap items-center justify-between gap-2 pt-3 sm:flex">
			<span
				class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300"
			>
				{getLevelLabel(event.level)}
			</span>

			{#if event.pricePerPerson}
				<span class="text-sm font-medium text-slate-600 dark:text-slate-300">
					{formattedPrice}
				</span>
			{/if}
		</div>
	</div>
</a>
{/if}
{/if}
