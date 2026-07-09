<!-- src/lib/components/maps/UserMiniMap.svelte -->
<script lang="ts">
	import { onMount, mount, unmount } from 'svelte';
	import { themeState } from '$lib/theme.svelte';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import { getVisibleEventsForUser } from '$lib/services/explore.service';
	import type { SportEvent } from '$lib/schema';
	import mapboxgl from 'mapbox-gl';
	import MapboxWorker from 'mapbox-gl/dist/mapbox-gl-csp-worker?worker';
	import { getUserProfile } from '$lib/services/user.service';
	import Marker from './Marker.svelte';
	import Supercluster from 'supercluster';

	let { userId = '' }: { userId?: string } = $props();

	let mapContainer: HTMLDivElement;
	let status = $state('Getting your location...');
	let radiusKm = $state(20);
	let showRadiusMenu = $state(false);

	let map: mapboxgl.Map | null = null;
	let marker: mapboxgl.Marker | null = null;
	let eventMarkers: mapboxgl.Marker[] = [];
	let svelteMarkers: any[] = [];
	let mapReady = $state(false);
	let clusterIndex: any = null;
	let userLocation = $state<[number, number] | null>(null); // [lng, lat]
	let allEvents = $state<SportEvent[]>([]);
	let unsubscribeThemeState: () => void = () => {};

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
			console.error('Failed to load creator profiles for user mini map:', err);
		}
	}

	$effect(() => {
		if (nearbyEvents.length > 0) {
			loadCreatorProfiles(nearbyEvents);
		}
	});

	$effect(() => {
		if (nearbyEvents) {
			const points = nearbyEvents
				.map((event: SportEvent) => {
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
				.filter((pt): pt is NonNullable<typeof pt> => pt !== null);

			const index = new Supercluster({
				radius: 50,
				maxZoom: 15
			});
			index.load(points);
			clusterIndex = index;

			if (mapReady) {
				renderEventMarkers();
			}
		}
	});

	const fallbackCenter: [number, number] = [-9.1393, 38.7223]; // Lisboa

	// Haversine formula to compute distance in Km between two points
	function getDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
		const R = 6371; // Radius of the Earth in km
		const dLat = ((lat2 - lat1) * Math.PI) / 180;
		const dLon = ((lon2 - lon1) * Math.PI) / 180;
		const a =
			Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos((lat1 * Math.PI) / 180) *
				Math.cos((lat2 * Math.PI) / 180) *
				Math.sin(dLon / 2) *
				Math.sin(dLon / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		return R * c;
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

	// Filter events within the selected radius
	let nearbyEvents = $derived.by(() => {
		if (!userLocation) return [];
		return allEvents.filter((event) => {
			const coords = getCoords(event);
			if (!coords) return false;
			const dist = getDistanceInKm(userLocation![1], userLocation![0], coords.lat, coords.lng);
			return dist <= radiusKm;
		});
	});

	async function loadEvents() {
		if (!userId) return;
		try {
			allEvents = await getVisibleEventsForUser(userId);
		} catch (err) {
			console.error('Failed to load events for mini map:', err);
		}
	}

	// Generate GeoJSON polygon coordinates for a circle representing the radius
	function createCircleGeoJSON(center: [number, number], radiusInKm: number, points = 64) {
		const coords = {
			latitude: center[1],
			longitude: center[0]
		};
		const coordinates = [];
		// Approximate degree distances based on latitude
		const distanceX = radiusInKm / (111.32 * Math.cos((coords.latitude * Math.PI) / 180));
		const distanceY = radiusInKm / 110.574;

		for (let i = 0; i < points; i++) {
			const theta = (i / points) * (2 * Math.PI);
			const x = distanceX * Math.cos(theta);
			const y = distanceY * Math.sin(theta);
			coordinates.push([coords.longitude + x, coords.latitude + y]);
		}
		coordinates.push(coordinates[0]); // Close polygon

		return {
			type: 'FeatureCollection' as const,
			features: [
				{
					type: 'Feature' as const,
					geometry: {
						type: 'Polygon' as const,
						coordinates: [coordinates]
					},
					properties: {}
				}
			]
		};
	}

	function clearEventMarkers() {
		for (const m of eventMarkers) {
			m.remove();
		}
		eventMarkers = [];

		for (const comp of svelteMarkers) {
            unmount(comp);
        }
        svelteMarkers = [];
	}

	function renderEventMarkers() {
		if (!map || !mapReady || !userLocation || !clusterIndex) return;
		const currentMap = map;
		clearEventMarkers();

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
					
					const isPriorityA = eventA.creatorId === userId;
					const isPriorityB = eventB.creatorId === userId;
					
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

				const getMarkerColor = (ev: SportEvent) => {
					if (ev.creatorId === userId) {
						return '#00B4D8'; // Blue - My events
					}
					return '#64748b'; // Gray - Public/other events
				};

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

				const m = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
					.setLngLat([lng, lat])
					.addTo(currentMap);
				eventMarkers.push(m);
			} else {
				const event = feature.properties.event;
				const popup = new mapboxgl.Popup({ offset: 10 }).setHTML(`
						<div class="p-2 font-sans text-slate-900 min-w-[150px]">
							<p class="text-xs font-bold uppercase tracking-wider text-blue-600">${event.sport}</p>
							<p class="font-bold text-sm leading-tight mt-0.5">${event.title}</p>
							<p class="text-xs text-slate-500 mt-1">${event.location?.name || ''}</p>
							<a href="/events/${event.id}" class="mt-2.5 block text-center text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-xl transition">View Event</a>
						</div>
					`);

				const creator = creatorProfiles[event.creatorId];
				const photoURL = event.groupPhotoURL || event.organizationLogoURL || creator?.photoURL || '';

				const el = document.createElement('div');
				el.className = 'custom-marker';
				el.style.cursor = 'pointer';

				const getMarkerColor = (ev: SportEvent) => {
					if (ev.creatorId === userId) {
						return '#00B4D8'; // Blue - My events
					}
					return '#64748b'; // Gray - Public/other events
				};

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

				const m = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
					.setLngLat([lng, lat])
					.setPopup(popup)
					.addTo(currentMap);

				eventMarkers.push(m);
			}
		}
	}

	function updateRadiusCircle() {
		if (!map || !mapReady || !userLocation) return;

		const center = userLocation;
		const radius = radiusKm;

		const distanceX = radius / (111.32 * Math.cos((center[1] * Math.PI) / 180));
		const distanceY = radius / 110.574;

		const circleGeoJSON = createCircleGeoJSON(center, radius);

		const sourceId = 'circle-source';
		const fillLayerId = 'circle-layer-fill';
		const strokeLayerId = 'circle-layer-stroke';

		// Update or add circle source
		if (!map.getSource(sourceId)) {
			map.addSource(sourceId, {
				type: 'geojson',
				data: circleGeoJSON
			});
		} else {
			const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource;
			source.setData(circleGeoJSON);
		}

		// Update or add circle fill layer
		if (!map.getLayer(fillLayerId)) {
			map.addLayer({
				id: fillLayerId,
				type: 'fill',
				source: sourceId,
				slot: 'bottom',
				paint: {
					'fill-color': '#2563eb',
					'fill-opacity': 0.15 // Increased from 0.08 to 0.15 for better visibility
				}
			});
		}

		// Update or add circle stroke layer
		if (!map.getLayer(strokeLayerId)) {
			map.addLayer({
				id: strokeLayerId,
				type: 'line',
				source: sourceId,
				slot: 'bottom',
				paint: {
					'line-color': '#2563eb',
					'line-width': 2, // Increased from 1.5 to 2
					'line-opacity': 0.5 // Set line opacity to 50%
				}
			});
		}

		// Adjust map view bounds to encompass the radius (plus extra margin)
		const bounds = new mapboxgl.LngLatBounds(
			[center[0] - distanceX * 1.15, center[1] - distanceY * 1.15],
			[center[0] + distanceX * 1.15, center[1] + distanceY * 1.15]
		);

		map.fitBounds(bounds, {
			padding: 15,
			maxZoom: 15,
			duration: 800
		});
	}

	async function createMap(center: [number, number], isFallback = false) {
		if (!mapContainer) return;
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
			center,
			zoom: 12,
			interactive: true
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
			renderEventMarkers();
		});
		map.on('moveend', () => {
			renderEventMarkers();
		});

		unsubscribeThemeState = themeState.subscribe((state) => {
			const lPreset = state ? 'night' : 'day';
			if (map) {
				map.setConfig('basemap', { lightPreset: lPreset });
			}
		});


		map.addControl(new mapboxgl.NavigationControl(), 'top-right');

		marker = new mapboxgl.Marker({
			color: isFallback ? '#64748b' : '#2563eb'
		})
			.setLngLat(center)
			.addTo(map);

		map.on('load', () => {
			mapReady = true;
			map?.resize();
		});

		userLocation = center;
		status = isFallback ? 'Showing approximate default area' : 'Showing your area';
	}

	onMount(() => {
		if (!navigator.geolocation) {
			createMap(fallbackCenter, true);
			return;
		}

		navigator.geolocation.getCurrentPosition(
			async (position) => {
				const center: [number, number] = [position.coords.longitude, position.coords.latitude];
				await createMap(center);
			},
			async () => {
				await createMap(fallbackCenter, true);
			},
			{
				enableHighAccuracy: true,
				timeout: 8000,
				maximumAge: 60000
			}
		);

		return () => {
			unsubscribeThemeState();
			clearEventMarkers();
			marker?.remove();
			map?.remove();
		};
	});

	$effect(() => {
		if (userId) {
			loadEvents();
		}
	});

	$effect(() => {
		// Explicitly read reactive states to establish dependency tracking
		const currentRadius = radiusKm;
		const events = nearbyEvents;
		const ready = mapReady;
		const loc = userLocation;
		const profiles = creatorProfiles; // Track changes

		if (map && ready && loc) {
			try {
				updateRadiusCircle();
				renderEventMarkers();
			} catch (err: any) {
				console.error('Error updating map radius or markers:', err);
				status = 'Map error: ' + err.message;
			}
		}
	});
</script>

<div
	class="overflow-hidden border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
>
	<div bind:this={mapContainer} class="h-72 w-full"></div>

	<div
		class="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800"
	>
		<div class="min-w-0">
			<p class="truncate text-sm font-semibold text-slate-700 dark:text-slate-300">
				{status}
			</p>
			<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
				Showing sports activity in this radius.
			</p>
		</div>

		<div class="relative shrink-0">
			<button
				type="button"
				class="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
				onclick={() => (showRadiusMenu = !showRadiusMenu)}
			>
				<span>Radius: {radiusKm} km</span>
				<svg
					class="h-3.5 w-3.5 text-slate-400 transition"
					class:rotate-180={showRadiusMenu}
					viewBox="0 0 20 20"
					fill="currentColor"
				>
					<path
						fill-rule="evenodd"
						d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
						clip-rule="evenodd"
					/>
				</svg>
			</button>

			{#if showRadiusMenu}
				<div
					class="absolute right-0 bottom-full z-30 mb-2 w-32 origin-bottom-right rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-200/80 outline-none dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
				>
					<p
						class="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500"
					>
						Select Radius
					</p>
					<div class="mt-1 space-y-0.5">
						{#each [5, 10, 20, 50, 100] as r}
							<button
								type="button"
								class="w-full rounded-xl px-2.5 py-1.5 text-left text-xs font-bold transition hover:bg-slate-100 dark:hover:bg-slate-800 {radiusKm ===
								r
									? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
									: 'text-slate-700 dark:text-slate-300'}"
								onclick={() => {
									radiusKm = r;
									showRadiusMenu = false;
								}}
							>
								{r} km
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	:global(.mapboxgl-popup-content) {
		border-radius: 1.25rem !important;
		padding: 12px 14px 10px 14px !important;
		box-shadow:
			0 10px 25px -5px rgba(0, 0, 0, 0.1),
			0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
		border: 1px solid rgba(226, 232, 240, 0.8) !important;
	}
	:global(.dark .mapboxgl-popup-content) {
		background: #0f172a !important;
		border-color: rgba(30, 41, 59, 0.8) !important;
	}
	:global(.mapboxgl-popup-tip) {
		border-top-color: #ffffff !important;
	}
	:global(.dark .mapboxgl-popup-tip) {
		border-top-color: #0f172a !important;
	}
</style>
