<script lang="ts">
	import { onMount, mount, unmount } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	import MapboxWorker from 'mapbox-gl/dist/mapbox-gl-csp-worker?worker';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import type { Sport, SportEvent, SportLevel } from '$lib/schema';
	import { themeState } from '$lib/theme.svelte';

	let {
		events,
		currentUserId = '',
		friendIds = [],
		onFilteredCountChange,
		onSelectedEventChange,
		getEventHref = (event: SportEvent) => `/events/${event.id}`
	} = $props<{
		events: SportEvent[];
		currentUserId?: string;
		friendIds?: string[];
		onFilteredCountChange?: (count: number) => void;
		onSelectedEventChange?: (eventId: string | null) => void;
		getEventHref?: (event: SportEvent) => string;
	}>();

	let mapContainer: HTMLDivElement;
	let map = $state<mapboxgl.Map | null>(null);
	let mapReady = $state(false);
	import { getUserProfile } from '$lib/services/user.service';
	import Marker from './Marker.svelte';

	let selectedEvent = $state<SportEvent | null>(null);
	let markers: mapboxgl.Marker[] = [];
	let svelteMarkers: any[] = [];
	let showFilters = $state(false);
	let selectedSports = $state<Sport[]>([]);
	let selectedLevels = $state<SportLevel[]>([]);

	let creatorProfiles = $state<Record<string, { photoURL?: string | null; displayName?: string }>>(
		{}
	);

	async function loadCreatorProfiles(eventsList: SportEvent[]) {
		const uniqueCreatorIds = [...new Set(eventsList.map((e) => e.creatorId))];
		const idsToLoad = uniqueCreatorIds.filter((id) => !creatorProfiles[id]);
		if (idsToLoad.length === 0) return;

		try {
			const profiles = await Promise.all(
				idsToLoad.map(async (id) => {
					const profile = await getUserProfile(id);
					return { id, profile };
				})
			);

			const newProfiles = { ...creatorProfiles };
			for (const item of profiles) {
				if (item.profile) {
					newProfiles[item.id] = {
						photoURL: item.profile.photoURL ?? null,
						displayName: item.profile.displayName
					};
				} else {
					newProfiles[item.id] = {
						photoURL: null,
						displayName: 'Unknown'
					};
				}
			}
			creatorProfiles = newProfiles;
		} catch (err) {
			console.error('Failed to load creator profiles for explore map:', err);
		}
	}

	function getSportEmoji(sport: string): string {
		const emojis: Record<string, string> = {
			football: '⚽',
			padel: '🎾',
			basketball: '🏀',
			running: '🏃',
			gym: '🏋️',
			tennis: '🎾',
			cycling: '🚴',
			volleyball: '🏐',
			other: '🎮'
		};
		return emojis[sport.toLowerCase()] || '🏆';
	}

	$effect(() => {
		if (events.length > 0) {
			loadCreatorProfiles(events);
		}
	});

	const availableLevels: SportLevel[] = ['beginner', 'casual', 'intermediate', 'advanced'];

	let availableSports = $derived.by((): Sport[] => {
		const sports = events.map((event: SportEvent): Sport => event.sport);
		return [...new Set<Sport>(sports)].sort();
	});

	let filteredEvents = $derived.by((): SportEvent[] => {
		return events.filter((event: SportEvent) => {
			const matchesSport = selectedSports.length === 0 || selectedSports.includes(event.sport);

			const eventLevel = event.level ?? 'casual';

			const matchesLevel = selectedLevels.length === 0 || selectedLevels.includes(eventLevel);

			return matchesSport && matchesLevel;
		});
	});

	$effect(() => {
		onFilteredCountChange?.(filteredEvents.length);

		if (
			selectedEvent &&
			!filteredEvents.some((event: SportEvent) => event.id === selectedEvent?.id)
		) {
			clearSelectedEvent();
		}
	});

	function clearSelectedEvent() {
		selectedEvent = null;
		onSelectedEventChange?.(null);
	}

	function toggleLevelFilter(level: SportLevel) {
		if (selectedLevels.includes(level)) {
			selectedLevels = selectedLevels.filter((item) => item !== level);
		} else {
			selectedLevels = [...selectedLevels, level];
		}

		clearSelectedEvent();
	}

	function clearAllFilters() {
		selectedSports = [];
		selectedLevels = [];
		clearSelectedEvent();
	}

	function toggleSportFilter(sport: Sport) {
		if (selectedSports.includes(sport)) {
			selectedSports = selectedSports.filter((item) => item !== sport);
		} else {
			selectedSports = [...selectedSports, sport];
		}

		clearSelectedEvent();
	}

	function getCoords(event: SportEvent) {
		const location = event.location as {
			lat?: number | null;
			lng?: number | null;
		};

		const lat = location?.lat;
		const lng = location?.lng;

		if (typeof lat !== 'number' || typeof lng !== 'number') return null;
		if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

		return { lat, lng };
	}

	function clearMarkers() {
		for (const marker of markers) {
			marker.remove();
		}
		markers = [];

		for (const comp of svelteMarkers) {
            unmount(comp);
        }
        svelteMarkers = [];
	}

	function selectEvent(event: SportEvent) {
		selectedEvent = event;
		onSelectedEventChange?.(event.id);

		const coords = getCoords(event);

		if (!map || !coords) return;

		map.flyTo({
			center: [coords.lng, coords.lat],
			zoom: 14,
			speed: 1.2,
			curve: 1.4,
			essential: true
		});
	}

	function getMarkerColor(event: SportEvent) {
		if (event.creatorId === currentUserId) {
			return '#2563eb'; // Blue - My events
		}
		if (friendIds.includes(event.creatorId)) {
			return '#ca8a04'; // Yellow - Friends' events
		}
		return '#dc2626'; // Red - Public events
	}

	function renderMarkers() {
		if (!map || !mapReady) return;

		clearMarkers();

		const eventsWithCoords = filteredEvents
			.map((event: SportEvent) => ({
				event,
				coords: getCoords(event)
			}))
			.filter(
				(item): item is { event: SportEvent; coords: { lat: number; lng: number } } =>
					item.coords !== null
			);

		if (eventsWithCoords.length === 0) return;

		const bounds = new mapboxgl.LngLatBounds();

		for (const item of eventsWithCoords) {
			if (!item.coords) continue;

			 // Get your photo URL (using your previously commented logic)
            const creator = creatorProfiles[item.event.creatorId];
            const photoURL = item.event.groupPhotoURL || item.event.organizationLogoURL || creator?.photoURL || '';

            // 3. Create a wrapper element for Mapbox
            const el = document.createElement('div');
            el.className = 'custom-marker';
            el.style.cursor = 'pointer';

            // 4. Mount the Svelte 5 component to the wrapper element
            const markerComponent = mount(Marker, {
                target: el,
                props: {
                    profile_url: photoURL,
					sport: item.event.sport,
                    n_confirmed_attendees: item.event.participantIds?.length || 0,
                    max_occupancy: item.event.maxParticipants || 0,
                    marker_color: getMarkerColor(item.event)
                }
            });
            svelteMarkers.push(markerComponent);

            // 5. Add event listener to the wrapper and add it to Mapbox
            el.addEventListener('click', () => {
                selectEvent(item.event);
            });

            const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                .setLngLat([item.coords.lng, item.coords.lat])
                .addTo(map);

            markers.push(marker);
            bounds.extend([item.coords.lng, item.coords.lat]);
        }

		map.fitBounds(bounds, {
			padding: 80,
			maxZoom: 13
		});
	}

	onMount(() => {
		(mapboxgl as any).workerClass = MapboxWorker;
		mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN;

		map = new mapboxgl.Map({
			container: mapContainer,
			style: 'mapbox://styles/mapbox/standard',
			config: {
				basemap: {
					lightPreset: $themeState ? 'night' : 'day'
				}
			},
			center: [-9.1393, 38.7223],
			zoom: 10
		});

		const unsubscribeThemeState = themeState.subscribe((state) => {
			const lightPreset = state ? 'night' : 'day';

			if (map) {
				map.setConfig('basemap', { lightPreset });
			}
		});

		map.addControl(new mapboxgl.NavigationControl(), 'top-right');

		map.on('load', () => {
			mapReady = true;
			map?.resize();
			renderMarkers();
		});

		return () => {
			unsubscribeThemeState();
			clearMarkers();
			map?.remove();
		};
	});

	$effect(() => {
		const profiles = creatorProfiles; // Track changes
		if (mapReady) {
			renderMarkers();
		}
	});
</script>

<section
	class="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 flex-1 min-h-0 flex flex-col"
>
	<div
		bind:this={mapContainer}
		class="flex-1 min-h-[250px] w-full md:h-[calc(100vh-240px)] md:min-h-[620px] md:flex-none"
	></div>

	<div
		class="absolute right-2 bottom-2 z-10 flex flex-row flex-wrap items-center gap-3 rounded-xl bg-white/95 p-2 shadow-md backdrop-blur dark:bg-slate-900/95 text-xs md:right-4 md:bottom-4 md:flex-col md:items-start md:gap-2 md:rounded-2xl md:p-4 md:shadow-lg md:text-sm"
	>
		{#if currentUserId}
			<div class="flex items-center gap-1.5">
				<span class="h-2.5 w-2.5 rounded-full bg-blue-600"></span>
				<span>My events</span>
			</div>
		{/if}

		<div class="flex items-center gap-1.5">
			<span class="h-2.5 w-2.5 rounded-full bg-red-600"></span>
			<span>Public events</span>
		</div>

		{#if currentUserId}
			<div class="flex items-center gap-1.5">
				<span class="h-2.5 w-2.5 rounded-full bg-yellow-600"></span>
				<span>Friends events</span>
			</div>
		{/if}
	</div>

	<!-- Floating Filters Button (Mobile Only) -->
	<div class="absolute left-4 top-4 z-10 md:hidden">
		<button
			type="button"
			onclick={() => (showFilters = !showFilters)}
			class="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-slate-700 shadow-md backdrop-blur border border-slate-200/60 dark:bg-slate-900/90 dark:text-slate-200 dark:border-slate-800 transition-all active:scale-95 hover:bg-white dark:hover:bg-slate-900"
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-4 w-4 text-blue-600 dark:text-blue-400"
			>
				<path d="M3 5h18" />
				<path d="M7 12h10" />
				<path d="M10 19h4" />
			</svg>

			<span>Filters</span>

			{#if selectedSports.length > 0 || selectedLevels.length > 0}
				<span class="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-black text-white">
					{selectedSports.length + selectedLevels.length}
				</span>
			{/if}
		</button>
	</div>

	<!-- Floating Filters Modal Card (Mobile Only) -->
	{#if showFilters}
		<div
			class="absolute inset-x-4 top-16 z-30 max-h-[70%] overflow-y-auto rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:hidden"
		>
			<div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
				<h3 class="text-base font-black text-slate-950 dark:text-slate-50">Filters</h3>
				<div class="flex items-center gap-3">
					{#if selectedSports.length > 0 || selectedLevels.length > 0}
						<button
							type="button"
							onclick={clearAllFilters}
							class="text-xs font-bold text-red-500 hover:text-red-600 transition"
						>
							Clear All
						</button>
					{/if}
					<button
						type="button"
						onclick={() => (showFilters = false)}
						class="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 transition font-black text-sm"
						aria-label="Close filters"
					>
						×
					</button>
				</div>
			</div>

			<!-- Sports Filter -->
			<div class="mt-4">
				<div>
					<p class="text-xs font-black uppercase tracking-wider text-slate-400">Sport</p>
				</div>

				{#if availableSports.length === 0}
					<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">No sports available.</p>
				{:else}
					<div class="mt-2.5 flex flex-wrap gap-1.5">
						{#each availableSports as sport (sport)}
							<button
								type="button"
								onclick={() => toggleSportFilter(sport)}
								class={`rounded-full px-3 py-1.5 text-xs font-bold capitalize transition ${
									selectedSports.includes(sport)
										? 'bg-blue-600 text-white shadow-sm'
										: 'bg-slate-50 text-slate-600 border border-slate-100 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-blue-950'
								}`}
							>
								{sport}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Levels Filter -->
			<div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
				<div>
					<p class="text-xs font-black uppercase tracking-wider text-slate-400">Level</p>
				</div>

				<div class="mt-2.5 flex flex-wrap gap-1.5">
					{#each availableLevels as level (level)}
						<button
							type="button"
							onclick={() => toggleLevelFilter(level)}
							class={`rounded-full px-3 py-1.5 text-xs font-bold capitalize transition ${
								selectedLevels.includes(level)
									? 'bg-blue-600 text-white shadow-sm'
									: 'bg-slate-50 text-slate-600 border border-slate-100 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-blue-950'
							}`}
						>
							{level}
						</button>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Desktop Filters Bar (Web Only) -->
	<div class="hidden md:block border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 shrink-0">
		<div class="flex items-center justify-between gap-3">
			<button
				type="button"
				onclick={() => (showFilters = !showFilters)}
				class="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-4 w-4 text-blue-600 dark:text-blue-400"
				>
					<path d="M3 5h18" />
					<path d="M7 12h10" />
					<path d="M10 19h4" />
				</svg>

				<span>Filters</span>

				{#if selectedSports.length > 0 || selectedLevels.length > 0}
					<span class="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-black text-white">
						{selectedSports.length + selectedLevels.length}
					</span>
				{/if}
			</button>

			{#if selectedSports.length > 0 || selectedLevels.length > 0}
				<button
					type="button"
					onclick={clearAllFilters}
					class="text-sm font-bold text-slate-500 transition hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
				>
					Clear
				</button>
			{/if}
		</div>

		{#if showFilters}
			<div class="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700 max-h-[220px] overflow-y-auto">
				<div>
					<p class="text-sm font-black text-slate-950 dark:text-slate-50">Sport</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
						Choose which sports appear on the map.
					</p>
				</div>

				{#if availableSports.length === 0}
					<p class="mt-4 text-sm text-slate-500 dark:text-slate-400">No sports available.</p>
				{:else}
					<div class="mt-4 flex flex-wrap gap-2">
						{#each availableSports as sport (sport)}
							<button
								type="button"
								onclick={() => toggleSportFilter(sport)}
								class={`rounded-full px-4 py-2 text-sm font-bold capitalize transition ${
									selectedSports.includes(sport)
										? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
										: 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-750 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-blue-950'
								}`}
							>
								{sport}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<div class="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
				<p class="text-sm font-black text-slate-950 dark:text-slate-50">Level</p>
				<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
					Choose the difficulty level of the events.
				</p>

				<div class="mt-4 flex flex-wrap gap-2">
					{#each availableLevels as level (level)}
						<button
							type="button"
							onclick={() => toggleLevelFilter(level)}
							class={`rounded-full px-4 py-2 text-sm font-bold capitalize transition ${
								selectedLevels.includes(level)
									? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
									: 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-blue-950'
							}`}
						>
							{level}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	{#if selectedEvent}
		<aside
			class="absolute inset-x-3 bottom-3 z-30 max-h-[65dvh] overflow-y-auto rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-300/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none md:inset-x-auto md:bottom-auto md:left-5 md:top-5 md:w-80 md:rounded-[1.75rem] md:p-5"
		>
			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-xs font-bold uppercase tracking-[0.25em] text-blue-600">
						{selectedEvent.sport}
					</p>

					<h2 class="mt-2 text-2xl font-black leading-tight text-slate-950 dark:text-slate-50">
						{selectedEvent.title}
					</h2>

					<span
						class="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300"
					>
						{selectedEvent.level ?? 'casual'}
					</span>
				</div>

				<button
					type="button"
					onclick={clearSelectedEvent}
					class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
					aria-label="Close event preview"
				>
					×
				</button>
			</div>

			<div class="mt-5 space-y-4">
				<div>
					<p class="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-400">
						Location
					</p>

					<p class="mt-1 font-semibold text-slate-800 dark:text-slate-300">
						{selectedEvent.location?.name ?? 'Location not set'}
					</p>

					{#if selectedEvent.location?.address}
						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
							{selectedEvent.location.address}
						</p>
					{/if}
				</div>

				<div class="rounded-2xl bg-blue-50 p-4 dark:bg-slate-800">
					<p class="text-xs font-bold uppercase tracking-wide text-blue-500">Players</p>

					<p class="mt-1 text-2xl font-black text-blue-600">
						{selectedEvent.participantIds.length}/{selectedEvent.maxParticipants}
					</p>

					<p class="text-sm font-medium text-slate-500 dark:text-slate-400">confirmed players</p>
				</div>

				{#if selectedEvent.pricePerPerson}
					<div>
						<p class="text-xs font-bold uppercase tracking-wide text-slate-400">Price</p>

						<p class="mt-1 font-semibold text-slate-800 dark:text-slate-300">
							€{selectedEvent.pricePerPerson.toFixed(2)} / person
						</p>
					</div>
				{/if}

				<a
					href={getEventHref(selectedEvent)}
					class="block rounded-2xl bg-blue-600 px-5 py-3 text-center font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
				>
					View event
				</a>
			</div>
		</aside>
	{/if}
</section>
