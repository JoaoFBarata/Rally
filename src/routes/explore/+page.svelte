<!--src/routes/explore/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import {
		getVisibleEventsForUser,
		subscribeToPromotedEventsForUser
	} from '$lib/services/explore.service';
	import { getFriendsForUser } from '$lib/services/social.service';
	import { getOrganizationsFollowedByUser } from '$lib/services/organization.service';
	import { ensureUserProfile } from '$lib/services/user.service';
	import type { Sport, SportEvent, SportLevel, UserProfile } from '$lib/schema';
	import ExploreMap from '$lib/components/maps/ExploreMap.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import { getEventStartAtMillis, isPromotionActive } from '$lib/services/event.service';
	import { subscribeToEventCatalogChanges } from '$lib/services/realtime.service';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { i18n } from '$lib/services/i18n.svelte';
	import { getEventTemporalState } from '$lib/utils/event-lifecycle.utils';
	import { LayoutList, Map as MapIcon } from '@lucide/svelte';

	type DateFilter = 'today' | '7' | '14' | '30' | 'all';
	type PriceFilter = 'all' | 'free' | 'paid';
	type AudienceFilter = 'all' | 'mine' | 'friends' | 'public' | 'joined' | 'following_orgs';
	type TemporalFilter = 'all' | 'live' | 'starting_soon';

	const defaultDateFilter: DateFilter = '7';
	const defaultPriceFilter: PriceFilter = 'all';
	const defaultAudienceFilter: AudienceFilter = 'all';
	const defaultTemporalFilter: TemporalFilter = 'all';
	const availableLevels: SportLevel[] = ['beginner', 'casual', 'intermediate', 'advanced'];
	const validDateFilters: DateFilter[] = ['today', '7', '14', '30', 'all'];
	const validPriceFilters: PriceFilter[] = ['all', 'free', 'paid'];
	const validAudienceFilters: AudienceFilter[] = [
		'all',
		'mine',
		'friends',
		'public',
		'joined',
		'following_orgs'
	];
	const validTemporalFilters: TemporalFilter[] = ['all', 'live', 'starting_soon'];

	function getValidParam<T extends string>(key: string, validValues: T[], fallback: T) {
		const value = page.url.searchParams.get(key) as T | null;
		return value && validValues.includes(value) ? value : fallback;
	}

	function getListParam<T extends string>(key: string) {
		return (page.url.searchParams.get(key)?.split(',').filter(Boolean) ?? []) as T[];
	}

	function getNumberParam(key: string, fallback: number) {
		const value = Number(page.url.searchParams.get(key));
		return Number.isFinite(value) && value > 0 ? value : fallback;
	}

	let events = $state<SportEvent[]>([]);
	let promotedCampaignEvents = $state<SportEvent[]>([]);
	let profile = $state<UserProfile | null>(null);
	let loading = $state(true);
	let error = $state('');
	let currentUserId = $state('');
	let friendIds = $state<string[]>([]);
	let followedOrganizationIds = $state<string[]>([]);
	let filteredEventCount = $state(0);
	let selectedMapEventId = $state<string | null>(null);
	let viewMode = $state<'map' | 'feed'>(
		(page.url.searchParams.get('view') as 'map' | 'feed') || 'map'
	);
	let selectedSports = $state<Sport[]>(getListParam<Sport>('sports'));
	let selectedLevels = $state<SportLevel[]>(
		getListParam<SportLevel>('levels').filter((level) => availableLevels.includes(level))
	);
	let dateFilter = $state<DateFilter>(getValidParam('date', validDateFilters, defaultDateFilter));
	let dateFilterManuallyChanged = $state(page.url.searchParams.has('date'));
	let priceFilter = $state<PriceFilter>(
		getValidParam('price', validPriceFilters, defaultPriceFilter)
	);
	let maxPrice = $state(getNumberParam('maxPrice', 50));
	let audienceFilter = $state<AudienceFilter>(
		getValidParam('audience', validAudienceFilters, defaultAudienceFilter)
	);
	let onlyTournaments = $state(page.url.searchParams.get('tournaments') === 'true');
	let searchTerm = $state(page.url.searchParams.get('search')?.trim() ?? '');
	let temporalFilter = $state<TemporalFilter>(
		getValidParam('status', validTemporalFilters, defaultTemporalFilter)
	);
	let nowMs = $state(Date.now());
	let promotedPage = $state(0);
	let promotedRotationSeed = $state(0);
	let showSponsored = $state(true);
	const promotedPageSize = 4;

	let dateFilterOptions = $derived([
		{ value: 'today' as const, label: i18n.t('today') },
		{ value: '7' as const, label: i18n.t('next_7_days') },
		{ value: '14' as const, label: i18n.t('next_14_days') },
		{ value: '30' as const, label: i18n.t('next_30_days') },
		{ value: 'all' as const, label: i18n.t('all') }
	]);
	let priceFilterOptions = $derived([
		{ value: 'all' as const, label: i18n.t('all') },
		{ value: 'free' as const, label: i18n.t('free') },
		{ value: 'paid' as const, label: i18n.t('paid') }
	]);
	let audienceFilterOptions = $derived([
		{ value: 'all' as const, label: i18n.t('all') },
		{ value: 'mine' as const, label: i18n.t('my_events') },
		{ value: 'friends' as const, label: i18n.t('friends') },
		{ value: 'public' as const, label: i18n.t('public_events') },
		{ value: 'joined' as const, label: i18n.t('joined') },
		{ value: 'following_orgs' as const, label: i18n.t('following_orgs') }
	]);
	let temporalFilterOptions = $derived([
		{ value: 'all' as const, label: i18n.t('all') },
		{ value: 'live' as const, label: i18n.t('happening_now') },
		{ value: 'starting_soon' as const, label: i18n.t('starting_soon') }
	]);

	let allExploreEvents = $derived.by(() => {
		const eventsById = new Map<string, SportEvent>();
		for (const event of events) eventsById.set(event.id, event);
		for (const event of promotedCampaignEvents) eventsById.set(event.id, event);
		return Array.from(eventsById.values());
	});

	let availableSports = $derived.by((): Sport[] => {
		const sports = allExploreEvents.map((event) => event.sport);
		return [...new Set<Sport>(sports)].sort();
	});

	let highestPrice = $derived.by(() => {
		const prices = allExploreEvents
			.map((event) => event.pricePerPerson ?? 0)
			.filter((price) => price > 0);
		return Math.max(10, Math.ceil(Math.max(...prices, 0)));
	});

	let activeFilterCount = $derived.by(() => {
		return (
			selectedSports.length +
			selectedLevels.length +
			(dateFilter === defaultDateFilter ? 0 : 1) +
			(priceFilter === defaultPriceFilter ? 0 : 1) +
			(audienceFilter === defaultAudienceFilter ? 0 : 1) +
			(temporalFilter === defaultTemporalFilter ? 0 : 1) +
			(onlyTournaments ? 1 : 0) +
			(searchTerm.trim() ? 1 : 0)
		);
	});

	function getWindowDays(filter: DateFilter) {
		if (filter === 'all') return null;
		if (filter === 'today') return 1;
		return Number(filter);
	}

	function matchesDateFilter(event: SportEvent) {
		const startAtMs = getEventStartAtMillis(event);
		const now = new Date(nowMs);
		const eventDate = new Date(startAtMs);
		const temporalState = getEventTemporalState(event, nowMs);

		if (temporalState === 'cancelled' || temporalState === 'finished') return false;
		if (temporalState === 'live') return true;

		if (
			!dateFilterManuallyChanged &&
			dateFilter === defaultDateFilter &&
			event.visibility === 'public' &&
			isPromotionActive(event)
		) {
			return startAtMs >= nowMs;
		}
		if (dateFilter === 'all') return startAtMs >= nowMs;
		if (dateFilter === 'today') {
			return (
				eventDate.getFullYear() === now.getFullYear() &&
				eventDate.getMonth() === now.getMonth() &&
				eventDate.getDate() === now.getDate()
			);
		}

		const days = Number(dateFilter);
		return startAtMs >= nowMs && startAtMs <= nowMs + days * 24 * 60 * 60 * 1000;
	}

	function matchesTemporalFilter(event: SportEvent) {
		if (temporalFilter === 'all') return true;
		return getEventTemporalState(event, nowMs) === temporalFilter;
	}

	function matchesPriceFilter(event: SportEvent) {
		const price = event.pricePerPerson ?? 0;
		if (priceFilter === 'free') return price <= 0;
		if (priceFilter === 'paid') return price > 0 && price <= maxPrice;
		return true;
	}

	let eventsInSelectedDateRangeCount = $derived.by(
		() => allExploreEvents.filter((event) => matchesDateFilter(event)).length
	);

	function matchesAudienceFilter(event: SportEvent) {
		if (audienceFilter === 'mine') return event.creatorId === currentUserId;
		if (audienceFilter === 'friends') {
			return friendIds.includes(event.creatorId) || event.visibility === 'friends';
		}
		if (audienceFilter === 'public') return event.visibility === 'public';
		if (audienceFilter === 'joined') return event.participantIds.includes(currentUserId);
		if (audienceFilter === 'following_orgs') {
			return Boolean(
				event.organizationId && followedOrganizationIds.includes(event.organizationId)
			);
		}
		return true;
	}

	function getPromotedContextScore(event: SportEvent) {
		let score = 0;
		const targetSport = event.promotionTargetSport ?? event.sport;

		if (selectedSports.includes(targetSport)) score += 80;
		if (profile?.sports?.includes(targetSport)) score += 45;
		if (event.promotionPlan === 'sport') score += 24;
		if (event.promotionPlan === 'local') score += 16;
		if (event.promotionPlan === 'featured') score += 8;

		return score;
	}

	let filteredEvents = $derived.by(() => {
		const term = searchTerm.trim().toLocaleLowerCase('pt-PT');

		return allExploreEvents.filter((event) => {
			const matchesSearch =
				!term ||
				[
					event.title,
					event.description,
					event.sport,
					event.customSport,
					event.location?.name,
					event.location?.address,
					event.organizationName
				]
					.filter(Boolean)
					.join(' ')
					.toLocaleLowerCase('pt-PT')
					.includes(term);
			const matchesSport = selectedSports.length === 0 || selectedSports.includes(event.sport);
			const eventLevel = event.level ?? 'casual';
			const matchesLevel = selectedLevels.length === 0 || selectedLevels.includes(eventLevel);
			const matchesTournament = !onlyTournaments || event.eventKind === 'tournament';

			return (
				matchesSearch &&
				matchesSport &&
				matchesLevel &&
				matchesTournament &&
				matchesDateFilter(event) &&
				matchesPriceFilter(event) &&
				matchesTemporalFilter(event) &&
				matchesAudienceFilter(event)
			);
		});
	});
	let promotedEvents = $derived.by(() => {
		const eventsById = new Map<string, SportEvent>();

		for (const event of promotedCampaignEvents) {
			if (
				event.visibility === 'public' &&
				isPromotionActive(event) &&
				filteredEvents.some((filteredEvent) => filteredEvent.id === event.id)
			) {
				eventsById.set(event.id, event);
			}
		}

		for (const event of filteredEvents) {
			if (event.visibility === 'public' && isPromotionActive(event)) {
				eventsById.set(event.id, event);
			}
		}

		const rankedEvents = Array.from(eventsById.values()).sort((a, b) => {
			const scoreDiff = getPromotedContextScore(b) - getPromotedContextScore(a);
			if (scoreDiff !== 0) return scoreDiff;

			return getEventStartAtMillis(a) - getEventStartAtMillis(b);
		});

		if (rankedEvents.length <= 1) return rankedEvents;

		const rotationOffset = promotedRotationSeed % rankedEvents.length;
		return [...rankedEvents.slice(rotationOffset), ...rankedEvents.slice(0, rotationOffset)];
	});
	let promotedPageCount = $derived(
		Math.max(1, Math.ceil(promotedEvents.length / promotedPageSize))
	);
	let visiblePromotedEvents = $derived(
		promotedEvents.slice(
			promotedPage * promotedPageSize,
			promotedPage * promotedPageSize + promotedPageSize
		)
	);
	let refreshing = false;

	function getVisiblePageDots(pageCount: number, activePage: number) {
		if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index);

		const indexes = new Set<number>([0, pageCount - 1, activePage - 1, activePage, activePage + 1]);
		return [...indexes].filter((index) => index >= 0 && index < pageCount).sort((a, b) => a - b);
	}

	function setPromotedPage(page: number) {
		if (!promotedPageCount) return;
		promotedPage = (page + promotedPageCount) % promotedPageCount;
	}

	async function loadExploreData(userId: string) {
		if (refreshing) return;
		refreshing = true;
		try {
			events = await getVisibleEventsForUser(userId, { windowDays: getWindowDays(dateFilter) });
			filteredEventCount = filteredEvents.length;
			const [friends, followedOrganizations] = await Promise.all([
				getFriendsForUser(userId),
				getOrganizationsFollowedByUser(userId)
			]);
			friendIds = friends.map((friend) => friend.id).filter(Boolean);
			followedOrganizationIds = followedOrganizations.map((organization) => organization.id);
		} finally {
			refreshing = false;
		}
	}

	function clearSelectedEvent() {
		selectedMapEventId = null;
	}

	function syncExploreQuery() {
		const params = new URLSearchParams(page.url.searchParams);
		const trimmedSearch = searchTerm.trim();

		if (trimmedSearch) params.set('search', trimmedSearch);
		else params.delete('search');

		if (dateFilter !== defaultDateFilter) params.set('date', dateFilter);
		else params.delete('date');

		if (selectedSports.length) params.set('sports', selectedSports.join(','));
		else params.delete('sports');

		if (selectedLevels.length) params.set('levels', selectedLevels.join(','));
		else params.delete('levels');

		if (priceFilter !== defaultPriceFilter) params.set('price', priceFilter);
		else params.delete('price');

		if (priceFilter === 'paid') params.set('maxPrice', String(maxPrice));
		else params.delete('maxPrice');

		if (audienceFilter !== defaultAudienceFilter) params.set('audience', audienceFilter);
		else params.delete('audience');

		if (temporalFilter !== defaultTemporalFilter) params.set('status', temporalFilter);
		else params.delete('status');

		if (onlyTournaments) params.set('tournaments', 'true');
		else params.delete('tournaments');

		if (viewMode !== 'map') params.set('view', viewMode);
		else params.delete('view');

		const query = params.toString();
		void goto(`${page.url.pathname}${query ? `?${query}` : ''}`, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}

	function toggleSportFilter(sport: Sport) {
		selectedSports = selectedSports.includes(sport)
			? selectedSports.filter((item) => item !== sport)
			: [...selectedSports, sport];
		clearSelectedEvent();
		syncExploreQuery();
	}

	function toggleLevelFilter(level: SportLevel) {
		selectedLevels = selectedLevels.includes(level)
			? selectedLevels.filter((item) => item !== level)
			: [...selectedLevels, level];
		clearSelectedEvent();
		syncExploreQuery();
	}

	function setDateFilter(value: DateFilter) {
		dateFilter = value;
		dateFilterManuallyChanged = true;
		clearSelectedEvent();
		syncExploreQuery();
		if (currentUserId) void loadExploreData(currentUserId);
	}

	function setPriceFilter(value: PriceFilter) {
		priceFilter = value;
		if (value === 'paid' && maxPrice > highestPrice) maxPrice = highestPrice;
		clearSelectedEvent();
		syncExploreQuery();
	}

	function setMaxPrice(value: number) {
		maxPrice = value;
		clearSelectedEvent();
		syncExploreQuery();
	}

	function setAudienceFilter(value: AudienceFilter) {
		audienceFilter = value;
		clearSelectedEvent();
		syncExploreQuery();
	}

	function setTemporalFilter(value: TemporalFilter) {
		temporalFilter = value;
		clearSelectedEvent();
		syncExploreQuery();
	}

	function setOnlyTournaments(value: boolean) {
		onlyTournaments = value;
		clearSelectedEvent();
		syncExploreQuery();
	}

	function setSearchTerm(value: string) {
		searchTerm = value;
		clearSelectedEvent();
		syncExploreQuery();
	}

	function clearAllFilters() {
		selectedSports = [];
		selectedLevels = [];
		dateFilter = defaultDateFilter;
		dateFilterManuallyChanged = false;
		priceFilter = defaultPriceFilter;
		audienceFilter = defaultAudienceFilter;
		temporalFilter = defaultTemporalFilter;
		onlyTournaments = false;
		maxPrice = highestPrice;
		searchTerm = '';
		clearSelectedEvent();
		syncExploreQuery();
		if (currentUserId) void loadExploreData(currentUserId);
	}

	onMount(() => {
		let unsubscribeEvents = () => {};
		let unsubscribePromotions = () => {};
		const promotionRotationTimer = window.setInterval(() => {
			promotedRotationSeed += 1;
			setPromotedPage(promotedPage + 1);
		}, 9000);
		const lifecycleTimer = window.setInterval(() => (nowMs = Date.now()), 10_000);
		void (async () => {
			const currentUser = auth.currentUser;
			if (!currentUser) {
				await goto(resolve('/login'));
				return;
			}
			currentUserId = currentUser.uid;
			try {
				profile = await ensureUserProfile(currentUser);
				await loadExploreData(currentUser.uid);
				unsubscribePromotions = subscribeToPromotedEventsForUser(
					currentUser.uid,
					profile,
					(loadedEvents) => (promotedCampaignEvents = loadedEvents),
					(err) => console.error('Explore promoted events listener error:', err),
					10
				);
				unsubscribeEvents = subscribeToEventCatalogChanges(() => {
					void loadExploreData(currentUser.uid);
				});
			} catch (err) {
				console.error('Explore events error:', err);
				error = getFriendlyErrorMessage(err, 'Could not load events.');
			} finally {
				loading = false;
			}
		})();
		return () => {
			window.clearInterval(promotionRotationTimer);
			window.clearInterval(lifecycleTimer);
			unsubscribeEvents();
			unsubscribePromotions();
		};
	});

	$effect(() => {
		const count = promotedPageCount;
		if (promotedPage >= count) promotedPage = 0;
	});
</script>

<main
	class="mx-auto flex min-h-[calc(100dvh-96px)] w-full max-w-[1500px] flex-col overflow-visible px-2.5 pb-28 pt-3 sm:px-5 sm:py-8 md:h-auto md:pb-8"
>
	<header
		class="mb-2 sm:mb-6 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
	>
		<div>
			<h1 class="text-2xl font-black tracking-tight sm:mt-3 sm:text-3xl">{i18n.t('explore')}</h1>
			<p class="mt-1 hidden text-sm text-slate-500 sm:block">
				{searchTerm ? i18n.t('showing_results', { searchTerm }) : i18n.t('explore_subtitle')}
			</p>
		</div>
		<div class="relative grid h-11 w-[17rem] max-w-full grid-cols-2 self-start rounded-xl border border-slate-200 bg-slate-100 p-1 shadow-inner shadow-slate-200/70 sm:h-13 sm:w-[19rem] sm:self-center sm:rounded-2xl dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/20">
			<span
				aria-hidden="true"
				class={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-[0_4px_14px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/80 transition-transform duration-300 ease-out sm:rounded-xl dark:bg-slate-700 dark:ring-slate-600 ${viewMode === 'feed' ? 'translate-x-full' : 'translate-x-0'}`}
			></span>
			<button
				type="button"
				aria-pressed={viewMode === 'map'}
				onclick={() => {
					viewMode = 'map';
					syncExploreQuery();
				}}
				class="relative z-10 flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-black transition-colors duration-300 sm:gap-2 sm:rounded-xl sm:px-4 sm:text-sm {viewMode === 'map'
					? 'text-slate-950 dark:text-white'
					: 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}"
			>
				<MapIcon class="h-4.5 w-4.5 shrink-0 text-blue-600 sm:h-5 sm:w-5 dark:text-blue-400" strokeWidth={2.4} />
				<span class="truncate">{i18n.t('map_view')}</span>
			</button>
			<button
				type="button"
				aria-pressed={viewMode === 'feed'}
				onclick={() => {
					viewMode = 'feed';
					syncExploreQuery();
				}}
				class="relative z-10 flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-black transition-colors duration-300 sm:gap-2 sm:rounded-xl sm:px-4 sm:text-sm {viewMode ===
				'feed'
					? 'text-slate-950 dark:text-white'
					: 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}"
			>
				<LayoutList class="h-4.5 w-4.5 shrink-0 text-blue-600 sm:h-5 sm:w-5 dark:text-blue-400" strokeWidth={2.4} />
				<span class="truncate">{i18n.t('feed_view')}</span>
			</button>
		</div>
	</header>

	{#if loading}
		<section
			class="rounded-4xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800"
		>
			<p class="text-slate-500">{i18n.t('loading_events')}</p>
		</section>
	{:else if error}
		<section class="rounded-4xl border border-red-200 bg-red-50 p-8 text-red-700">
			{error}
		</section>
	{:else}
		<div class="flex min-w-0 w-full max-w-full flex-col gap-3 md:min-h-0 md:flex-1">
			<!-- Positioning container for Map and Desktop Promoted Overlay -->
			<div class="relative flex min-w-0 w-full max-w-full flex-col md:min-h-0 md:flex-1">
				<ExploreMap
					events={filteredEvents}
					totalEventsCount={eventsInSelectedDateRangeCount}
					{currentUserId}
					{friendIds}
					{availableSports}
					{availableLevels}
					{selectedSports}
					{selectedLevels}
					{dateFilter}
					{priceFilter}
					{maxPrice}
					{highestPrice}
					{audienceFilter}
					{temporalFilter}
					{searchTerm}
					{onlyTournaments}
					{activeFilterCount}
					{dateFilterOptions}
					{priceFilterOptions}
					{audienceFilterOptions}
					{temporalFilterOptions}
					{profile}
					{viewMode}
					onToggleSport={toggleSportFilter}
					onToggleLevel={toggleLevelFilter}
					onDateFilterChange={setDateFilter}
					onPriceFilterChange={setPriceFilter}
					onMaxPriceChange={setMaxPrice}
					onAudienceFilterChange={setAudienceFilter}
					onTemporalFilterChange={setTemporalFilter}
					onOnlyTournamentsChange={setOnlyTournaments}
					onSearchChange={setSearchTerm}
					onClearFilters={clearAllFilters}
					onFilteredCountChange={(count) => (filteredEventCount = count)}
					onSelectedEventChange={(eventId) => (selectedMapEventId = eventId)}
				/>
				{#if viewMode === 'map' && !selectedMapEventId && showSponsored}
					<div
						class="pointer-events-none absolute inset-x-3 bottom-3 z-20 hidden md:block md:inset-x-auto md:left-5 md:top-5 md:bottom-auto md:w-80"
					>
						<div class="pointer-events-auto space-y-3">
							<section
								class="relative rounded-[1.5rem] border border-blue-200 bg-white/95 p-4 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-blue-900 dark:bg-slate-950/95 dark:shadow-none"
							>
								<p
									class="text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400"
								>
									{i18n.t('sponsored')}
								</p>

								<h2 class="mt-1 text-lg font-black text-slate-950 dark:text-slate-50">
									{i18n.t('featured_near_you')}
								</h2>

								<p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
									{i18n.t('promoted_boost_msg')}
								</p>
							</section>

							{#if promotedEvents.length}
								<div class="max-h-[52dvh] space-y-3 overflow-y-auto pr-1 md:max-h-[520px]">
									{#each visiblePromotedEvents as event (event.id)}
										<EventCard {event} variant="profile" />
									{/each}
								</div>
								{#if promotedPageCount > 1}
									<div
										class="flex items-center justify-center gap-1.5 rounded-full bg-white/90 px-3 py-2 shadow-sm backdrop-blur dark:bg-slate-950/90"
									>
										{#each getVisiblePageDots(promotedPageCount, promotedPage) as pageIndex (pageIndex)}
											<button
												type="button"
												onclick={() => setPromotedPage(pageIndex)}
												class={`h-2 rounded-full transition-all ${pageIndex === promotedPage ? 'w-6 bg-blue-600' : 'w-2 bg-blue-200 dark:bg-blue-900'}`}
												aria-label={i18n.t('show_promoted_page', { page: pageIndex + 1 })}
											></button>
										{/each}
									</div>
								{/if}
							{:else}
								<div
									class="rounded-[1.5rem] border border-dashed border-slate-350 bg-white/95 p-4 text-sm font-bold text-slate-500 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-950/95 dark:text-slate-400"
								>
									{i18n.t('no_promoted_events')}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<!-- Mobile Promoted Section -->
			{#if viewMode === 'map' && showSponsored}
				<section class="mt-1 md:hidden shrink-0">
					<div class="mb-2 flex items-center justify-between gap-3">
						<div>
							<p
								class="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400"
							>
								{i18n.t('promoted')}
							</p>
							<p class="mt-0.5 text-xs font-bold text-slate-500 dark:text-slate-400">
								{i18n.t('promoted_boost_msg')}
							</p>
						</div>

					</div>

					{#if promotedEvents.length}
						<div class="max-h-[24rem] space-y-2.5 overflow-y-auto pr-1">
							{#each visiblePromotedEvents as event (event.id)}
								<div>
									<a
										href={`/events/${event.id}`}
										class="block rounded-[1.35rem] border border-blue-200/80 bg-white p-3.5 shadow-md shadow-slate-200/70 transition-all active:scale-[0.98] dark:border-blue-900/60 dark:bg-slate-900/80 dark:shadow-none"
									>
										<div class="flex items-center justify-between gap-3">
											<div class="min-w-0 flex-1">
												<div class="flex items-center gap-2">
													<span
														class="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400"
													>
														{event.sport}
													</span>
													<span
														class="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black uppercase text-blue-700 dark:bg-blue-950/80 dark:text-blue-300"
													>
														{i18n.t('promoted')}
													</span>
												</div>

												<h3
													class="mt-1.5 truncate text-sm font-black text-slate-900 dark:text-slate-100"
												>
													{event.title}
												</h3>

												<div
													class="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400"
												>
													<span class="truncate">📍 {event.location.name}</span>
												</div>
											</div>

											<div
												class="shrink-0 rounded-2xl bg-blue-50 px-3 py-2 text-center dark:bg-blue-950/80"
											>
												<p class="text-sm font-black text-blue-600 dark:text-blue-300">
													{event.participantIds.length}/{event.maxParticipants}
												</p>
												<p class="text-[9px] font-bold text-slate-500 dark:text-slate-400">
													{i18n.t('players')}
												</p>
											</div>
										</div>
									</a>
								</div>
							{/each}
						</div>
						{#if promotedPageCount > 1}
							<div class="mt-3 flex items-center justify-center gap-1.5">
								{#each getVisiblePageDots(promotedPageCount, promotedPage) as pageIndex (pageIndex)}
									<button
										type="button"
										onclick={() => setPromotedPage(pageIndex)}
										class={`h-2 rounded-full transition-all ${pageIndex === promotedPage ? 'w-6 bg-blue-600' : 'w-2 bg-blue-200 dark:bg-blue-100'}`}
										aria-label={i18n.t('show_promoted_page', { page: pageIndex + 1 })}
									></button>
								{/each}
							</div>
						{/if}
					{:else}
						<div
							class="rounded-xl border border-dashed border-slate-350 bg-white p-2.5 text-xs font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
						>
							{i18n.t('no_promoted_events')}
						</div>
					{/if}
				</section>
			{/if}
		</div>
	{/if}
</main>
