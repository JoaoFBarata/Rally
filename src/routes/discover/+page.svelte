<script lang="ts">
	import { onMount } from 'svelte';
	import ExploreMap from '$lib/components/maps/ExploreMap.svelte';
	import { getPublicEvents } from '$lib/services/explore.service';
	import type { Sport, SportEvent, SportLevel } from '$lib/schema';
	import { authState } from '$lib/auth.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { formatDate as formatEventDate, getSportBackgroundImage } from '$lib/utils/format.utils';
	import { i18n } from '$lib/services/i18n.svelte';
	import { getEventStartAtMillis } from '$lib/services/event.service';
	import { getEventTemporalState } from '$lib/utils/event-lifecycle.utils';

	type DateFilter = 'today' | '7' | '14' | '30' | 'all';
	type PriceFilter = 'all' | 'free' | 'paid';
	type TemporalFilter = 'all' | 'live' | 'starting_soon';

	const sportIcons: Record<Sport, string> = {
		football: '⚽',
		tennis: '🎾',
		padel: '🏸',
		basketball: '🏀',
		running: '🏃',
		volleyball: '🏐',
		cycling: '🚴',
		gym: '🏋️',
		bowling: '🎳',
		snooker: '🎱',
		golf: '⛳',
		swimming: '🏊',
		hiking: '🥾',
		yoga: '🧘',
		surf: '🏄',
		pingpong: '🏓',
		rugby: '🏉',
		americanfootball: '🏈',
		other: '🏅'
	};

	const levelColors: Record<SportLevel, string> = {
		beginner: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
		casual: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
		intermediate: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
		advanced: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
	};

	let events = $state<SportEvent[]>([]);
	let loading = $state(true);
	let loadError = $state('');
	let filteredCount = $state(0);
	let selectedSports = $state<Sport[]>([]);
	let selectedLevels = $state<SportLevel[]>([]);
	let dateFilter = $state<DateFilter>('14');
	let priceFilter = $state<PriceFilter>('all');
	let maxPrice = $state(50);
	let temporalFilter = $state<TemporalFilter>('all');
	let audienceFilter = $state<'all' | 'public'>('all');
	let onlyTournaments = $state(false);
	let searchTerm = $state('');
	const availableLevels: SportLevel[] = ['beginner', 'casual', 'intermediate', 'advanced'];

	let availableSports = $derived(
		[...new Set(events.map((event) => event.sport))].sort() as Sport[]
	);
	let highestPrice = $derived(
		Math.max(10, Math.ceil(Math.max(...events.map((event) => event.pricePerPerson ?? 0), 0)))
	);
	let activeFilterCount = $derived(
		selectedSports.length +
			selectedLevels.length +
			(dateFilter === '14' ? 0 : 1) +
			(priceFilter === 'all' ? 0 : 1) +
			(temporalFilter === 'all' ? 0 : 1) +
			(audienceFilter === 'all' ? 0 : 1) +
			(onlyTournaments ? 1 : 0) +
			(searchTerm.trim() ? 1 : 0)
	);
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
	let temporalFilterOptions = $derived([
		{ value: 'all' as const, label: i18n.t('all') },
		{ value: 'live' as const, label: i18n.t('happening_now') },
		{ value: 'starting_soon' as const, label: i18n.t('starting_soon') }
	]);
	let audienceFilterOptions = $derived([
		{ value: 'all' as const, label: i18n.t('all') },
		{ value: 'public' as const, label: i18n.t('public_events') }
	]);

	function matchesSelectedDate(event: SportEvent, now: number) {
		const temporalState = getEventTemporalState(event, now);
		if (temporalState === 'live') return true;

		const startAt = getEventStartAtMillis(event);
		if (dateFilter === 'all') return startAt >= now;
		if (dateFilter === 'today') {
			const today = new Date(now);
			const eventDate = new Date(startAt);
			return (
				eventDate.getFullYear() === today.getFullYear() &&
				eventDate.getMonth() === today.getMonth() &&
				eventDate.getDate() === today.getDate()
			);
		}

		return startAt >= now && startAt <= now + Number(dateFilter) * 86_400_000;
	}

	let eventsInSelectedDateRangeCount = $derived.by(() => {
		const now = Date.now();
		return events.filter((event) => matchesSelectedDate(event, now)).length;
	});

	let filteredEvents = $derived.by(() => {
		const now = Date.now();
		const term = searchTerm.trim().toLocaleLowerCase('pt-PT');
		return events.filter((event) => {
			const temporalState = getEventTemporalState(event, now);
			const matchesDate = matchesSelectedDate(event, now);

			const price = event.pricePerPerson ?? 0;
			const matchesPrice =
				priceFilter === 'all' ||
				(priceFilter === 'free' ? price <= 0 : price > 0 && price <= maxPrice);
			const searchable = [
				event.title,
				event.description,
				event.customSport,
				event.location?.name,
				event.location?.address,
				event.organizationName
			]
				.filter(Boolean)
				.join(' ')
				.toLocaleLowerCase('pt-PT');

			return (
				(!term || searchable.includes(term)) &&
				(selectedSports.length === 0 || selectedSports.includes(event.sport)) &&
				(selectedLevels.length === 0 || selectedLevels.includes(event.level ?? 'casual')) &&
				(!onlyTournaments || event.eventKind === 'tournament') &&
				(temporalFilter === 'all' || temporalState === temporalFilter) &&
				matchesDate &&
				matchesPrice
			);
		});
	});

	function clearFilters() {
		selectedSports = [];
		selectedLevels = [];
		dateFilter = '14';
		priceFilter = 'all';
		temporalFilter = 'all';
		audienceFilter = 'all';
		onlyTournaments = false;
		searchTerm = '';
		maxPrice = highestPrice;
	}

	function formatDate(startAt: unknown): string {
		return formatEventDate(startAt, true);
	}

	onMount(async () => {
		try {
			events = await getPublicEvents();
			filteredCount = filteredEvents.length;
		} catch (err) {
			console.error('Discover events error:', err);
			loadError = getFriendlyErrorMessage(err, 'Could not load events.');
		} finally {
			loading = false;
		}
	});
</script>

<div class="min-h-screen bg-white dark:bg-slate-950">
	<!-- Top navigation -->
	<nav
		class="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-950"
	>
		<a href="/">
			<img src="/rally-logo-black.png" alt="Rally" class="h-8 w-auto object-contain dark:hidden" />
			<img
				src="/rally-logo-white.png"
				alt="Rally"
				class="hidden h-8 w-auto object-contain dark:block"
			/>
		</a>

		<div class="flex items-center gap-3">
			{#if authState.user}
				<a
					href="/dashboard"
					class="rounded-full transition hover:opacity-80"
					aria-label="Go to dashboard"
				>
					<UserAvatar
						displayName={authState.user.displayName}
						email={authState.user.email}
						photoURL={authState.user.photoURL}
						size="md"
					/>
				</a>
			{:else}
				<a
					href="/login"
					class="text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
				>
					{i18n.t('login')}
				</a>
				<a
					href="/register"
					class="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
				>
					{i18n.t('join_rally')}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M7 17L17 7" /><path d="M7 7h10v10" />
					</svg>
				</a>
			{/if}
		</div>
	</nav>

	<!-- Hero -->
	<div class="px-6 py-10 text-center">
		<h1 class="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
			{i18n.t('explore')}
		</h1>
		<p class="mx-auto mt-3 max-w-md text-base text-slate-500 dark:text-slate-400">
			{i18n.t('explore_subtitle')}
		</p>
	</div>

	<!-- Map -->
	<div class="mx-auto max-w-6xl px-5">
		{#if loading}
			<div
				class="flex h-96 items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
			>
				<p class="text-slate-400 dark:text-slate-500">{i18n.t('loading_events')}</p>
			</div>
		{:else if loadError}
			<div
				class="flex h-48 items-center justify-center rounded-3xl border border-red-200 bg-red-50 p-6 text-center text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
			>
				{loadError}
			</div>
		{:else}
			<ExploreMap
				events={filteredEvents}
				totalEventsCount={eventsInSelectedDateRangeCount}
				currentUserId={authState.user?.uid ?? ''}
				onFilteredCountChange={(n) => (filteredCount = n)}
				getEventHref={(event) => (authState.user ? `/events/${event.id}` : '/register')}
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
				onToggleSport={(sport) =>
					(selectedSports = selectedSports.includes(sport)
						? selectedSports.filter((item) => item !== sport)
						: [...selectedSports, sport])}
				onToggleLevel={(level) =>
					(selectedLevels = selectedLevels.includes(level)
						? selectedLevels.filter((item) => item !== level)
						: [...selectedLevels, level])}
				onDateFilterChange={(value) => (dateFilter = value)}
				onPriceFilterChange={(value) => (priceFilter = value)}
				onMaxPriceChange={(value) => (maxPrice = value)}
				onAudienceFilterChange={(value) => {
					if (value === 'all' || value === 'public') audienceFilter = value;
				}}
				onTemporalFilterChange={(value) => (temporalFilter = value)}
				onOnlyTournamentsChange={(value) => (onlyTournaments = value)}
				onSearchChange={(value) => (searchTerm = value)}
				onClearFilters={clearFilters}
			/>

			<p class="mt-3 text-sm text-slate-400 dark:text-slate-500">
				{i18n.t('showing_events', { count: filteredCount, total: events.length })} ·
				{#if authState.user}
					<a
						href="/events/create"
						class="font-semibold text-blue-600 hover:underline dark:text-blue-400"
						>{i18n.t('create_event')}</a
					>
				{:else}
					<a href="/register" class="font-semibold text-blue-600 hover:underline dark:text-blue-400"
						>{i18n.t('join_rally')}</a
					>
				{/if}
			</p>
		{/if}
	</div>

	<!-- Popular events -->
	<div class="mx-auto max-w-6xl px-5 pb-8 pt-12">
		<h2 class="text-2xl font-black text-slate-900 dark:text-white">{i18n.t('upcoming_events')}</h2>
		<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{i18n.t('find_something_nearby')}</p>

		{#if loading}
			<div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each { length: 6 } as _, i (i)}
					<div
						class="h-52 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
					></div>
				{/each}
			</div>
		{:else if filteredEvents.length === 0}
			<div
				class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
			>
				{i18n.t('no_events_found')}
			</div>
		{:else}
			<div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each filteredEvents.slice(0, 12) as event (event.id)}
					<div
						class="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
					>
						<div class="aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
							<img
								src={event.groupPhotoURL || getSportBackgroundImage(event.sport)}
								alt={event.groupPhotoURL ? event.title : ''}
								class="h-full w-full object-cover object-center"
								style="object-position: 50% 50%;"
							/>
						</div>
						<div class="flex flex-1 flex-col p-4">
							<div class="flex items-start justify-between gap-3">
								<span class="text-xl">{sportIcons[event.sport] ?? '🏅'}</span>
								<span
									class={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${levelColors[event.level ?? 'casual']}`}
								>
									{i18n.t(event.level ?? 'casual')}
								</span>
							</div>

							<h3
								class="mt-2.5 min-h-5 line-clamp-1 text-sm font-bold text-slate-900 dark:text-white"
							>
								{event.title}
							</h3>

							<div class="mt-1 min-h-9">
								{#if event.description}
									<p class="line-clamp-2 text-xs leading-4 text-slate-500 dark:text-slate-400">
										{event.description}
									</p>
								{/if}
							</div>

							<div class="mt-auto space-y-1.5 pt-3 text-xs text-slate-600 dark:text-slate-400">
								<div class="flex items-center gap-2">
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="h-4 w-4 shrink-0 text-slate-400"
									>
										<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
										<circle cx="12" cy="10" r="3" />
									</svg>
									<span class="truncate">{event.location.name}</span>
								</div>

								<div class="flex items-center gap-2">
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="h-4 w-4 shrink-0 text-slate-400"
									>
										<circle cx="12" cy="12" r="10" />
										<polyline points="12 6 12 12 16 14" />
									</svg>
									<span>{formatDate(event.startAt)}</span>
								</div>

								<div class="flex items-center gap-2">
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="h-4 w-4 shrink-0 text-slate-400"
									>
										<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
										<circle cx="9" cy="7" r="4" />
										<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
										<path d="M16 3.13a4 4 0 0 1 0 7.75" />
									</svg>
									<span
										>{event.participantIds.length}/{event.maxParticipants} {i18n.t('players')}</span
									>
								</div>
							</div>

							<a
								href={authState.user ? `/events/${event.id}` : '/register'}
								class="mt-4 block rounded-xl bg-slate-100 px-3 py-2 text-center text-xs font-bold text-slate-700 transition hover:bg-blue-600 hover:text-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-blue-600 dark:hover:text-white"
							>
								{authState.user ? i18n.t('view_event') : i18n.t('join_rally')}
							</a>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- CTA banner -->
	{#if !authState.user}
		<div class="mx-auto max-w-6xl px-5 pb-16">
			<div class="rounded-3xl bg-blue-600 px-8 py-12 text-center">
				<h2 class="text-3xl font-black text-white">{i18n.t('join_rally')}</h2>
				<p class="mx-auto mt-3 max-w-sm text-base text-blue-100">
					{i18n.t('account_type_intro')}
				</p>
				<div class="mt-7 flex items-center justify-center gap-3">
					<a
						href="/register"
						class="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-blue-600 shadow-lg transition hover:bg-blue-50"
					>
						{i18n.t('create_personal_account')}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M7 17L17 7" /><path d="M7 7h10v10" />
						</svg>
					</a>
					<a
						href="/login"
						class="rounded-full border border-white/30 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
					>
						{i18n.t('login')}
					</a>
				</div>
			</div>
		</div>
	{/if}
</div>
