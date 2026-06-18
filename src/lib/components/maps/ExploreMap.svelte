<script lang="ts">
	import { onMount } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import type { Sport, SportEvent, SportLevel } from '$lib/schema';
	import { themeState } from '$lib/theme.svelte';

	let { events = [], currentUserId = '', onFilteredCountChange, getEventHref } = $props<{
		events: SportEvent[];
		currentUserId?: string;
		onFilteredCountChange?: (count: number) => void;
		getEventHref?: (event: SportEvent) => string;
	}>();

	let mapContainer: HTMLDivElement;
	let map = $state<mapboxgl.Map | null>(null);
	let mapReady = $state(false);
	let selectedEvent = $state<SportEvent | null>(null);
	let markers: mapboxgl.Marker[] = [];
	let showFilters = $state(false);
	let selectedSports = $state<Sport[]>([]);
	let selectedLevels = $state<SportLevel[]>([]);

	const availableLevels: SportLevel[] = ['beginner', 'casual', 'intermediate', 'advanced'];

	let availableSports = $derived.by(() => {
		return [...new Set(events.map((event) => event.sport))].sort();
	});

	let filteredEvents = $derived.by(() => {
		return events.filter((event) => {
			const matchesSport =
				selectedSports.length === 0 || selectedSports.includes(event.sport);

			const eventLevel = event.level ?? 'casual';

			const matchesLevel =
				selectedLevels.length === 0 || selectedLevels.includes(eventLevel);

			return matchesSport && matchesLevel;
		});
	});
	$effect(() => {
		onFilteredCountChange?.(filteredEvents.length);
	});
	function toggleLevelFilter(level: SportLevel) {
		if (selectedLevels.includes(level)) {
			selectedLevels = selectedLevels.filter((item) => item !== level);
		} else {
			selectedLevels = [...selectedLevels, level];
		}

		selectedEvent = null;
	}

	function clearAllFilters() {
		selectedSports = [];
		selectedLevels = [];
		selectedEvent = null;
	}
	function toggleSportFilter(sport: Sport) {
		if (selectedSports.includes(sport)) {
			selectedSports = selectedSports.filter((item) => item !== sport);
		} else {
			selectedSports = [...selectedSports, sport];
		}

		selectedEvent = null;
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
	}

	function selectEvent(event: SportEvent) {
		selectedEvent = event;

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
		return event.creatorId === currentUserId ? '#2563eb' : '#dc2626';
	}
	function renderMarkers() {
		if (!map || !mapReady) return;

		clearMarkers();

		const eventsWithCoords = filteredEvents
			.map((event) => ({
				event,
				coords: getCoords(event)
			}))
			.filter((item) => item.coords !== null);

		if (eventsWithCoords.length === 0) return;

		const bounds = new mapboxgl.LngLatBounds();

		for (const item of eventsWithCoords) {
			if (!item.coords) continue;

			const marker = new mapboxgl.Marker({ color: getMarkerColor(item.event) })
				.setLngLat([item.coords.lng, item.coords.lat])
				.addTo(map);
			marker.getElement().addEventListener('click', () => {
				selectEvent(item.event);
			});

			markers.push(marker);
			bounds.extend([item.coords.lng, item.coords.lat]);
		}

		map.fitBounds(bounds, {
			padding: 80,
			maxZoom: 13
		});
	}

	onMount(() => {		
		mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN;

		map = new mapboxgl.Map({
			container: mapContainer,
			style: 'mapbox://styles/mapbox/standard',
			config: {
				basemap: {
					lightPreset: $themeState ? "night" : "day",
				},
			},
			center: [-9.1393, 38.7223],
			zoom: 10
		});

		const unsubscribeThemeState = themeState.subscribe((state) => {
			const lPreset = state ? "night" : "day";
			
			if(map) {
				map.setConfig("basemap", { lightPreset: lPreset });
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
		if (mapReady) {
			renderMarkers();
		}
	});
</script>

<section class="relative overflow-hidden rounded-4x1 border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
	<div bind:this={mapContainer} class="h-130 w-full"></div>
	<div class="absolute right-0 bottom-0 z-10 rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-lg">

		{#if currentUserId}
			<div class="flex items-center gap-2 text-sm">
				<span class="h-3 w-3 rounded-full bg-blue-600"></span>
				<span>My events</span>
			</div>
		{/if}

		<div class={currentUserId ? 'mt-2 flex items-center gap-2 text-sm' : 'flex items-center gap-2 text-sm'}>
			<span class="h-3 w-3 rounded-full bg-red-600"></span>
			<span>Public events</span>
		</div>

		{#if currentUserId}
			<div class="mt-2 flex items-center gap-2 text-sm">
				<span class="h-3 w-3 rounded-full bg-yellow-600"></span>
				<span>Friends' events</span>
			</div>
		{/if}
	
	</div>
	<div class="border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
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
					class="h-4 w-4"
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
			<div class="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
				<div class="flex items-center justify-between gap-3">
					<div>
						<p class="text-sm font-black text-slate-950 dark:text-slate-50">
							Sport
						</p>
						<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
							Choose which sports appear on the map.
						</p>
					</div>
				</div>

				{#if availableSports.length === 0}
					<p class="mt-4 text-sm text-slate-500 dark:text-slate-400">
						No sports available.
					</p>
				{:else}
					<div class="mt-4 flex flex-wrap gap-2">
						{#each availableSports as sport (sport)}
							<button
								type="button"
								onclick={() => toggleSportFilter(sport)}
								class={`rounded-full px-4 py-2 text-sm font-bold capitalize transition ${
									selectedSports.includes(sport)
										? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
										: 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-blue-950 dark:hover:text-blue-300'
								}`}
							>
								{sport}
							</button>
						{/each}
					</div>
				{/if}
			</div>
			<div class="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
				<p class="text-sm font-black text-slate-950 dark:text-slate-50">
					Level
				</p>

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
									: 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-blue-950 dark:hover:text-blue-300'
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
			class="absolute left-5 top-5 z-10 w-80 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-300/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
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
						class=" mt-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300"
					>
						{selectedEvent.level ?? 'casual'}
					</span>
				</div>

				<button
					type="button"
					onclick={() => (selectedEvent = null)}
					class="flex h-6 w-6 items-center justify-center square-full text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
				>
					×
				</button>
			</div>

			<div class="mt-5 space-y-4">
				<div>
					<p class="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-350">Location</p>
					<p class="mt-1 font-semibold text-slate-800 dark:text-slate-300">
						{selectedEvent.location?.name ?? 'Location not set'}
					</p>

					{#if selectedEvent.location?.address}
						<p class="mt-1 text-sm text-slate-500">
							{selectedEvent.location.address}
						</p>
					{/if}
				</div>

				<div class="rounded-2xl bg-blue-50 p-4 dark:bg-slate-800">
					<p class="text-xs font-bold uppercase tracking-wide text-blue-500">Players</p>
					<p class="mt-1 text-2xl font-black text-blue-600">
						{selectedEvent.participantIds.length}/{selectedEvent.maxParticipants}
					</p>
					<p class="text-sm font-medium text-slate-500">confirmed players</p>
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
					href={getEventHref ? getEventHref(selectedEvent) : `/events/${selectedEvent.id}`}
					class="block rounded-2xl bg-blue-600 px-5 py-3 text-center font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
				>
					{getEventHref ? 'Sign up to join' : 'View event'}
				</a>
			</div>
		</aside>
	{/if}
</section>