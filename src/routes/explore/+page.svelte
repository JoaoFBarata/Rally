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
	import { ensureUserProfile } from '$lib/services/user.service';
	import type { Sport, SportEvent, SportLevel, UserProfile } from '$lib/schema';
	import ExploreMap from '$lib/components/maps/ExploreMap.svelte';
	import RallyWordmark from '$lib/components/RallyWordmark.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import { getEventStartAtMillis, isPromotionActive } from '$lib/services/event.service';
	import { subscribeToEventCatalogChanges } from '$lib/services/realtime.service';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';

	type DateFilter = 'today' | '7' | '14' | '30' | 'all';
	type PriceFilter = 'all' | 'free' | 'paid';
	type AudienceFilter = 'all' | 'mine' | 'friends' | 'public' | 'joined';

	let events = $state<SportEvent[]>([]);
	let promotedCampaignEvents = $state<SportEvent[]>([]);
	let profile = $state<UserProfile | null>(null);
	let loading = $state(true);
	let error = $state('');
	let currentUserId = $state('');
	let friendIds = $state<string[]>([]);
	let filteredEventCount = $state(0);
	let selectedMapEventId = $state<string | null>(null);
	let selectedSports = $state<Sport[]>([]);
	let selectedLevels = $state<SportLevel[]>([]);
	let dateFilter = $state<DateFilter>('7');
	let priceFilter = $state<PriceFilter>('all');
	let maxPrice = $state(50);
	let audienceFilter = $state<AudienceFilter>('all');
	let searchTerm = $derived(page.url.searchParams.get('search')?.trim() ?? '');

	const defaultDateFilter: DateFilter = '7';
	const defaultPriceFilter: PriceFilter = 'all';
	const defaultAudienceFilter: AudienceFilter = 'all';
	const availableLevels: SportLevel[] = ['beginner', 'casual', 'intermediate', 'advanced'];
	const dateFilterOptions = [
		{ value: 'today' as const, label: 'Today' },
		{ value: '7' as const, label: '7 days' },
		{ value: '14' as const, label: '14 days' },
		{ value: '30' as const, label: '30 days' },
		{ value: 'all' as const, label: 'All' }
	];
	const priceFilterOptions = [
		{ value: 'all' as const, label: 'All' },
		{ value: 'free' as const, label: 'Free' },
		{ value: 'paid' as const, label: 'Paid' }
	];
	const audienceFilterOptions = [
		{ value: 'all' as const, label: 'All' },
		{ value: 'mine' as const, label: 'My events' },
		{ value: 'friends' as const, label: 'Friends' },
		{ value: 'public' as const, label: 'Public' },
		{ value: 'joined' as const, label: 'Joined' }
	];

	let availableSports = $derived.by((): Sport[] => {
		const sports = events.map((event) => event.sport);
		return [...new Set<Sport>(sports)].sort();
	});

	let highestPrice = $derived.by(() => {
		const prices = events
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
			(audienceFilter === defaultAudienceFilter ? 0 : 1)
		);
	});

	function getWindowDays(filter: DateFilter) {
		if (filter === 'all') return null;
		if (filter === 'today') return 1;
		return Number(filter);
	}

	function matchesDateFilter(event: SportEvent) {
		const startAtMs = getEventStartAtMillis(event);
		const now = new Date();
		const eventDate = new Date(startAtMs);

		if (dateFilter === 'all') return startAtMs >= Date.now();
		if (dateFilter === 'today') {
			return (
				eventDate.getFullYear() === now.getFullYear() &&
				eventDate.getMonth() === now.getMonth() &&
				eventDate.getDate() === now.getDate()
			);
		}

		const days = Number(dateFilter);
		return startAtMs >= Date.now() && startAtMs <= Date.now() + days * 24 * 60 * 60 * 1000;
	}

	function matchesPriceFilter(event: SportEvent) {
		const price = event.pricePerPerson ?? 0;
		if (priceFilter === 'free') return price <= 0;
		if (priceFilter === 'paid') return price > 0 && price <= maxPrice;
		return true;
	}

	function matchesAudienceFilter(event: SportEvent) {
		if (audienceFilter === 'mine') return event.creatorId === currentUserId;
		if (audienceFilter === 'friends') {
			return friendIds.includes(event.creatorId) || event.visibility === 'friends';
		}
		if (audienceFilter === 'public') return event.visibility === 'public';
		if (audienceFilter === 'joined') return event.participantIds.includes(currentUserId);
		return true;
	}

	let filteredEvents = $derived.by(() => {
		const term = searchTerm.toLocaleLowerCase('pt-PT');

		return events.filter((event) => {
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

			return (
				matchesSearch &&
				matchesSport &&
				matchesLevel &&
				matchesDateFilter(event) &&
				matchesPriceFilter(event) &&
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

		return Array.from(eventsById.values());
	});
	let refreshing = false;

	async function loadExploreData(userId: string) {
		if (refreshing) return;
		refreshing = true;
		try {
			events = await getVisibleEventsForUser(userId, { windowDays: getWindowDays(dateFilter) });
			filteredEventCount = filteredEvents.length;
			const friends = await getFriendsForUser(userId);
			friendIds = friends.map((friend) => friend.id).filter(Boolean);
		} finally {
			refreshing = false;
		}
	}

	function clearSelectedEvent() {
		selectedMapEventId = null;
	}

	function toggleSportFilter(sport: Sport) {
		selectedSports = selectedSports.includes(sport)
			? selectedSports.filter((item) => item !== sport)
			: [...selectedSports, sport];
		clearSelectedEvent();
	}

	function toggleLevelFilter(level: SportLevel) {
		selectedLevels = selectedLevels.includes(level)
			? selectedLevels.filter((item) => item !== level)
			: [...selectedLevels, level];
		clearSelectedEvent();
	}

	function setDateFilter(value: DateFilter) {
		dateFilter = value;
		clearSelectedEvent();
		if (currentUserId) void loadExploreData(currentUserId);
	}

	function setPriceFilter(value: PriceFilter) {
		priceFilter = value;
		if (value === 'paid' && maxPrice > highestPrice) maxPrice = highestPrice;
		clearSelectedEvent();
	}

	function setMaxPrice(value: number) {
		maxPrice = value;
		clearSelectedEvent();
	}

	function setAudienceFilter(value: AudienceFilter) {
		audienceFilter = value;
		clearSelectedEvent();
	}

	function clearAllFilters() {
		selectedSports = [];
		selectedLevels = [];
		dateFilter = defaultDateFilter;
		priceFilter = defaultPriceFilter;
		audienceFilter = defaultAudienceFilter;
		maxPrice = highestPrice;
		clearSelectedEvent();
		if (currentUserId) void loadExploreData(currentUserId);
	}

	onMount(() => {
		let unsubscribeEvents = () => {};
		let unsubscribePromotions = () => {};
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
			unsubscribeEvents();
			unsubscribePromotions();
		};
	});
</script>

<main class="mx-auto w-full max-w-[1500px] px-2.5 py-3 sm:px-5 sm:py-8 h-[calc(100dvh-96px)] flex flex-col overflow-hidden md:h-auto md:overflow-visible">
	<header class="mb-2 sm:mb-6 shrink-0">
		<RallyWordmark size="sm" />
		<h1 class="mt-1 text-2xl font-bold sm:mt-2 sm:text-3xl">Explore</h1>
		<p class="mt-1 hidden text-sm text-slate-500 sm:block">
			{searchTerm ? `Showing results for "${searchTerm}".` : 'Find games, teams and sports partners nearby.'}
		</p>
	</header>

	{#if loading}
		<section
			class="rounded-4xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800"
		>
			<p class="text-slate-500">Loading events...</p>
		</section>
	{:else if error}
		<section class="rounded-4xl border border-red-200 bg-red-50 p-8 text-red-700">
			{error}
		</section>
	{:else}
		<div class="flex flex-col gap-3 flex-1 min-h-0">
			<!-- Positioning container for Map and Desktop Promoted Overlay -->
			<div class="relative flex-1 min-h-0 flex flex-col">
				<ExploreMap
					events={filteredEvents}
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
					{activeFilterCount}
					{dateFilterOptions}
					{priceFilterOptions}
					{audienceFilterOptions}
					onToggleSport={toggleSportFilter}
					onToggleLevel={toggleLevelFilter}
					onDateFilterChange={setDateFilter}
					onPriceFilterChange={setPriceFilter}
					onMaxPriceChange={setMaxPrice}
					onAudienceFilterChange={setAudienceFilter}
					onClearFilters={clearAllFilters}
					onFilteredCountChange={(count) => (filteredEventCount = count)}
					onSelectedEventChange={(eventId) => (selectedMapEventId = eventId)}
				/>
				{#if !selectedMapEventId}
					<div
						class="pointer-events-none absolute inset-x-3 bottom-3 z-20 hidden md:block md:inset-x-auto md:left-5 md:top-5 md:bottom-auto md:w-80"
					>
						<div class="pointer-events-auto space-y-3">
							<section
								class="rounded-[1.5rem] border border-blue-200 bg-white/95 p-4 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-blue-900 dark:bg-slate-950/95 dark:shadow-none"
							>
								<p
									class="text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400"
								>
									Promoted
								</p>

								<h2 class="mt-1 text-lg font-black text-slate-950 dark:text-slate-50">
									Featured near you
								</h2>

								<p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
									Organizations paid to boost these events.
								</p>
							</section>

							{#if promotedEvents.length}
								<div class="max-h-[52dvh] space-y-3 overflow-y-auto pr-1 md:max-h-[520px]">
									{#each promotedEvents as event (event.id)}
										<EventCard {event} variant="profile" />
									{/each}
								</div>
							{:else}
								<div
									class="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/95 p-4 text-sm font-bold text-slate-500 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-950/95 dark:text-slate-400"
								>
									No promoted events right now.
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<!-- Mobile Promoted Section -->
			<section class="mt-1 md:hidden shrink-0">
				<div class="mb-2 flex items-center justify-between gap-3">
					<div>
						<p class="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
							Promoted
						</p>
					</div>
					<span class="text-[10px] font-bold text-slate-450 dark:text-slate-550">Sponsored</span>
				</div>

				{#if promotedEvents.length}
					<div class="flex snap-x gap-2.5 overflow-x-auto pb-1">
						{#each promotedEvents.slice(0, 5) as event (event.id)}
							<div class="w-[70vw] max-w-[260px] shrink-0 snap-start">
								<a
									href={`/events/${event.id}`}
									class="block rounded-2xl border border-blue-200/80 bg-blue-50/20 p-3 shadow-md dark:border-blue-900/60 dark:bg-slate-900/60 active:scale-95 transition-all"
								>
									<div class="flex items-center justify-between gap-3">
										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-1.5">
												<span class="text-[9px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
													{event.sport}
												</span>
												<span class="rounded-full bg-blue-100 px-1.5 py-0.5 text-[8px] font-black uppercase text-blue-700 dark:bg-blue-950/80 dark:text-blue-300">
													PROMOTED
												</span>
											</div>

											<h3 class="mt-1 truncate text-xs font-black text-slate-900 dark:text-slate-100">
												{event.title}
											</h3>

											<div class="mt-1 flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
												<span class="truncate">📍 {event.location.name}</span>
											</div>
										</div>

										<div class="shrink-0 rounded-xl bg-blue-50 px-2 py-1 text-center dark:bg-blue-950/80">
											<p class="text-xs font-black text-blue-600 dark:text-blue-300">
												{event.participantIds.length}/{event.maxParticipants}
											</p>
											<p class="text-[8px] font-bold text-slate-500 dark:text-slate-400">players</p>
										</div>
									</div>
								</a>
							</div>
						{/each}
					</div>
				{:else}
					<div
						class="rounded-xl border border-dashed border-slate-350 bg-white p-2.5 text-xs font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
					>
						No promoted events right now.
					</div>
				{/if}
			</section>
		</div>
	{/if}
</main>
