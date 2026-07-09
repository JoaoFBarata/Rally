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
		availableSports = [],
		availableLevels = ['beginner', 'casual', 'intermediate', 'advanced'],
		selectedSports = [],
		selectedLevels = [],
		dateFilter = '7',
		priceFilter = 'all',
		maxPrice = 50,
		highestPrice = 50,
		audienceFilter = 'all',
		activeFilterCount = 0,
		dateFilterOptions = [],
		priceFilterOptions = [],
		audienceFilterOptions = [],
		onToggleSport,
		onToggleLevel,
		onDateFilterChange,
		onPriceFilterChange,
		onMaxPriceChange,
		onAudienceFilterChange,
		onClearFilters,
		onFilteredCountChange,
		onSelectedEventChange,
		getEventHref = (event: SportEvent) => `/events/${event.id}`
	} = $props<{
		events: SportEvent[];
		currentUserId?: string;
		friendIds?: string[];
		availableSports?: Sport[];
		availableLevels?: SportLevel[];
		selectedSports?: Sport[];
		selectedLevels?: SportLevel[];
		dateFilter?: 'today' | '7' | '14' | '30' | 'all';
		priceFilter?: 'all' | 'free' | 'paid';
		maxPrice?: number;
		highestPrice?: number;
		audienceFilter?: 'all' | 'mine' | 'friends' | 'public' | 'joined';
		activeFilterCount?: number;
		dateFilterOptions?: { value: 'today' | '7' | '14' | '30' | 'all'; label: string }[];
		priceFilterOptions?: { value: 'all' | 'free' | 'paid'; label: string }[];
		audienceFilterOptions?: {
			value: 'all' | 'mine' | 'friends' | 'public' | 'joined';
			label: string;
		}[];
		onToggleSport?: (sport: Sport) => void;
		onToggleLevel?: (level: SportLevel) => void;
		onDateFilterChange?: (value: 'today' | '7' | '14' | '30' | 'all') => void;
		onPriceFilterChange?: (value: 'all' | 'free' | 'paid') => void;
		onMaxPriceChange?: (value: number) => void;
		onAudienceFilterChange?: (value: 'all' | 'mine' | 'friends' | 'public' | 'joined') => void;
		onClearFilters?: () => void;
		onFilteredCountChange?: (count: number) => void;
		onSelectedEventChange?: (eventId: string | null) => void;
		getEventHref?: (event: SportEvent) => string;
	}>();

	let mapContainer: HTMLDivElement;
	let map = $state<mapboxgl.Map | null>(null);
	let mapReady = $state(false);
	import { getUserProfile } from '$lib/services/user.service';
	import Marker from './Marker.svelte';
	import Supercluster from 'supercluster';

	let selectedEvent = $state<SportEvent | null>(null);
	let markers: mapboxgl.Marker[] = [];
	let svelteMarkers: any[] = [];
	let showFilters = $state(false);

	let clusterIndex: any = null;
	let hasFitBoundsForCurrentEvents = false;
	type EventPointFeature = {
		type: 'Feature';
		properties: {
			eventId: string;
			event: SportEvent;
			isCluster: false;
		};
		geometry: {
			type: 'Point';
			coordinates: [number, number];
		};
	};

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

	$effect(() => {
		if (events.length > 0) {
			loadCreatorProfiles(events);
		}
	});

	$effect(() => {
		onFilteredCountChange?.(events.length);

		if (
			selectedEvent &&
			!events.some((event: SportEvent) => event.id === selectedEvent?.id)
		) {
			clearSelectedEvent();
		}
	});

	$effect(() => {
		if (events) {
			hasFitBoundsForCurrentEvents = false;

			const points: EventPointFeature[] = events
				.map((event: SportEvent): EventPointFeature | null => {
					const coords = getCoords(event);
					if (!coords) return null;
					return {
						type: 'Feature' as const,
						properties: {
							eventId: event.id,
							event: event,
							isCluster: false
						},
						geometry: {
							type: 'Point' as const,
							coordinates: [coords.lng, coords.lat]
						}
					};
				})
				.filter((pt: EventPointFeature | null): pt is EventPointFeature => pt !== null);

			const index = new Supercluster({
				radius: 50,
				maxZoom: 15
			});
			index.load(points);
			clusterIndex = index;

			if (mapReady) {
				renderMarkers();
			}
		}
	});

	function clearSelectedEvent() {
		selectedEvent = null;
		onSelectedEventChange?.(null);
	}

	function toggleLevelFilter(level: SportLevel) {
		onToggleLevel?.(level);
		clearSelectedEvent();
	}

	function clearAllFilters() {
		onClearFilters?.();
		clearSelectedEvent();
	}

	function toggleSportFilter(sport: Sport) {
		onToggleSport?.(sport);
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

	function formatSelectedDate(event: SportEvent) {
		const value = event.startAt;
		const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value as unknown as string);
		if (Number.isNaN(date.getTime())) return 'Date to confirm';

		return new Intl.DateTimeFormat('en-GB', {
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		}).format(date);
	}

	function formatSelectedPrice(event: SportEvent) {
		const price = event.pricePerPerson ?? 0;
		return price > 0 ? `€${price.toFixed(2)} / person` : 'Free';
	}

	function getSelectedPreviewUrl(event: SportEvent) {
		if (event.groupPhotoURL) return event.groupPhotoURL;

		const coords = getCoords(event);
		if (!coords || !PUBLIC_MAPBOX_ACCESS_TOKEN) return '';

		const { lat, lng } = coords;
		const marker = `pin-s+00B4D8(${lng},${lat})`;
		return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${marker}/${lng},${lat},13,0/180x140@2x?access_token=${PUBLIC_MAPBOX_ACCESS_TOKEN}`;
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
			return '#00B4D8'; // Blue - My events
		}
		if (friendIds.includes(event.creatorId)) {
			return '#ca8a04'; // Yellow - Friends' events
		}
		return '#dc2626'; // Red - Public events
	}

	function renderMarkers() {
		if (!map || !mapReady || !clusterIndex) return;
		const currentMap = map;

		if (!hasFitBoundsForCurrentEvents && events.length > 0) {
			const bounds = new mapboxgl.LngLatBounds();
			let hasCoords = false;
			for (const event of events) {
				const coords = getCoords(event);
				if (coords) {
					bounds.extend([coords.lng, coords.lat]);
					hasCoords = true;
				}
			}
			if (hasCoords) {
				hasFitBoundsForCurrentEvents = true;
				currentMap.fitBounds(bounds, {
					padding: 80,
					maxZoom: 13
				});
				return;
			}
		}

		clearMarkers();

		const zoom = Math.floor(currentMap.getZoom());
		const mapBounds = currentMap.getBounds();
		if (!mapBounds) return;
		const bbox: [number, number, number, number] = [
			mapBounds.getWest(),
			mapBounds.getSouth(),
			mapBounds.getEast(),
			mapBounds.getNorth()
		];

		const features = clusterIndex.getClusters(bbox, zoom);

		for (const feature of features) {
			const [lng, lat] = feature.geometry.coordinates;

			if (feature.properties.cluster) {
				const count = feature.properties.point_count;
				const clusterId = feature.id;

				const leaves = clusterIndex.getLeaves(clusterId, Infinity);
				const sortedLeaves = leaves.slice().sort((a: any, b: any) => {
					const eventA = a.properties.event;
					const eventB = b.properties.event;
					
					const isPriorityA = eventA.creatorId === currentUserId || friendIds.includes(eventA.creatorId);
					const isPriorityB = eventB.creatorId === currentUserId || friendIds.includes(eventB.creatorId);
					
					if (isPriorityA !== isPriorityB) {
						return isPriorityA ? -1 : 1;
					}
					
					const attendeesA = eventA.participantIds?.length || 0;
					const attendeesB = eventB.participantIds?.length || 0;
					return attendeesB - attendeesA;
				});

				const priorityEvent = sortedLeaves[0].properties.event;
				const creator = creatorProfiles[priorityEvent.creatorId];
				const photoURL = priorityEvent.groupPhotoURL || priorityEvent.organizationLogoURL || creator?.photoURL || '';

				const el = document.createElement('div');
				el.className = 'custom-marker custom-cluster-marker';
				el.style.cursor = 'pointer';

				const markerComponent = mount(Marker, {
					target: el,
					props: {
						profile_url: photoURL,
						name_letter: (creator?.displayName || 'U').charAt(0).toUpperCase(),
						sport: priorityEvent.sport,
						n_confirmed_attendees: priorityEvent.participantIds?.length || 0,
						max_occupancy: priorityEvent.maxParticipants || 0,
						marker_color: getMarkerColor(priorityEvent),
						cluster_count: count - 1
					}
				});
				svelteMarkers.push(markerComponent);

				el.addEventListener('click', () => {
					clearSelectedEvent();
					try {
						const expansionZoom = clusterIndex.getClusterExpansionZoom(clusterId);
						currentMap.flyTo({
							center: [lng, lat],
							zoom: expansionZoom,
							speed: 1.2
						});
					} catch (e) {
						console.error('Expansion zoom error:', e);
					}
				});

				const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
					.setLngLat([lng, lat])
					.addTo(currentMap);
				markers.push(marker);
			} else {
				const event = feature.properties.event;
				const creator = creatorProfiles[event.creatorId];
				const photoURL = event.groupPhotoURL || event.organizationLogoURL || creator?.photoURL || '';

				const el = document.createElement('div');
				el.className = 'custom-marker';
				el.style.cursor = 'pointer';

				const markerComponent = mount(Marker, {
					target: el,
					props: {
						profile_url: photoURL,
						name_letter: (creator?.displayName || 'U').charAt(0).toUpperCase(),
						sport: event.sport,
						n_confirmed_attendees: event.participantIds?.length || 0,
						max_occupancy: event.maxParticipants || 0,
						marker_color: getMarkerColor(event)
					}
				});
				svelteMarkers.push(markerComponent);

				el.addEventListener('click', () => {
					selectEvent(event);
				});

				const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
					.setLngLat([lng, lat])
					.addTo(currentMap);

				markers.push(marker);
			}
		}
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

		const updateZoomScale = () => {
			if (!map) return;
			const zoom = map.getZoom();
			const minZoom = 7;
			const maxZoom = 15;
			let scale = 0.85 + (0.75 * (zoom - minZoom)) / (maxZoom - minZoom);
			scale = Math.max(0.8, Math.min(scale, 1.65));
			map.getContainer().style.setProperty('--map-zoom-scale', scale.toFixed(3));
		};

		map.on('zoom', () => {
			updateZoomScale();
			renderMarkers();
		});
		map.on('moveend', () => {
			renderMarkers();
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
				<span class="h-2.5 w-2.5 rounded-full bg-[#00B4D8]"></span>
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

			{#if activeFilterCount > 0}
				<span class="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-black text-white">
					{activeFilterCount}
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
					{#if activeFilterCount > 0}
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

			<!-- Date Filter -->
			<div class="mt-4">
				<p class="text-xs font-black uppercase tracking-wider text-slate-400">Date</p>
				<div class="mt-2.5 flex flex-wrap gap-1.5">
					{#each dateFilterOptions as option (option.value)}
						<button
							type="button"
							onclick={() => {
								onDateFilterChange?.(option.value);
								clearSelectedEvent();
							}}
							class={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
								dateFilter === option.value
									? 'bg-blue-600 text-white shadow-sm'
									: 'bg-slate-50 text-slate-600 border border-slate-100 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-blue-950'
							}`}
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Audience Filter -->
			<div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
				<p class="text-xs font-black uppercase tracking-wider text-slate-400">Audience</p>
				<div class="mt-2.5 flex flex-wrap gap-1.5">
					{#each audienceFilterOptions as option (option.value)}
						<button
							type="button"
							onclick={() => {
								onAudienceFilterChange?.(option.value);
								clearSelectedEvent();
							}}
							class={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
								audienceFilter === option.value
									? 'bg-blue-600 text-white shadow-sm'
									: 'bg-slate-50 text-slate-600 border border-slate-100 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-blue-950'
							}`}
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Price Filter -->
			<div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
				<p class="text-xs font-black uppercase tracking-wider text-slate-400">Price</p>
				<div class="mt-2.5 flex flex-wrap gap-1.5">
					{#each priceFilterOptions as option (option.value)}
						<button
							type="button"
							onclick={() => {
								onPriceFilterChange?.(option.value);
								clearSelectedEvent();
							}}
							class={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
								priceFilter === option.value
									? 'bg-blue-600 text-white shadow-sm'
									: 'bg-slate-50 text-slate-600 border border-slate-100 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-blue-950'
							}`}
						>
							{option.label}
						</button>
					{/each}
				</div>

				{#if priceFilter === 'paid'}
					<label class="mt-3 block">
						<div class="mb-1 flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
							<span>Max price</span>
							<span>€{maxPrice}</span>
						</div>
						<input
							type="range"
							min="1"
							max={highestPrice}
							value={maxPrice}
							oninput={(event) => {
								onMaxPriceChange?.(Number(event.currentTarget.value));
								clearSelectedEvent();
							}}
							class="w-full accent-blue-600"
						/>
					</label>
				{/if}
			</div>

			<!-- Sports Filter -->
			<div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
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

				{#if activeFilterCount > 0}
					<span class="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-black text-white">
						{activeFilterCount}
					</span>
				{/if}
			</button>

			{#if activeFilterCount > 0}
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
			<div class="mt-5 grid gap-4 border-t border-slate-200 pt-4 dark:border-slate-700 lg:grid-cols-3">
				<div>
					<p class="text-sm font-black text-slate-950 dark:text-slate-50">Date</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
						Default keeps Explore light.
					</p>
					<div class="mt-3 flex flex-wrap gap-2">
						{#each dateFilterOptions as option (option.value)}
							<button
								type="button"
								onclick={() => {
									onDateFilterChange?.(option.value);
									clearSelectedEvent();
								}}
								class={`rounded-full px-4 py-2 text-sm font-bold transition ${
									dateFilter === option.value
										? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
										: 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-blue-950'
								}`}
							>
								{option.label}
							</button>
						{/each}
					</div>
				</div>

				<div>
					<p class="text-sm font-black text-slate-950 dark:text-slate-50">Audience</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
						Choose whose events appear.
					</p>
					<div class="mt-3 flex flex-wrap gap-2">
						{#each audienceFilterOptions as option (option.value)}
							<button
								type="button"
								onclick={() => {
									onAudienceFilterChange?.(option.value);
									clearSelectedEvent();
								}}
								class={`rounded-full px-4 py-2 text-sm font-bold transition ${
									audienceFilter === option.value
										? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
										: 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-blue-950'
								}`}
							>
								{option.label}
							</button>
						{/each}
					</div>
				</div>

				<div>
					<p class="text-sm font-black text-slate-950 dark:text-slate-50">Price</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
						Filter by entry cost.
					</p>
					<div class="mt-3 flex flex-wrap gap-2">
						{#each priceFilterOptions as option (option.value)}
							<button
								type="button"
								onclick={() => {
									onPriceFilterChange?.(option.value);
									clearSelectedEvent();
								}}
								class={`rounded-full px-4 py-2 text-sm font-bold transition ${
									priceFilter === option.value
										? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
										: 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-blue-950'
								}`}
							>
								{option.label}
							</button>
						{/each}
					</div>

					{#if priceFilter === 'paid'}
						<label class="mt-3 block">
							<div class="mb-1 flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
								<span>Max price</span>
								<span>€{maxPrice}</span>
							</div>
							<input
								type="range"
								min="1"
								max={highestPrice}
								value={maxPrice}
								oninput={(event) => {
									onMaxPriceChange?.(Number(event.currentTarget.value));
									clearSelectedEvent();
								}}
								class="w-full accent-blue-600"
							/>
						</label>
					{/if}
				</div>
			</div>

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
			class="absolute inset-x-3 bottom-3 z-30 max-h-[70dvh] overflow-y-auto rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-300/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none md:inset-x-auto md:bottom-auto md:left-5 md:top-5 md:w-[24rem] md:rounded-[1.75rem] md:p-4"
		>
			<div class="flex items-center justify-between gap-3">
				<span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-blue-600 dark:bg-blue-950/70 dark:text-blue-300">
					{selectedEvent.sport}
				</span>
				<button
					type="button"
					onclick={clearSelectedEvent}
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
					aria-label="Close event preview"
				>
					×
				</button>
			</div>

			<div class="mt-3 flex gap-3">
				<div class="h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
					{#if getSelectedPreviewUrl(selectedEvent)}
						<img src={getSelectedPreviewUrl(selectedEvent)} alt={selectedEvent.title} class="h-full w-full object-cover" />
					{:else}
						<div class="grid h-full w-full place-items-center text-3xl font-black text-blue-600 dark:text-blue-300">
							{selectedEvent.title.charAt(0).toUpperCase()}
						</div>
					{/if}
				</div>

				<div class="min-w-0 flex-1">
					<h2 class="line-clamp-2 text-lg font-black leading-tight text-slate-950 dark:text-slate-50">
						{selectedEvent.title}
					</h2>
					<p class="mt-1 truncate text-sm font-bold text-slate-500 dark:text-slate-400">
						📍 {selectedEvent.location?.name ?? 'Location not set'}
					</p>
					<p class="mt-1 truncate text-xs font-semibold text-slate-400 dark:text-slate-500">
						{formatSelectedDate(selectedEvent)}
					</p>

					<div class="mt-3 flex flex-wrap gap-1.5">
						<span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
							{selectedEvent.level ?? 'casual'}
						</span>
						<span class="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-600 dark:bg-blue-950/70 dark:text-blue-300">
							{selectedEvent.participantIds.length}/{selectedEvent.maxParticipants} players
						</span>
					</div>
				</div>
			</div>

			<div class="mt-3 flex items-center justify-between gap-3">
				<p class="truncate text-sm font-black text-slate-700 dark:text-slate-200">
					{formatSelectedPrice(selectedEvent)}
				</p>

				<a
					href={getEventHref(selectedEvent)}
					class="shrink-0 rounded-2xl bg-blue-600 px-4 py-2.5 text-center text-sm font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
				>
					View event
				</a>
			</div>
		</aside>
	{/if}
</section>
