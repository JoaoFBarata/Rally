<script lang="ts">
	import { onMount, mount, unmount } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	import MapboxWorker from 'mapbox-gl/dist/mapbox-gl-csp-worker?worker';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import type { Sport, SportEvent, SportLevel, UserProfile } from '$lib/schema';
	import { themeState } from '$lib/theme.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import { isPromotionActive, getEventStartAtMillis } from '$lib/services/event.service';
	import { formatDate, getCurrencySymbol, getSportBackgroundImage } from '$lib/utils/format.utils';
	import { i18n } from '$lib/services/i18n.svelte';
	import { getEventTemporalState } from '$lib/utils/event-lifecycle.utils';

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
		temporalFilter = 'all',
		searchTerm = '',
		onlyTournaments = false,
		activeFilterCount = 0,
		dateFilterOptions = [],
		priceFilterOptions = [],
		audienceFilterOptions = [],
		temporalFilterOptions = [],
		onToggleSport,
		onToggleLevel,
		onDateFilterChange,
		onPriceFilterChange,
		onMaxPriceChange,
		onAudienceFilterChange,
		onTemporalFilterChange,
		onOnlyTournamentsChange,
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
		audienceFilter?: 'all' | 'mine' | 'friends' | 'public' | 'joined' | 'following_orgs';
		temporalFilter?: 'all' | 'live' | 'starting_soon';
		searchTerm?: string;
		onlyTournaments?: boolean;
		activeFilterCount?: number;
		dateFilterOptions?: { value: 'today' | '7' | '14' | '30' | 'all'; label: string }[];
		priceFilterOptions?: { value: 'all' | 'free' | 'paid'; label: string }[];
		audienceFilterOptions?: {
			value: 'all' | 'mine' | 'friends' | 'public' | 'joined' | 'following_orgs';
			label: string;
		}[];
		temporalFilterOptions?: { value: 'all' | 'live' | 'starting_soon'; label: string }[];
		onToggleSport?: (sport: Sport) => void;
		onToggleLevel?: (level: SportLevel) => void;
		onDateFilterChange?: (value: 'today' | '7' | '14' | '30' | 'all') => void;
		onPriceFilterChange?: (value: 'all' | 'free' | 'paid') => void;
		onMaxPriceChange?: (value: number) => void;
		onAudienceFilterChange?: (
			value: 'all' | 'mine' | 'friends' | 'public' | 'joined' | 'following_orgs'
		) => void;
		onTemporalFilterChange?: (value: 'all' | 'live' | 'starting_soon') => void;
		onOnlyTournamentsChange?: (value: boolean) => void;
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
	let satelliteMode = $state(false);
	import { getUserProfile } from '$lib/services/user.service';
	import Marker from './Marker.svelte';
	import Supercluster from 'supercluster';

	let selectedEvent = $state<SportEvent | null>(null);
	let selectedEventGroup = $state<SportEvent[]>([]);
	let selectedEventIndex = $state(0);
	let localSearchTerm = $state('');
	let markers: mapboxgl.Marker[] = [];
	let routeEndpointMarkers: mapboxgl.Marker[] = [];
	let svelteMarkers: any[] = [];
	let showFilters = $state(false);
	const routeSourceId = 'selected-event-route';
	let mapResizeFrame: number | null = null;
	let mapResizeSettleTimer: number | null = null;

	function scheduleMapResize() {
		if (typeof window === 'undefined' || viewMode !== 'map') return;

		if (mapResizeFrame !== null) window.cancelAnimationFrame(mapResizeFrame);
		if (mapResizeSettleTimer !== null) window.clearTimeout(mapResizeSettleTimer);

		// Wait until Svelte has removed `display: none` and the browser has completed layout.
		mapResizeFrame = window.requestAnimationFrame(() => {
			mapResizeFrame = window.requestAnimationFrame(() => {
				map?.resize();
				mapResizeFrame = null;
			});
		});

		// A second pass covers slower sidebar and viewport transitions.
		mapResizeSettleTimer = window.setTimeout(() => {
			map?.resize();
			mapResizeSettleTimer = null;
		}, 250);
	}

	// Feed scoring
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
				const locA =
					(a.location?.name ?? '').toLowerCase() + ' ' + (a.location?.address ?? '').toLowerCase();
				const locB =
					(b.location?.name ?? '').toLowerCase() + ' ' + (b.location?.address ?? '').toLowerCase();
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
		return feedEvents.filter((e) => isPromotionActive(e));
	});

	let feedFriendsEvents = $derived.by(() => {
		const featuredIds = new Set(feedFeaturedEvents.map((e) => e.id));
		return feedEvents.filter(
			(e) =>
				!featuredIds.has(e.id) &&
				(friendIds.includes(e.creatorId) ||
					e.participantIds.some((id: string) => friendIds.includes(id)))
		);
	});

	let feedGeneralEvents = $derived.by(() => {
		const featuredIds = new Set(feedFeaturedEvents.map((e) => e.id));
		const friendEventIds = new Set(feedFriendsEvents.map((e) => e.id));
		return feedEvents.filter((e) => !featuredIds.has(e.id) && !friendEventIds.has(e.id));
	});

	let shownFeedCount = $derived(
		feedFeaturedEvents.length + feedFriendsEvents.length + feedGeneralEvents.length
	);
	let searchPreviewEvents = $derived(localSearchTerm.trim() ? events.slice(0, 6) : []);

	let clusterIndex: any = null;
	let hasFitBoundsForCurrentEvents = false;
	let previousVisibleEventIds = '';
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

	function formatShowingEvents(count: number) {
		const replacements = { count, total: totalEventsCount };
		if (dateFilter === 'today') return i18n.t('showing_events_today', replacements);
		if (dateFilter === 'all') return i18n.t('showing_events_all_upcoming', replacements);
		return i18n.t('showing_events_next_days', { ...replacements, days: dateFilter });
	}

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

		if (selectedEvent && !events.some((event: SportEvent) => event.id === selectedEvent?.id)) {
			clearSelectedEvent();
		}
	});

	$effect(() => {
		if (events) {
			// Only reset the fit-bounds flag when the actual set of visible event
			// ids changes (a real filter/search change, or the first load) — not
			// on every `events` reference change, which also fires whenever any
			// event anywhere in the app mutates (e.g. someone else joining an
			// event) via the unfiltered realtime catalog listener. Otherwise the
			// map yanks the user's pan/zoom back to fit-bounds on totally
			// unrelated updates.
			const visibleEventIds = events
				.map((event: SportEvent) => event.id)
				.sort()
				.join(',');

			if (visibleEventIds !== previousVisibleEventIds) {
				hasFitBoundsForCurrentEvents = false;
			}
			previousVisibleEventIds = visibleEventIds;

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
		return formatDate(event.startAt);
	}

	function formatSelectedPrice(event: SportEvent) {
		const price = event.pricePerPerson ?? 0;
		return price > 0
			? `${getCurrencySymbol(event.currency)}${price.toFixed(2)}${i18n.t('per_person')}`
			: i18n.t('free');
	}

	function formatLevel(level: string | undefined | null) {
		if (!level) return i18n.t('casual');
		const translated = i18n.t(level);
		return translated === level ? level : translated;
	}

	function getSelectedPreviewUrl(event: SportEvent) {
		return event.groupPhotoURL || getSportBackgroundImage(event.sport);
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
		const date =
			typeof value?.toDate === 'function' ? value.toDate() : new Date(value as unknown as string);
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

	function getDistanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
		const earthRadius = 6371000;
		const toRadians = (value: number) => (value * Math.PI) / 180;
		const dLat = toRadians(b.lat - a.lat);
		const dLng = toRadians(b.lng - a.lng);
		const lat1 = toRadians(a.lat);
		const lat2 = toRadians(b.lat);
		const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
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
		renderSelectedRoute();
		onSelectedEventChange?.(selectedEvent.id);
		queueMicrotask(() => renderMarkers());

		const coords = getCoords(selectedEvent);
		if (!shouldFly || !map || !coords) return;
		if ((selectedEvent.route?.length ?? 0) > 1) {
			const bounds = new mapboxgl.LngLatBounds();
			selectedEvent.route!.forEach((point) => bounds.extend([point.lng, point.lat]));
			map.fitBounds(bounds, { padding: 72, maxZoom: 15, duration: 650 });
			return;
		}

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
		renderSelectedRoute();
		onSelectedEventChange?.(nextEvent.id);
		queueMicrotask(() => renderMarkers());

		const coords = getCoords(nextEvent);
		if (!map || !coords) return;
		if ((nextEvent.route?.length ?? 0) > 1) {
			const bounds = new mapboxgl.LngLatBounds();
			nextEvent.route!.forEach((point) => bounds.extend([point.lng, point.lat]));
			map.fitBounds(bounds, { padding: 72, maxZoom: 15, duration: 450 });
			return;
		}
		map.easeTo({
			center: [coords.lng, coords.lat],
			duration: 450
		});
	}

	function renderSelectedRoute() {
		if (!map || !mapReady) return;
		const route = selectedEvent?.route ?? [];
		const source = map.getSource(routeSourceId) as mapboxgl.GeoJSONSource | undefined;
		routeEndpointMarkers.forEach((marker) => marker.remove());
		routeEndpointMarkers = [];

		if (route.length < 2) {
			if (map.getLayer(`${routeSourceId}-outline`)) map.removeLayer(`${routeSourceId}-outline`);
			if (map.getLayer(`${routeSourceId}-line`)) map.removeLayer(`${routeSourceId}-line`);
			if (source) map.removeSource(routeSourceId);
			return;
		}

		const data = {
			type: 'Feature' as const,
			properties: {},
			geometry: {
				type: 'LineString' as const,
				coordinates: route.map((point) => [point.lng, point.lat])
			}
		};
		if (source) {
			source.setData(data);
		} else {
			map.addSource(routeSourceId, { type: 'geojson', data });
			map.addLayer({
				id: `${routeSourceId}-outline`,
				type: 'line',
				source: routeSourceId,
				paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.85 }
			});
			map.addLayer({
				id: `${routeSourceId}-line`,
				type: 'line',
				source: routeSourceId,
				paint: { 'line-color': '#0095ff', 'line-width': 5, 'line-opacity': 0.98 }
			});
		}

		const startElement = document.createElement('div');
		startElement.className = 'route-start-marker';
		const finishElement = document.createElement('div');
		finishElement.className = 'route-finish-marker';
		routeEndpointMarkers = [
			new mapboxgl.Marker({ element: startElement, anchor: 'center' })
				.setLngLat([route[0].lng, route[0].lat])
				.addTo(map),
			new mapboxgl.Marker({ element: finishElement, anchor: 'center' })
				.setLngLat([route.at(-1)!.lng, route.at(-1)!.lat])
				.addTo(map)
		];
	}

	function setSatelliteMode(nextSatelliteMode: boolean) {
		if (!map || satelliteMode === nextSatelliteMode) return;
		satelliteMode = nextSatelliteMode;
		map.setStyle(
			nextSatelliteMode
				? 'mapbox://styles/mapbox/standard-satellite'
				: 'mapbox://styles/mapbox/standard'
		);
		map.once('style.load', () => {
			map?.setConfig('basemap', { lightPreset: $themeState ? 'night' : 'day' });
			renderSelectedRoute();
			renderMarkers();
		});
	}

	function moveSelectedEvent(direction: number) {
		selectEventInGroup(selectedEventIndex + direction);
	}

	function getMarkerColor(event: SportEvent) {
		if (selectedEvent?.id === event.id) {
			return '#10b981'; // Green - Selected event
		}
		if (event.creatorId === currentUserId) {
			return '#00B4D8'; // Blue - My events
		}
		if (friendIds.includes(event.creatorId)) {
			return '#ca8a04'; // Yellow - Friends' events
		}
		return '#dc2626'; // Red - Public events
	}

	function getMarkerQueryBbox(currentMap: mapboxgl.Map): [number, number, number, number] | null {
		const canvas = currentMap.getCanvas();
		if (!canvas.clientWidth || !canvas.clientHeight) return null;

		const isMobile = window.matchMedia('(max-width: 767px)').matches;
		const sidePadding = isMobile ? 160 : 110;
		const topPadding = isMobile ? 150 : 95;
		const bottomPadding = isMobile ? 220 : 140;
		const northWest = currentMap.unproject([-sidePadding, -topPadding]);
		const southEast = currentMap.unproject([
			canvas.clientWidth + sidePadding,
			canvas.clientHeight + bottomPadding
		]);

		return [northWest.lng, southEast.lat, southEast.lng, northWest.lat];
	}

	function renderMarkers() {
		if (!map || !mapReady || !clusterIndex) return;
		const currentMap = map;

		if (!hasFitBoundsForCurrentEvents && events.length > 0) {
			const bounds = new mapboxgl.LngLatBounds();
			const allCoords: { lat: number; lng: number }[] = events
				.map((event: SportEvent) => getCoords(event))
				.filter(
					(coords: { lat: number; lng: number } | null): coords is { lat: number; lng: number } =>
						Boolean(coords)
				);
			const mapCenter = currentMap.getCenter();
			const nearbyCoords = allCoords.filter((coords: { lat: number; lng: number }) => {
				return getDistanceMeters({ lat: mapCenter.lat, lng: mapCenter.lng }, coords) <= 90000;
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
		const bbox = getMarkerQueryBbox(currentMap);
		if (!bbox) return;

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
				const photoURL =
					priorityEvent.groupPhotoURL ||
					priorityEvent.organizationLogoURL ||
					creator?.photoURL ||
					'';

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
						cluster_count: count - 1,
						temporal_state: getEventTemporalState(priorityEvent)
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
							zoom: Math.max(currentZoom, Math.min(Math.max(expansionZoom, currentZoom + 1), 16)),
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
				const photoURL =
					event.groupPhotoURL || event.organizationLogoURL || creator?.photoURL || '';
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
						marker_scale: isSelectedMarker ? 0.78 : 0.6,
						temporal_state: getEventTemporalState(event)
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
		});
		map.on('zoomend', renderMarkers);
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
		map.addControl(new mapboxgl.FullscreenControl(), 'top-right');
		const satelliteControl = {
			onAdd() {
				const container = document.createElement('div');
				container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
				const button = document.createElement('button');
				button.type = 'button';
				button.title = 'Alternar mapa de satélite';
				button.setAttribute('aria-label', 'Alternar mapa de satélite');
				button.innerHTML = '<span aria-hidden="true" style="font-size:15px">◉</span>';
				button.onclick = () => {
					setSatelliteMode(!satelliteMode);
					button.classList.toggle('mapboxgl-ctrl-satellite-active', satelliteMode);
				};
				container.append(button);
				return container;
			},
			onRemove() {}
		};
		map.addControl(satelliteControl as mapboxgl.IControl, 'top-right');

		map.on('load', () => {
			mapReady = true;
			scheduleMapResize();
			renderMarkers();
			renderSelectedRoute();
		});

		const resizeObserver = new ResizeObserver(() => scheduleMapResize());
		resizeObserver.observe(mapContainer);

		return () => {
			resizeObserver.disconnect();
			if (mapResizeFrame !== null) window.cancelAnimationFrame(mapResizeFrame);
			if (mapResizeSettleTimer !== null) window.clearTimeout(mapResizeSettleTimer);
			unsubscribeThemeState();
			clearMarkers();
			routeEndpointMarkers.forEach((marker) => marker.remove());
			map?.remove();
		};
	});

	$effect(() => {
		if (viewMode === 'map' && map) scheduleMapResize();
	});

	$effect(() => {
		const profiles = creatorProfiles; // Track changes
		if (mapReady) {
			renderMarkers();
		}
	});
</script>

<section
	class="relative flex min-w-0 w-full max-w-full flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 md:min-h-0 md:flex-1"
>
	<div
		bind:this={mapContainer}
		class="relative h-[60dvh] min-h-[420px] w-full flex-none md:h-[calc(100vh-240px)] md:min-h-[620px]"
		class:hidden={viewMode !== 'map'}
	>
		{#if viewMode === 'map'}
			<div
				class="absolute inset-x-3 top-3 z-20 flex items-center gap-2 md:hidden fullscreen-force-show"
			>
				<button
					type="button"
					onclick={() => (showFilters = !showFilters)}
					class="flex min-w-0 items-center gap-2 rounded-full border border-slate-200/60 bg-white/95 px-3 py-2 text-sm font-black text-slate-700 shadow-md backdrop-blur transition active:scale-95 dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-200"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400"
					>
						<path d="M3 5h18" />
						<path d="M7 12h10" />
						<path d="M10 19h4" />
					</svg>

					<span class="truncate">{i18n.t('filters_label')}</span>

					{#if activeFilterCount > 0}
						<span
							class="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-black text-white"
						>
							{activeFilterCount}
						</span>
					{/if}
				</button>
			</div>

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
		{/if}
	</div>
	{#if viewMode === 'map'}
		<div
			class="border-t border-slate-200 bg-white px-4 py-2.5 text-center text-[11px] font-black uppercase tracking-wide text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-blue-300 md:hidden"
		>
			{formatShowingEvents(events.length)}
		</div>
	{/if}
	<!-- Floating Filters Modal Card (Mobile Only) -->
	{#if showFilters}
		<div
			class="fixed inset-x-4 bottom-20 z-[9999] max-h-[65dvh] overflow-y-auto rounded-3xl border border-slate-200/50 bg-white/95 p-5 shadow-2xl backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-900/95 md:hidden fullscreen-force-block"
		>
			<div
				class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800"
			>
				<h3 class="text-base font-black text-slate-950 dark:text-slate-50">
					{i18n.t('filters_label')}
				</h3>
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
				<div
					class="flex items-center gap-3 rounded-2xl bg-slate-100/90 px-3.5 py-2.5 shadow-inner shadow-white/70 backdrop-blur dark:bg-slate-800/80 dark:shadow-none"
				>
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
									<div
										class="h-10 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800"
									>
										{#if getSelectedPreviewUrl(event)}
											<img
												src={getSelectedPreviewUrl(event)}
												alt={event.title}
												class="h-full w-full object-cover"
											/>
										{:else}
											<div
												class="grid h-full w-full place-items-center text-sm font-black uppercase text-blue-600 dark:text-blue-300"
											>
												{event.sport.charAt(0)}
											</div>
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-black text-slate-950 dark:text-slate-50">
											{event.title}
										</p>
										<p class="truncate text-xs font-bold text-slate-500 dark:text-slate-400">
											{event.location?.address ??
												event.location?.name ??
												i18n.t('location_not_set')}
										</p>
									</div>
									<span
										class="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300"
									>
										{formatSelectedDate(event)}
									</span>
								</button>
							{/each}
						{:else}
							<p
								class="rounded-2xl border border-dashed border-slate-200 p-3 text-sm font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400"
							>
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
			<div class="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
				<p class="text-xs font-black uppercase tracking-wider text-slate-400">
					{i18n.t('event_timing_filter')}
				</p>
				<div class="mt-2.5 flex flex-wrap gap-1.5">
					{#each temporalFilterOptions as option (option.value)}
						<button
							type="button"
							onclick={() => {
								onTemporalFilterChange?.(option.value);
								clearSelectedEvent();
							}}
							class={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
								temporalFilter === option.value
									? option.value === 'live'
										? 'bg-emerald-500 text-white shadow-sm'
										: option.value === 'starting_soon'
											? 'bg-amber-400 text-slate-950 shadow-sm'
											: 'bg-blue-600 text-white shadow-sm'
									: 'border border-slate-100 bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
							}`}
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Audience Filter -->
			<div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
				<p class="text-xs font-black uppercase tracking-wider text-slate-400">
					{i18n.t('event_type_label')}
				</p>
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
					<button
						type="button"
						onclick={() => {
							onOnlyTournamentsChange?.(!onlyTournaments);
							clearSelectedEvent();
						}}
						class={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
							onlyTournaments
								? 'bg-blue-600 text-white shadow-sm'
								: 'bg-slate-50 text-slate-600 border border-slate-100 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-blue-950'
						}`}
					>
						🏆 {i18n.t('only_tournaments')}
					</button>
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
						<div
							class="mb-1 flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400"
						>
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
					<p class="text-xs font-black uppercase tracking-wider text-slate-400">
						{i18n.t('sport_label')}
					</p>
				</div>

				{#if availableSports.length === 0}
					<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
						{i18n.t('no_sports_available')}
					</p>
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
					<p class="text-xs font-black uppercase tracking-wider text-slate-400">
						{i18n.t('level_label')}
					</p>
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
							{formatLevel(level)}
						</button>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Desktop Filters Bar (Web Only) -->
	<div
		class="hidden md:block border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 shrink-0"
	>
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
					{formatShowingEvents(viewMode === 'map' ? events.length : shownFeedCount)}
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
				<div
					class="flex max-w-xl items-center gap-3 rounded-2xl bg-slate-100/90 px-4 py-2.5 shadow-inner shadow-white/70 backdrop-blur dark:bg-slate-800/80 dark:shadow-none"
				>
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
									<div
										class="h-12 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800"
									>
										{#if getSelectedPreviewUrl(event)}
											<img
												src={getSelectedPreviewUrl(event)}
												alt={event.title}
												class="h-full w-full object-cover"
											/>
										{:else}
											<div
												class="grid h-full w-full place-items-center text-sm font-black uppercase text-blue-600 dark:text-blue-300"
											>
												{event.sport.charAt(0)}
											</div>
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-black text-slate-950 dark:text-slate-50">
											{event.title}
										</p>
										<p class="truncate text-xs font-bold text-slate-500 dark:text-slate-400">
											{event.location?.address ??
												event.location?.name ??
												i18n.t('location_not_set')}
										</p>
										<p
											class="mt-0.5 truncate text-[11px] font-bold text-slate-400 dark:text-slate-500"
										>
											{formatSelectedDate(event)}
										</p>
									</div>
								</button>
							{/each}
						{:else}
							<p
								class="rounded-2xl border border-dashed border-slate-200 p-4 text-sm font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400"
							>
								{i18n.t('no_events_found_search')}
							</p>
						{/if}
					</div>
				{/if}
			</div>

			<div
				class="mt-5 grid gap-4 border-t border-slate-200 pt-4 dark:border-slate-700 lg:grid-cols-4"
			>
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
					<p class="text-sm font-black text-slate-950 dark:text-slate-50">
						{i18n.t('event_timing_filter')}
					</p>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
						{i18n.t('event_timing_filter_sub')}
					</p>
					<div class="mt-3 flex flex-wrap gap-2">
						{#each temporalFilterOptions as option (option.value)}
							<button
								type="button"
								onclick={() => {
									onTemporalFilterChange?.(option.value);
									clearSelectedEvent();
								}}
								class={`rounded-full px-4 py-2 text-sm font-bold transition ${
									temporalFilter === option.value
										? option.value === 'live'
											? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/25'
											: option.value === 'starting_soon'
												? 'bg-amber-400 text-slate-950 shadow-sm shadow-amber-400/25'
												: 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
										: 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'
								}`}
							>
								{option.label}
							</button>
						{/each}
					</div>
				</div>

				<div>
					<p class="text-sm font-black text-slate-950 dark:text-slate-50">
						{i18n.t('event_type_label')}
					</p>
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
						<button
							type="button"
							onclick={() => {
								onOnlyTournamentsChange?.(!onlyTournaments);
								clearSelectedEvent();
							}}
							class={`rounded-full px-4 py-2 text-sm font-bold transition ${
								onlyTournaments
									? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
									: 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-blue-950'
							}`}
						>
							🏆 {i18n.t('only_tournaments')}
						</button>
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
							<div
								class="mb-1 flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400"
							>
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
					<p class="mt-4 text-sm text-slate-500 dark:text-slate-400">
						{i18n.t('no_sports_available')}
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
							{formatLevel(level)}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	{#if viewMode === 'map' && selectedEvent}
		<aside
			class="absolute inset-x-3 bottom-3 z-20 max-h-[42dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xl shadow-slate-300/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none md:inset-x-auto md:bottom-auto md:left-5 md:top-5 md:m-0 md:max-h-[70dvh] md:w-[24rem] md:rounded-[1.75rem] md:p-4 md:shadow-2xl md:shadow-slate-300/70"
		>
			<div class="flex items-center justify-between gap-3">
				<div class="flex min-w-0 flex-wrap items-center gap-2">
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-blue-600 dark:bg-blue-950/70 dark:text-blue-300 md:px-3 md:py-1 md:text-xs"
					>
						{selectedEvent.sport}
						<img src="/{selectedEvent.sport}_icon.png" alt="" class="h-3.5 w-3.5" />
					</span>
					{#if getEventTemporalState(selectedEvent) === 'live'}
						<span
							class="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 md:px-3 md:py-1 md:text-xs"
						>
							<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span>
							{i18n.t('happening_now')}
						</span>
					{:else if getEventTemporalState(selectedEvent) === 'starting_soon'}
						<span
							class="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 dark:bg-amber-950 dark:text-amber-300 md:px-3 md:py-1 md:text-xs"
						>
							{i18n.t('starting_soon')}
						</span>
					{/if}
					{#if selectedEventGroup.length > 1}
						<span
							class="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300 md:px-3 md:py-1 md:text-xs"
						>
							{selectedEventIndex + 1}/{selectedEventGroup.length}
							{i18n.t('nearby_lowercase')}
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
				<div
					class="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800 sm:h-20 sm:w-20 md:h-28 md:w-28"
				>
					{#if getSelectedPreviewUrl(selectedEvent)}
						<img
							src={getSelectedPreviewUrl(selectedEvent)}
							alt={selectedEvent.title}
							class="h-full w-full object-cover"
						/>
					{:else}
						<div
							class="grid h-full w-full place-items-center text-2xl font-black text-blue-600 dark:text-blue-300 md:text-3xl"
						>
							{selectedEvent.title.charAt(0).toUpperCase()}
						</div>
					{/if}
				</div>

				<div class="min-w-0 flex-1">
					<h2
						class="line-clamp-2 text-base font-black leading-tight text-slate-950 dark:text-slate-50 md:text-lg"
					>
						{selectedEvent.title}
					</h2>
					<p
						class="mt-0.5 truncate text-xs font-bold text-slate-500 dark:text-slate-400 md:mt-1 md:text-sm"
					>
						📍 {selectedEvent.location?.address ??
							selectedEvent.location?.name ??
							i18n.t('location_not_set')}
					</p>
					<p class="mt-1 truncate text-xs font-semibold text-slate-400 dark:text-slate-500">
						{formatSelectedDate(selectedEvent)}
					</p>

					<div class="mt-2 flex flex-wrap gap-1.5 md:mt-3">
						<span
							class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300 md:px-2.5 md:py-1 md:text-[11px]"
						>
							{formatLevel(selectedEvent.level ?? 'casual')}
						</span>
						<span
							class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-600 dark:bg-blue-950/70 dark:text-blue-300 md:px-2.5 md:py-1 md:text-[11px]"
						>
							{selectedEvent.participantIds.length}/{selectedEvent.maxParticipants}
							{i18n.t('players_lowercase')}
						</span>
						{#if selectedEvent.routeDistanceKm !== null && selectedEvent.routeDistanceKm !== undefined}
							<span
								class="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 md:px-2.5 md:py-1 md:text-[11px]"
								>{selectedEvent.routeDistanceKm.toFixed(2)} km</span
							>
						{/if}
					</div>
				</div>
			</div>

			{#if selectedEventGroup.length > 1}
				<div
					class="mt-2.5 flex items-center justify-between rounded-2xl bg-slate-50 px-2.5 py-1.5 dark:bg-slate-950/60 md:mt-3 md:px-3 md:py-2"
				>
					<div class="min-w-0">
						<p class="text-xs font-black text-slate-700 dark:text-slate-200">
							{i18n.t('events_in_area', { count: selectedEventGroup.length })}
						</p>
						<p
							class="hidden truncate text-[11px] font-bold text-slate-400 dark:text-slate-500 sm:block"
						>
							{i18n.t('use_arrows_preview_msg')}
						</p>
					</div>
					<div class="ml-3 flex shrink-0 items-center gap-2">
						<button
							type="button"
							onclick={() => moveSelectedEvent(-1)}
							class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-base font-black text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-blue-950 md:h-8 md:w-8 md:text-lg"
							aria-label={i18n.t('previous_nearby_event')}
						>
							‹
						</button>

						<span
							class="min-w-10 text-center text-xs font-black text-slate-500 dark:text-slate-300"
						>
							{selectedEventIndex + 1}/{selectedEventGroup.length}
						</span>

						<button
							type="button"
							onclick={() => moveSelectedEvent(1)}
							class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-base font-black text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-blue-950 md:h-8 md:w-8 md:text-lg"
							aria-label={i18n.t('next_nearby_event')}
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
		<div
			class="min-w-0 w-full max-w-full flex-1 overflow-x-hidden overflow-y-auto px-3 py-6 sm:px-4 md:px-8"
		>
			{#if shownFeedCount === 0}
				<div class="flex flex-col items-center justify-center py-20 text-center">
					<div class="rounded-full bg-slate-100 p-4 dark:bg-slate-800 text-3xl mb-4">🔍</div>
					<h3 class="text-lg font-black text-slate-950 dark:text-slate-50">
						{i18n.t('no_events_found')}
					</h3>
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
				<p class="mb-5 text-xs font-black uppercase tracking-wider text-slate-400">
					{formatShowingEvents(shownFeedCount)}
				</p>

				<div class="space-y-12 pb-16">
					<!-- 1. Featured Section -->
					{#if feedFeaturedEvents.length > 0}
						<section>
							<div class="mb-4">
								<h3
									class="flex items-center gap-2 text-base font-black text-slate-900 dark:text-slate-100"
								>
									<span class="text-slate-400">★</span>
									{i18n.t('featured_games')}
								</h3>
								<p class="text-xs text-slate-500 dark:text-slate-400">
									{i18n.t('promoted_matching_pref')}
								</p>
							</div>
							<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
								{#each feedFeaturedEvents as event (event.id)}
									<EventCard {event} variant="vertical" />
								{/each}
							</div>
						</section>
					{/if}

					<!-- 2. Friends Section -->
					{#if feedFriendsEvents.length > 0}
						<section>
							<div class="mb-4">
								<h3
									class="flex items-center gap-2 text-base font-black text-slate-900 dark:text-slate-100"
								>
									<span class="text-slate-400">◎</span>
									{i18n.t('friends_activity')}
								</h3>
								<p class="text-xs text-slate-500 dark:text-slate-400">
									{i18n.t('friends_activity_sub')}
								</p>
							</div>
							<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
								{#each feedFriendsEvents as event (event.id)}
									<EventCard {event} variant="vertical" />
								{/each}
							</div>
						</section>
					{/if}

					<!-- 3. General Section -->
					{#if feedGeneralEvents.length > 0}
						<section>
							<div class="mb-4">
								<h3
									class="flex items-center gap-2 text-base font-black text-slate-900 dark:text-slate-100"
								>
									<span class="text-slate-400">⌕</span>
									{i18n.t('explore_games')}
								</h3>
								<p class="text-xs text-slate-500 dark:text-slate-400">
									{i18n.t('explore_games_sub')}
								</p>
							</div>
							<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
								{#each feedGeneralEvents as event (event.id)}
									<EventCard {event} variant="vertical" />
								{/each}
							</div>
						</section>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</section>

<style>
	/* Force display mobile filters controls inside native fullscreen container */
	:global(:fullscreen) .fullscreen-force-show {
		display: flex !important;
	}
	:global(:fullscreen) .fullscreen-force-block {
		display: block !important;
	}

	/* Also cover vendor prefixes for fullscreen */
	:global(:-webkit-full-screen) .fullscreen-force-show {
		display: flex !important;
	}
	:global(:-webkit-full-screen) .fullscreen-force-block {
		display: block !important;
	}
	:global(.route-start-marker) {
		height: 18px;
		width: 18px;
		border-radius: 999px;
		background: #22c55e;
		border: 3px solid white;
		box-shadow: 0 1px 5px rgb(0 0 0 / 0.4);
	}
	:global(.route-finish-marker) {
		height: 20px;
		width: 20px;
		border-radius: 4px;
		border: 2px solid white;
		background-color: white;
		background-image: conic-gradient(#111 25%, white 0 50%, #111 0 75%, white 0);
		background-size: 10px 10px;
		box-shadow: 0 1px 5px rgb(0 0 0 / 0.45);
	}
</style>
