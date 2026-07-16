<script lang="ts">
	import { onMount, mount, unmount } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	import MapboxWorker from 'mapbox-gl/dist/mapbox-gl-csp-worker?worker';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import type { Sport, SportEvent, SportLevel, UserProfile } from '$lib/schema';
	import { themeState } from '$lib/theme.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import { isPromotionActive, getEventStartAtMillis } from '$lib/services/event.service';
	import { getCurrencySymbol } from '$lib/utils/format.utils';
	import { i18n } from '$lib/services/i18n.svelte';

	let {
		events,
		totalEventsCount = 0,
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
		searchTerm = '',
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
		onSearchChange,
		onClearFilters,
		onFilteredCountChange,
		onSelectedEventChange,
		getEventHref = (event: SportEvent) => `/events/${event.id}`,
		profile = null,
		viewMode = 'map'
	} = $props<{
		events: SportEvent[];
		totalEventsCount?: number;
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
		searchTerm?: string;
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
		onSearchChange?: (value: string) => void;
		onClearFilters?: () => void;
		onFilteredCountChange?: (count: number) => void;
		onSelectedEventChange?: (eventId: string | null) => void;
		getEventHref?: (event: SportEvent) => string;
		profile?: UserProfile | null;
		viewMode?: 'map' | 'feed';
	}>();

	let mapContainer: HTMLDivElement;
	let map = $state<mapboxgl.Map | null>(null);
	let mapReady = $state(false);
	import { getUserProfile } from '$lib/services/user.service';
	import Marker from './Marker.svelte';
	import Supercluster from 'supercluster';

	let selectedEvent = $state<SportEvent | null>(null);
	let selectedEventGroup = $state<SportEvent[]>([]);
	let selectedEventIndex = $state(0);
	let localSearchTerm = $state('');
	let markers: mapboxgl.Marker[] = [];
	let svelteMarkers: any[] = [];
	let showFilters = $state(false);

	// Feed rails & scoring
	let featuredFeedRail = $state<HTMLDivElement | null>(null);
	let friendsFeedRail = $state<HTMLDivElement | null>(null);
	let generalFeedRail = $state<HTMLDivElement | null>(null);

	let feedEvents = $derived.by(() => {
		const sorted = [...events].sort((a, b) => {
			let scoreA = 0;
			let scoreB = 0;

			// 1. Preferred sport match (+100)
			if (profile?.sports?.includes(a.sport)) scoreA += 100;
			if (profile?.sports?.includes(b.sport)) scoreB += 100;

			// 2. City match (+50)
			if (profile?.city) {
				const userCity = profile.city.trim().toLowerCase();
				const locA = (a.location?.name ?? '').toLowerCase() + ' ' + (a.location?.address ?? '').toLowerCase();
				const locB = (b.location?.name ?? '').toLowerCase() + ' ' + (b.location?.address ?? '').toLowerCase();
				if (locA.includes(userCity)) scoreA += 50;
				if (locB.includes(userCity)) scoreB += 50;
			}

			// 3. Friend creator (+40) or friend participants (+15 per friend)
			if (friendIds.includes(a.creatorId)) scoreA += 40;
			if (friendIds.includes(b.creatorId)) scoreB += 40;

			const friendsInA = a.participantIds.filter((id: string) => friendIds.includes(id)).length;
			const friendsInB = b.participantIds.filter((id: string) => friendIds.includes(id)).length;
			scoreA += friendsInA * 15;
			scoreB += friendsInB * 15;

			// 4. Spot availability (prefer 1-3 spots left)
			const spotsA = a.maxParticipants - a.participantIds.length;
			const spotsB = b.maxParticipants - b.participantIds.length;
			if (spotsA > 0 && spotsA <= 3) scoreA += 25;
			else if (spotsA === 0) scoreA -= 20;

			if (spotsB > 0 && spotsB <= 3) scoreB += 25;
			else if (spotsB === 0) scoreB -= 20;

			// 5. Promotion (+30)
			if (isPromotionActive(a)) scoreA += 30;
			if (isPromotionActive(b)) scoreB += 30;

			// 6. Chronological priority
			const startA = getEventStartAtMillis(a);
			const startB = getEventStartAtMillis(b);
			const daysA = (startA - Date.now()) / (1000 * 60 * 60 * 24);
			const daysB = (startB - Date.now()) / (1000 * 60 * 60 * 24);
			if (daysA > 0) scoreA += Math.max(0, 30 - daysA * 2);
			if (daysB > 0) scoreB += Math.max(0, 30 - daysB * 2);

			return scoreB - scoreA;
		});

		return sorted;
	});

	let feedFeaturedEvents = $derived.by(() => {
		return feedEvents.filter(e => isPromotionActive(e));
	});

	let feedFriendsEvents = $derived.by(() => {
		const featuredIds = new Set(feedFeaturedEvents.map(e => e.id));
		return feedEvents.filter(e => 
			!featuredIds.has(e.id) && 
			(friendIds.includes(e.creatorId) || e.participantIds.some((id: string) => friendIds.includes(id)))
		);
	});

	let feedGeneralEvents = $derived.by(() => {
		const featuredIds = new Set(feedFeaturedEvents.map(e => e.id));
		const friendEventIds = new Set(feedFriendsEvents.map(e => e.id));
		return feedEvents.filter(e => !featuredIds.has(e.id) && !friendEventIds.has(e.id));
	});

	let shownFeedCount = $derived(
		feedFeaturedEvents.length + feedFriendsEvents.length + feedGeneralEvents.length
	);
	let searchPreviewEvents = $derived(
		localSearchTerm.trim() ? events.slice(0, 6) : []
	);

	function getFeedRail(kind: 'featured' | 'friends' | 'general') {
		if (kind === 'featured') return featuredFeedRail;
		if (kind === 'friends') return friendsFeedRail;
		return generalFeedRail;
	}

	function scrollFeedRail(kind: 'featured' | 'friends' | 'general', direction: number) {
		const rail = getFeedRail(kind);
		if (!rail) return;

		rail.scrollBy({
			left: direction * Math.max(rail.clientWidth * 0.86, 260),
			behavior: 'smooth'
		});
	}

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
		localSearchTerm = searchTerm;
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
		selectedEventGroup = [];
		selectedEventIndex = 0;
		onSelectedEventChange?.(null);
	}

	function handleSearchInput(value: string) {
		localSearchTerm = value;
		onSearchChange?.(value);
		clearSelectedEvent();
	}

	function selectSearchResult(event: SportEvent) {
		showFilters = false;
		selectEvent(event, getNearbyEventGroup(event));
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
		return price > 0 ? `${getCurrencySymbol(event.currency)}${price.toFixed(2)} / person` : 'Free';
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

	function getEventPriority(event: SportEvent) {
		let score = 0;
		if (event.creatorId === currentUserId) score += 1000;
		if (friendIds.includes(event.creatorId)) score += 500;
		score += event.participantIds?.length ?? 0;
		return score;
	}

	function getEventStartTime(event: SportEvent) {
		const value = event.startAt;
		const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value as unknown as string);
		const time = date.getTime();
		return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
	}

	function sortEventGroup(group: SportEvent[]) {
		return group.slice().sort((a, b) => {
			const priorityDiff = getEventPriority(b) - getEventPriority(a);
			if (priorityDiff !== 0) return priorityDiff;
			return getEventStartTime(a) - getEventStartTime(b);
		});
	}

	function getDistanceMeters(
		a: { lat: number; lng: number },
		b: { lat: number; lng: number }
	) {
		const earthRadius = 6371000;
		const toRadians = (value: number) => (value * Math.PI) / 180;
		const dLat = toRadians(b.lat - a.lat);
		const dLng = toRadians(b.lng - a.lng);
		const lat1 = toRadians(a.lat);
		const lat2 = toRadians(b.lat);
		const h =
			Math.sin(dLat / 2) ** 2 +
			Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
		return 2 * earthRadius * Math.asin(Math.sqrt(h));
	}

	function getNearbyEventGroup(event: SportEvent) {
		const coords = getCoords(event);
		if (!coords) return [event];

		return sortEventGroup(
			events.filter((candidate: SportEvent) => {
				const candidateCoords = getCoords(candidate);
				if (!candidateCoords) return false;
				return getDistanceMeters(coords, candidateCoords) <= 45;
			})
		);
	}

	function selectEvent(event: SportEvent, group: SportEvent[] = [event], shouldFly = true) {
		const sortedGroup = sortEventGroup(group.length ? group : [event]);
		const eventIndex = Math.max(
			0,
			sortedGroup.findIndex((groupEvent) => groupEvent.id === event.id)
		);

		selectedEventGroup = sortedGroup;
		selectedEventIndex = eventIndex;
		selectedEvent = sortedGroup[eventIndex] ?? event;
		onSelectedEventChange?.(selectedEvent.id);
		queueMicrotask(() => renderMarkers());

		const coords = getCoords(selectedEvent);
		if (!shouldFly || !map || !coords) return;

		map.flyTo({
			center: [coords.lng, coords.lat],
			zoom: 14,
			speed: 1.2,
			curve: 1.4,
			essential: true
		});
	}

	function selectEventInGroup(index: number) {
		if (selectedEventGroup.length === 0) return;
		const nextIndex = (index + selectedEventGroup.length) % selectedEventGroup.length;
		const nextEvent = selectedEventGroup[nextIndex];
		selectedEventIndex = nextIndex;
		selectedEvent = nextEvent;
		onSelectedEventChange?.(nextEvent.id);
		queueMicrotask(() => renderMarkers());

		const coords = getCoords(nextEvent);
		if (!map || !coords) return;
		map.easeTo({
			center: [coords.lng, coords.lat],
			duration: 450
		});
	}

	function moveSelectedEvent(direction: number) {
		selectEventInGroup(selectedEventIndex + direction);
	}

	function getMarkerColor(event: SportEvent) {
		if (selectedEvent?.id === event.id) {
			return '#00f2ff';
		}
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
			const allCoords: { lat: number; lng: number }[] = events
				.map((event: SportEvent) => getCoords(event))
				.filter((coords: { lat: number; lng: number } | null): coords is { lat: number; lng: number } => Boolean(coords));
			const mapCenter = currentMap.getCenter();
			const nearbyCoords = allCoords.filter((coords: { lat: number; lng: number }) => {
				return getDistanceMeters(
					{ lat: mapCenter.lat, lng: mapCenter.lng },
					coords
				) <= 90000;
			});
			const coordsToFit = nearbyCoords.length ? nearbyCoords : allCoords;

			for (const coords of coordsToFit) {
				bounds.extend([coords.lng, coords.lat]);
			}

			if (coordsToFit.length) {
				hasFitBoundsForCurrentEvents = true;
				currentMap.fitBounds(bounds, {
					padding: 80,
					maxZoom: 12
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
				const clusterEvents = sortEventGroup(
					leaves.map((leaf: any) => leaf.properties.event as SportEvent)
				);
				const selectedClusterEvent = selectedEvent
					? clusterEvents.find((event) => event.id === selectedEvent?.id)
					: null;
				const priorityEvent = selectedClusterEvent ?? clusterEvents[0];
				const creator = creatorProfiles[priorityEvent.creatorId];
				const photoURL = priorityEvent.groupPhotoURL || priorityEvent.organizationLogoURL || creator?.photoURL || '';

				const el = document.createElement('div');
				el.className = 'custom-marker custom-cluster-marker';
				el.style.cursor = 'pointer';
				el.style.zIndex = selectedClusterEvent ? '60' : '10';

				const markerComponent = mount(Marker, {
					target: el,
					props: {
						profile_url: photoURL,
						name_letter: (creator?.displayName || 'U').charAt(0).toUpperCase(),
						sport: priorityEvent.sport,
						n_confirmed_attendees: priorityEvent.participantIds?.length || 0,
						max_occupancy: priorityEvent.maxParticipants || 0,
						marker_color: getMarkerColor(priorityEvent),
						marker_scale: selectedClusterEvent ? 0.78 : 0.6,
						cluster_count: count - 1
					}
				});
				svelteMarkers.push(markerComponent);

				el.addEventListener('click', () => {
					selectEvent(priorityEvent, clusterEvents, false);
					try {
						const expansionZoom = clusterIndex.getClusterExpansionZoom(clusterId);
						const currentZoom = currentMap.getZoom();
						currentMap.flyTo({
							center: [lng, lat],
							zoom: Math.max(
								currentZoom,
								Math.min(Math.max(expansionZoom, currentZoom + 1), 16)
							),
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
				const isSelectedMarker = selectedEvent?.id === event.id;

				const el = document.createElement('div');
				el.className = 'custom-marker';
				el.style.cursor = 'pointer';
				el.style.zIndex = isSelectedMarker ? '60' : '10';

				const markerComponent = mount(Marker, {
					target: el,
					props: {
						profile_url: photoURL,
						name_letter: (creator?.displayName || 'U').charAt(0).toUpperCase(),
						sport: event.sport,
						n_confirmed_attendees: event.participantIds?.length || 0,
						max_occupancy: event.maxParticipants || 0,
						marker_color: getMarkerColor(event),
						marker_scale: isSelectedMarker ? 0.78 : 0.6
					}
				});
				svelteMarkers.push(markerComponent);

				el.addEventListener('click', () => {
					selectEvent(event, getNearbyEventGroup(event));
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
	class="relative flex flex-col overflow-visible rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 md:min-h-0 md:flex-1 md:overflow-hidden"
>
	<div
		bind:this={mapContainer}
		class="h-[48dvh] min-h-[360px] w-full flex-none md:h-[calc(100vh-240px)] md:min-h-[620px]"
		class:hidden={viewMode !== 'map'}
	></div>

	{#if viewMode === 'map'}
		<div
			class="absolute right-2 bottom-2 z-10 flex flex-row flex-wrap items-center gap-3 rounded-xl bg-white/95 p-2 shadow-md backdrop-blur dark:bg-slate-900/95 text-xs md:right-4 md:bottom-4 md:flex-col md:items-start md:gap-2 md:rounded-2xl md:p-4 md:shadow-lg md:text-sm"
		>
			{#if currentUserId}
				<div class="flex items-center gap-1.5">
					<span class="h-2.5 w-2.5 rounded-full bg-[#00B4D8]"></span>
					<span>{i18n.t('my_events')}</span>
				</div>
			{/if}

			<div class="flex items-center gap-1.5">
				<span class="h-2.5 w-2.5 rounded-full bg-red-600"></span>
				<span>{i18n.t('public_events')}</span>
			</div>

			{#if currentUserId}
				<div class="flex items-center gap-1.5">
					<span class="h-2.5 w-2.5 rounded-full bg-yellow-600"></span>
					<span>{i18n.t('friends_events')}</span>
				</div>
			{/if}
		</div>

		<!-- Floating Filters Button (Mobile Only) -->
		<div class="absolute left-4 top-4 z-10 md:hidden flex items-center gap-2">
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

			<span class="rounded-full bg-white/95 px-3 py-2 text-xs font-black text-slate-700 shadow-md backdrop-blur border border-slate-200/60 dark:bg-slate-900/95 dark:text-slate-200 dark:border-slate-800">
				Showing {events.length} of {totalEventsCount}
			</span>
		</div>
	{/if}

	<!-- Floating Filters Modal Card (Mobile Only) -->
	{#if showFilters}
		<div
			class="absolute inset-x-4 top-16 z-30 max-h-[70%] overflow-y-auto rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:hidden"
		>
			<div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
				<h3 class="text-base font-black text-slate-950 dark:text-slate-50">{i18n.t('filters_label')}</h3>
				<div class="flex items-center gap-3">
					{#if activeFilterCount > 0}
						<button
							type="button"
							onclick={clearAllFilters}
							class="text-xs font-bold text-red-500 hover:text-red-600 transition"
						>
							{i18n.t('clear_all_filters')}
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

			<div class="mt-4">
				<label class="sr-only" for="mobile-explore-search">Search events</label>
				<div class="flex items-center gap-3 rounded-2xl bg-slate-100/90 px-3.5 py-2.5 shadow-inner shadow-white/70 backdrop-blur dark:bg-slate-800/80 dark:shadow-none">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
					>
						<circle cx="11" cy="11" r="7" />
						<path d="m20 20-3.5-3.5" />
					</svg>
					<input
						id="mobile-explore-search"
						type="search"
						value={localSearchTerm}
						placeholder={i18n.t('search_events_placeholder')}
						oninput={(event) => handleSearchInput((event.currentTarget as HTMLInputElement).value)}
						class="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm font-black text-slate-900 outline-none ring-0 shadow-none placeholder:font-bold placeholder:text-slate-400 focus:border-0 focus:outline-none focus:ring-0 dark:text-slate-100"
					/>
				</div>

				{#if localSearchTerm.trim()}
					<div class="mt-3 space-y-2">
						{#if searchPreviewEvents.length}
							{#each searchPreviewEvents as event (event.id)}
								<button
									type="button"
									onclick={() => selectSearchResult(event)}
									class="flex w-full items-center gap-2.5 rounded-2xl border border-slate-100 bg-white p-2 text-left shadow-sm transition active:scale-[0.99] dark:border-slate-800 dark:bg-slate-900"
								>
									<div class="h-10 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
										{#if getSelectedPreviewUrl(event)}
											<img src={getSelectedPreviewUrl(event)} alt={event.title} class="h-full w-full object-cover" />
										{:else}
											<div class="grid h-full w-full place-items-center text-sm font-black uppercase text-blue-600 dark:text-blue-300">
												{event.sport.charAt(0)}
											</div>
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-black text-slate-950 dark:text-slate-50">
											{event.title}
										</p>
										<p class="truncate text-xs font-bold text-slate-500 dark:text-slate-400">
											{event.location?.address ?? event.location?.name ?? 'Location not set'}
										</p>
									</div>
									<span class="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">
										{formatSelectedDate(event)}
									</span>
								</button>
							{/each}
						{:else}
							<p class="rounded-2xl border border-dashed border-slate-200 p-3 text-sm font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400">
								{i18n.t('no_events_found_search')}
							</p>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Date Filter -->
			<div class="mt-4">
				<p class="text-xs font-black uppercase tracking-wider text-slate-400">{i18n.t('date')}</p>
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
				<p class="text-xs font-black uppercase tracking-wider text-slate-400">{i18n.t('event_type_label')}</p>
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
				<p class="text-xs font-black uppercase tracking-wider text-slate-400">{i18n.t('price')}</p>
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
							<span>{i18n.t('max_price')}</span>
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
					<p class="text-xs font-black uppercase tracking-wider text-slate-400">{i18n.t('sport_label')}</p>
				</div>

				{#if availableSports.length === 0}
					<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">{i18n.t('no_sports_available')}</p>
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
								{i18n.t('sport_' + sport.toLowerCase())}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Levels Filter -->
			<div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
				<div>
					<p class="text-xs font-black uppercase tracking-wider text-slate-400">{i18n.t('level_label')}</p>
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
			<div class="flex items-center gap-4">
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

					<span>{i18n.t('filters_label')}</span>

					{#if activeFilterCount > 0}
						<span class="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-black text-white">
							{activeFilterCount}
						</span>
					{/if}
				</button>

				<span class="text-xs font-black uppercase tracking-wider text-slate-400">
					{i18n.t('showing_events', { count: viewMode === 'map' ? events.length : shownFeedCount, total: totalEventsCount })}
				</span>
			</div>

			{#if activeFilterCount > 0}
				<button
					type="button"
					onclick={clearAllFilters}
					class="text-sm font-bold text-slate-500 transition hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
				>
					{i18n.t('clear')}
				</button>
			{/if}
		</div>

		{#if showFilters}
			<div class="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
				<label class="sr-only" for="desktop-explore-search">Search events</label>
				<div class="flex max-w-xl items-center gap-3 rounded-2xl bg-slate-100/90 px-4 py-2.5 shadow-inner shadow-white/70 backdrop-blur dark:bg-slate-800/80 dark:shadow-none">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-5 w-5 shrink-0 text-slate-400 dark:text-slate-500"
					>
						<circle cx="11" cy="11" r="7" />
						<path d="m20 20-3.5-3.5" />
					</svg>
					<input
						id="desktop-explore-search"
						type="search"
						value={localSearchTerm}
						placeholder={i18n.t('search_events_orgs_placeholder')}
						oninput={(event) => handleSearchInput((event.currentTarget as HTMLInputElement).value)}
						class="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm font-black text-slate-900 outline-none ring-0 shadow-none placeholder:text-sm placeholder:font-bold placeholder:text-slate-400 focus:border-0 focus:outline-none focus:ring-0 dark:text-slate-100"
					/>
				</div>

				{#if localSearchTerm.trim()}
					<div class="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
						{#if searchPreviewEvents.length}
							{#each searchPreviewEvents as event (event.id)}
								<button
									type="button"
									onclick={() => selectSearchResult(event)}
									class="flex min-w-0 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-2 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/60 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-900 dark:hover:bg-blue-950/30"
								>
									<div class="h-12 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
										{#if getSelectedPreviewUrl(event)}
											<img src={getSelectedPreviewUrl(event)} alt={event.title} class="h-full w-full object-cover" />
										{:else}
											<div class="grid h-full w-full place-items-center text-sm font-black uppercase text-blue-600 dark:text-blue-300">
												{event.sport.charAt(0)}
											</div>
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-black text-slate-950 dark:text-slate-50">
											{event.title}
										</p>
										<p class="truncate text-xs font-bold text-slate-500 dark:text-slate-400">
											{event.location?.address ?? event.location?.name ?? 'Location not set'}
										</p>
										<p class="mt-0.5 truncate text-[11px] font-bold text-slate-400 dark:text-slate-500">
											{formatSelectedDate(event)}
										</p>
									</div>
								</button>
							{/each}
						{:else}
							<p class="rounded-2xl border border-dashed border-slate-200 p-4 text-sm font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400">
								{i18n.t('no_events_found_search')}
							</p>
						{/if}
					</div>
				{/if}
			</div>

			<div class="mt-5 grid gap-4 border-t border-slate-200 pt-4 dark:border-slate-700 lg:grid-cols-3">
				<div>
					<p class="text-sm font-black text-slate-950 dark:text-slate-50">{i18n.t('date')}</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
						{i18n.t('date_filter_sub')}
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
					<p class="text-sm font-black text-slate-950 dark:text-slate-50">{i18n.t('event_type_label')}</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
						{i18n.t('type_filter_sub')}
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
					<p class="text-sm font-black text-slate-950 dark:text-slate-50">{i18n.t('price')}</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
						{i18n.t('price_filter_sub')}
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
								<span>{i18n.t('max_price')}</span>
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
					<p class="text-sm font-black text-slate-950 dark:text-slate-50">{i18n.t('sports')}</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
						{i18n.t('choose_map_sports_msg')}
					</p>
				</div>

				{#if availableSports.length === 0}
					<p class="mt-4 text-sm text-slate-500 dark:text-slate-400">{i18n.t('no_sports_available')}</p>
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
								{i18n.t('sport_' + sport.toLowerCase())}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<div class="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
				<p class="text-sm font-black text-slate-950 dark:text-slate-50">{i18n.t('level_label')}</p>
				<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
					{i18n.t('level_filter_sub')}
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

	{#if viewMode === 'map' && selectedEvent}
		<aside
			class="relative z-20 mx-3 mb-3 mt-3 max-h-none overflow-visible rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xl shadow-slate-300/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none md:absolute md:inset-x-auto md:bottom-auto md:left-5 md:top-5 md:m-0 md:max-h-[70dvh] md:w-[24rem] md:overflow-y-auto md:rounded-[1.75rem] md:p-4 md:shadow-2xl md:shadow-slate-300/70"
		>
			<div class="flex items-center justify-between gap-3">
				<div class="flex min-w-0 flex-wrap items-center gap-2">
					<span class="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-blue-600 dark:bg-blue-950/70 dark:text-blue-300 md:px-3 md:py-1 md:text-xs">
						{selectedEvent.sport}
					</span>
					{#if selectedEventGroup.length > 1}
						<span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300 md:px-3 md:py-1 md:text-xs">
							{selectedEventIndex + 1}/{selectedEventGroup.length} nearby
						</span>
					{/if}
				</div>
				<button
					type="button"
					onclick={clearSelectedEvent}
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-black text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 md:h-8 md:w-8 md:text-xl"
					aria-label="Close event preview"
				>
					×
				</button>
			</div>

			<div class="mt-2.5 flex gap-2.5 md:mt-3 md:gap-3">
				<div class="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800 md:h-28 md:w-28">
					{#if getSelectedPreviewUrl(selectedEvent)}
						<img src={getSelectedPreviewUrl(selectedEvent)} alt={selectedEvent.title} class="h-full w-full object-cover" />
					{:else}
						<div class="grid h-full w-full place-items-center text-3xl font-black text-blue-600 dark:text-blue-300">
							{selectedEvent.title.charAt(0).toUpperCase()}
						</div>
					{/if}
				</div>

				<div class="min-w-0 flex-1">
					<h2 class="line-clamp-2 text-base font-black leading-tight text-slate-950 dark:text-slate-50 md:text-lg">
						{selectedEvent.title}
					</h2>
					<p class="mt-0.5 truncate text-xs font-bold text-slate-500 dark:text-slate-400 md:mt-1 md:text-sm">
						📍 {selectedEvent.location?.address ?? selectedEvent.location?.name ?? 'Location not set'}
					</p>
					<p class="mt-1 truncate text-xs font-semibold text-slate-400 dark:text-slate-500">
						{formatSelectedDate(selectedEvent)}
					</p>

					<div class="mt-2 flex flex-wrap gap-1.5 md:mt-3">
						<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300 md:px-2.5 md:py-1 md:text-[11px]">
							{selectedEvent.level ?? 'casual'}
						</span>
						<span class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-600 dark:bg-blue-950/70 dark:text-blue-300 md:px-2.5 md:py-1 md:text-[11px]">
							{selectedEvent.participantIds.length}/{selectedEvent.maxParticipants} {i18n.t('players_lowercase')}
						</span>
					</div>
				</div>
			</div>

			{#if selectedEventGroup.length > 1}
				<div class="mt-2.5 flex items-center justify-between rounded-2xl bg-slate-50 px-2.5 py-1.5 dark:bg-slate-950/60 md:mt-3 md:px-3 md:py-2">
					<div class="min-w-0">
						<p class="text-xs font-black text-slate-700 dark:text-slate-200">
							{i18n.t('events_in_area', { count: selectedEventGroup.length })}
						</p>
						<p class="hidden truncate text-[11px] font-bold text-slate-400 dark:text-slate-500 sm:block">
							{i18n.t('use_arrows_preview_msg')}
						</p>
					</div>
					<div class="ml-3 flex shrink-0 items-center gap-2">
						<button
							type="button"
							onclick={() => moveSelectedEvent(-1)}
							class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-base font-black text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-blue-950 md:h-8 md:w-8 md:text-lg"
							aria-label="Previous nearby event"
						>
							‹
						</button>

						<span class="min-w-10 text-center text-xs font-black text-slate-500 dark:text-slate-300">
							{selectedEventIndex + 1}/{selectedEventGroup.length}
						</span>

						<button
							type="button"
							onclick={() => moveSelectedEvent(1)}
							class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-base font-black text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-blue-950 md:h-8 md:w-8 md:text-lg"
							aria-label="Next nearby event"
						>
							›
						</button>
					</div>
				</div>
			{/if}

			<div class="mt-2.5 flex items-center justify-between gap-3 md:mt-3">
				<p class="truncate text-xs font-black text-slate-700 dark:text-slate-200 md:text-sm">
					{formatSelectedPrice(selectedEvent)}
				</p>

				<a
					href={getEventHref(selectedEvent)}
					class="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-center text-xs font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 md:rounded-2xl md:px-4 md:py-2.5 md:text-sm"
				>
					{i18n.t('view_event')}
				</a>
			</div>
		</aside>
	{/if}

	{#if viewMode === 'feed'}
		<!-- Feed list wrapper -->
		<div class="flex-1 overflow-y-auto px-4 py-6 md:px-8">
			<!-- Mobile Filters button inside feed -->
			<div class="mb-6 flex items-center justify-between gap-3 md:hidden">
				<button
					type="button"
					onclick={() => (showFilters = !showFilters)}
					class="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 shadow-sm border border-slate-200/60 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 transition-all active:scale-95 hover:bg-slate-250 dark:hover:bg-slate-750"
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

			{#if shownFeedCount === 0}
				<div class="flex flex-col items-center justify-center py-20 text-center">
					<div class="rounded-full bg-slate-100 p-4 dark:bg-slate-800 text-3xl mb-4">
						🔍
					</div>
					<h3 class="text-lg font-black text-slate-950 dark:text-slate-50">{i18n.t('no_events_found')}</h3>
					<p class="mt-1 text-sm text-slate-500 max-w-sm dark:text-slate-400">
						{i18n.t('no_events_found_sub')}
					</p>
					{#if activeFilterCount > 0}
						<button
							type="button"
							onclick={clearAllFilters}
							class="mt-4 rounded-full bg-blue-50 px-4 py-2 text-xs font-black text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
						>
							{i18n.t('clear_all_filters')}
						</button>
					{/if}
				</div>
			{:else}
				<div class="mb-6">
					<p class="text-xs font-black uppercase tracking-wider text-slate-400">
						{i18n.t('showing_events', { count: shownFeedCount, total: totalEventsCount })}
					</p>
				</div>

				<div class="space-y-10 pb-16">
					<!-- 1. Featured Section -->
					{#if feedFeaturedEvents.length > 0}
						<section>
							<div class="mb-4 flex items-end justify-between gap-3">
								<div>
									<h3 class="flex items-center gap-2 text-base font-black text-slate-900 dark:text-slate-100">
										<span class="text-slate-400">★</span> {i18n.t('featured_games')}
									</h3>
									<p class="text-xs text-slate-500 dark:text-slate-400">
										{i18n.t('promoted_matching_pref')}
									</p>
								</div>
								{#if feedFeaturedEvents.length > 2}
									<div class="flex shrink-0 items-center gap-2">
										<button
											type="button"
											onclick={() => scrollFeedRail('featured', -1)}
											class="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-950 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-white dark:ring-slate-800 dark:hover:bg-slate-800"
											aria-label="Previous featured events"
										>
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
												<path d="m15 18-6-6 6-6" />
											</svg>
										</button>
										<button
											type="button"
											onclick={() => scrollFeedRail('featured', 1)}
											class="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-950 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-white dark:ring-slate-800 dark:hover:bg-slate-800"
											aria-label="Next featured events"
										>
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
												<path d="m9 18 6-6-6-6" />
											</svg>
										</button>
									</div>
								{/if}
							</div>
							<div
								bind:this={featuredFeedRail}
								class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-2 md:mx-0 md:px-0"
							>
								{#each feedFeaturedEvents as event (event.id)}
									<div class="w-[calc(50%-0.375rem)] shrink-0 snap-start sm:w-[calc(50%-0.375rem)] md:w-[31%] lg:w-[23%] xl:w-[18.5%]">
										<EventCard {event} variant="vertical" />
									</div>
								{/each}
							</div>
						</section>
					{/if}

					<!-- 2. Friends Section -->
					{#if feedFriendsEvents.length > 0}
						<section>
							<div class="mb-4 flex items-end justify-between gap-3">
								<div>
									<h3 class="flex items-center gap-2 text-base font-black text-slate-900 dark:text-slate-100">
										<span class="text-slate-400">◎</span> {i18n.t('friends_activity')}
									</h3>
									<p class="text-xs text-slate-500 dark:text-slate-400">
										{i18n.t('friends_activity_sub')}
									</p>
								</div>
								{#if feedFriendsEvents.length > 2}
									<div class="flex shrink-0 items-center gap-2">
										<button
											type="button"
											onclick={() => scrollFeedRail('friends', -1)}
											class="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-950 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-white dark:ring-slate-800 dark:hover:bg-slate-800"
											aria-label="Previous friends events"
										>
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
												<path d="m15 18-6-6 6-6" />
											</svg>
										</button>
										<button
											type="button"
											onclick={() => scrollFeedRail('friends', 1)}
											class="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-950 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-white dark:ring-slate-800 dark:hover:bg-slate-800"
											aria-label="Next friends events"
										>
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
												<path d="m9 18 6-6-6-6" />
											</svg>
										</button>
									</div>
								{/if}
							</div>
							<div
								bind:this={friendsFeedRail}
								class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-2 md:mx-0 md:px-0"
							>
								{#each feedFriendsEvents as event (event.id)}
									<div class="w-[calc(50%-0.375rem)] shrink-0 snap-start sm:w-[calc(50%-0.375rem)] md:w-[31%] lg:w-[23%] xl:w-[18.5%]">
										<EventCard {event} variant="vertical" />
									</div>
								{/each}
							</div>
						</section>
					{/if}

					<!-- 3. General Section -->
					{#if feedGeneralEvents.length > 0}
						<section>
							<div class="mb-4 flex items-end justify-between gap-3">
								<div>
									<h3 class="flex items-center gap-2 text-base font-black text-slate-900 dark:text-slate-100">
										<span class="text-slate-400">⌕</span> {i18n.t('explore_games')}
									</h3>
									<p class="text-xs text-slate-500 dark:text-slate-400">
										{i18n.t('explore_games_sub')}
									</p>
								</div>
								{#if feedGeneralEvents.length > 2}
									<div class="flex shrink-0 items-center gap-2">
										<button
											type="button"
											onclick={() => scrollFeedRail('general', -1)}
											class="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-950 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-white dark:ring-slate-800 dark:hover:bg-slate-800"
											aria-label="Previous explore events"
										>
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
												<path d="m15 18-6-6 6-6" />
											</svg>
										</button>
										<button
											type="button"
											onclick={() => scrollFeedRail('general', 1)}
											class="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-950 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-white dark:ring-slate-800 dark:hover:bg-slate-800"
											aria-label="Next explore events"
										>
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
												<path d="m9 18 6-6-6-6" />
											</svg>
										</button>
									</div>
								{/if}
							</div>
							<div
								bind:this={generalFeedRail}
								class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-2 md:mx-0 md:px-0"
							>
								{#each feedGeneralEvents as event (event.id)}
									<div class="w-[calc(50%-0.375rem)] shrink-0 snap-start sm:w-[calc(50%-0.375rem)] md:w-[31%] lg:w-[23%] xl:w-[18.5%]">
										<EventCard {event} variant="vertical" />
									</div>
								{/each}
							</div>
						</section>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</section>
