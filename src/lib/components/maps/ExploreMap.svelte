<script lang="ts">
	import { onMount } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	// @ts-expect-error - Vite handles ?worker imports dynamically
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

	let selectedEvent = $state<SportEvent | null>(null);
	let markers: mapboxgl.Marker[] = [];
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

			const markerColor = getMarkerColor(item.event);
			const creator = creatorProfiles[item.event.creatorId];
			const photoURL =
				item.event.groupPhotoURL || item.event.organizationLogoURL || creator?.photoURL;
			const displayName =
				item.event.hostType === 'organization'
					? item.event.organizationName || creator?.displayName
					: creator?.displayName;
			const sportEmoji = getSportEmoji(item.event.sport);

			const el = document.createElement('div');
			el.className = 'custom-marker';
			el.style.cursor = 'pointer';

			let innerHTML = '';
			if (photoURL) {
				innerHTML = `<img src="${photoURL}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; background-color: #e2e8f0;" referrerpolicy="no-referrer" />`;
			} else {
				const initial = (displayName || '?').trim().slice(0, 1).toUpperCase();
				innerHTML = `<div style="width: 100%; height: 100%; border-radius: 50%; background-color: #dbeafe; color: #2563eb; font-weight: 900; display: flex; align-items: center; justify-content: center; font-size: 13px;">${initial}</div>`;
			}

			el.innerHTML = `
				<div style="display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));">
					<div style="position: relative; width: 40px; height: 40px; border-radius: 50%; background-color: ${markerColor}; display: flex; align-items: center; justify-content: center; padding: 2.5px;">
						${innerHTML}
						<div style="position: absolute; top: -4px; right: -4px; width: 15px; height: 15px; border-radius: 50%; background-color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 9px; box-shadow: 0 1px 3px rgba(0,0,0,0.15); border: 0.5px solid #e2e8f0;">
							${sportEmoji}
						</div>
					</div>
					<div style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid ${markerColor}; margin-top: -1px;"></div>
				</div>
			`;

			const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
				.setLngLat([item.coords.lng, item.coords.lat])
				.addTo(map);

			el.addEventListener('click', () => {
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
	class="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
>
	<div
		bind:this={mapContainer}
		class="h-[calc(100dvh-170px)] min-h-[500px] w-full md:h-[calc(100vh-240px)] md:min-h-[620px]"
	></div>

	<div
		class="absolute right-4 bottom-4 z-10 rounded-2xl bg-white/95 p-4 shadow-lg backdrop-blur dark:bg-slate-900/95"
	>
		{#if currentUserId}
			<div class="flex items-center gap-2 text-sm">
				<span class="h-3 w-3 rounded-full bg-blue-600"></span>
				<span>My events</span>
			</div>
		{/if}

		<div
			class={currentUserId
				? 'mt-2 flex items-center gap-2 text-sm'
				: 'flex items-center gap-2 text-sm'}
		>
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
