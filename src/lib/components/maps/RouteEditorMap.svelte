<script lang="ts">
	import { onMount } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	import MapboxWorker from 'mapbox-gl/dist/mapbox-gl-csp-worker?worker';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import { themeState } from '$lib/theme.svelte';
	import { calculateRouteDistanceKm } from '$lib/utils/route.utils';
	import { i18n } from '$lib/services/i18n.svelte';

	type RoutePoint = { lat: number; lng: number };
	let { points = $bindable<RoutePoint[]>([]), center = null } = $props<{
		points?: RoutePoint[];
		center?: RoutePoint | null;
	}>();

	let mapContainer: HTMLDivElement;
	let map: mapboxgl.Map | null = null;
	let ready = false;
	const sourceId = 'route-editor';
	let distanceKm = $derived(calculateRouteDistanceKm(points));
	let lastCenterKey = '';
	let endpointMarkers: mapboxgl.Marker[] = [];

	function geoJson() {
		return {
			type: 'FeatureCollection' as const,
			features: points.length > 1 ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: points.map((point: RoutePoint) => [point.lng, point.lat]) } }] : []
		};
	}

	function endpointElement(kind: 'start' | 'finish') {
		const element = document.createElement('div');
		element.className = kind === 'start' ? 'route-start-marker' : 'route-finish-marker';
		return element;
	}

	function renderEndpoints() {
		endpointMarkers.forEach((marker) => marker.remove());
		endpointMarkers = [];
		if (!map || points.length === 0) return;
		endpointMarkers.push(new mapboxgl.Marker({ element: endpointElement('start'), anchor: 'center' }).setLngLat([points[0].lng, points[0].lat]).addTo(map));
		if (points.length > 1) endpointMarkers.push(new mapboxgl.Marker({ element: endpointElement('finish'), anchor: 'center' }).setLngLat([points.at(-1)!.lng, points.at(-1)!.lat]).addTo(map));
	}

	function updateRoute() {
		const source = map?.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
		source?.setData(geoJson());
		renderEndpoints();
	}

	function addLayers() {
		if (!map || map.getSource(sourceId)) return;
		map.addSource(sourceId, { type: 'geojson', data: geoJson() });
		map.addLayer({ id: `${sourceId}-line`, type: 'line', source: sourceId, filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#0095ff', 'line-width': 5, 'line-opacity': 0.95 } });
	}

	function undo() { points = points.slice(0, -1); }
	function clear() { points = []; }

	onMount(() => {
		(mapboxgl as any).workerClass = MapboxWorker;
		mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN;
		map = new mapboxgl.Map({
			container: mapContainer,
			style: 'mapbox://styles/mapbox/standard',
			config: { basemap: { lightPreset: $themeState ? 'night' : 'day' } },
			center: center ? [center.lng, center.lat] : [-9.1393, 38.7223], zoom: center ? 15 : 10
		});
		lastCenterKey = center ? `${center.lat},${center.lng}` : '';
		map.addControl(new mapboxgl.NavigationControl(), 'top-right');
		map.on('load', () => { ready = true; addLayers(); renderEndpoints(); });
		map.on('click', (event) => { points = [...points, { lat: event.lngLat.lat, lng: event.lngLat.lng }]; });
		const unsubscribe = themeState.subscribe((dark) => map?.setConfig('basemap', { lightPreset: dark ? 'night' : 'day' }));
		return () => { unsubscribe(); endpointMarkers.forEach((marker) => marker.remove()); map?.remove(); };
	});

	$effect(() => { points; if (ready) updateRoute(); });
	$effect(() => {
		const centerKey = center ? `${center.lat},${center.lng}` : '';
		if (!ready || !map || !centerKey || centerKey === lastCenterKey) return;
		lastCenterKey = centerKey;
		points = [];
		map.flyTo({ center: [center!.lng, center!.lat], zoom: 15, essential: true });
	});
</script>

<section class="overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
	<div class="flex items-center justify-between gap-3 p-3 sm:p-4">
		<div><h3 class="text-sm font-black text-slate-950 dark:text-slate-50">{i18n.t('route')}</h3><p class="text-xs font-semibold text-slate-500 dark:text-slate-400">{i18n.t('route_editor_sub')}</p></div>
		<div class="flex shrink-0 gap-2"><button type="button" onclick={undo} disabled={points.length === 0} class="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200">{i18n.t('undo')}</button><button type="button" onclick={clear} disabled={points.length === 0} class="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-40 dark:bg-red-950/40 dark:text-red-300">{i18n.t('clear')}</button></div>
	</div>
	<div bind:this={mapContainer} class="route-editor-map h-72 w-full sm:h-96"></div>
	<p class="px-3 py-2 text-xs font-bold text-blue-600 dark:text-blue-300">{i18n.t('route_points_defined', { count: points.length, unit: points.length === 1 ? i18n.t('route_point') : i18n.t('route_points') })}{#if distanceKm !== null} · {i18n.t('route_distance', { distance: distanceKm.toFixed(2) })}{/if}</p>
</section>

<style>
	:global(.route-editor-map .mapboxgl-canvas) {
		cursor: crosshair !important;
	}
	:global(.route-start-marker) { height: 18px; width: 18px; border-radius: 999px; background: #22c55e; border: 3px solid white; box-shadow: 0 1px 5px rgb(0 0 0 / 0.4); }
	:global(.route-finish-marker) { height: 20px; width: 20px; border-radius: 4px; border: 2px solid white; background-color: white; background-image: conic-gradient(#111 25%, white 0 50%, #111 0 75%, white 0); background-size: 10px 10px; box-shadow: 0 1px 5px rgb(0 0 0 / 0.45); }
</style>
