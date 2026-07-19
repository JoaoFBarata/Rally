<script lang="ts">
	import { onMount } from 'svelte';
	import MapboxWorker from 'mapbox-gl/dist/mapbox-gl-csp-worker?worker';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import { i18n } from '$lib/services/i18n.svelte';
	import type { Map, Marker } from 'mapbox-gl';

	let {
		lat,
		lng,
		name = 'Event location',
		address = '',
		route = [],
		compact = false,
		showHeader = true
	}: {
		lat: number | null;
		lng: number | null;
		name?: string;
		address?: string;
		route?: { lat: number; lng: number }[];
		compact?: boolean;
		showHeader?: boolean;
	} = $props();

	let mapContainer = $state<HTMLDivElement>();
	let map: Map | null = null;
	let marker: Marker | null = null;
	let routeEndpointMarkers: Marker[] = [];

	const hasLocation = $derived(
		typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)
	);

	onMount(() => {
		let cancelled = false;

		async function initMap() {
			if (!hasLocation || !mapContainer) return;

			const eventLat = lat;
			const eventLng = lng;

			if (eventLat === null || eventLng === null) return;

			const mapboxgl = await import('mapbox-gl');

			if (cancelled) return;

			(mapboxgl.default as any).workerClass = MapboxWorker;
			mapboxgl.default.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN;

			map = new mapboxgl.default.Map({
				container: mapContainer,
				style: 'mapbox://styles/mapbox/streets-v12',
				center: [eventLng, eventLat],
				zoom: 14,
				interactive: true
			});

			map.addControl(new mapboxgl.default.NavigationControl(), 'top-right');

			marker = new mapboxgl.default.Marker({
				color: '#2563eb'
			})
				.setLngLat([eventLng, eventLat])
				.addTo(map);

			map.on('load', () => {
				if (route.length > 1 && map) {
					const sourceId = 'event-route';
					map.addSource(sourceId, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.map((point) => [point.lng, point.lat]) } } });
					map.addLayer({ id: `${sourceId}-outline`, type: 'line', source: sourceId, paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.85 } });
					map.addLayer({ id: `${sourceId}-line`, type: 'line', source: sourceId, paint: { 'line-color': '#0095ff', 'line-width': 5, 'line-opacity': 0.98 } });
					const startElement = document.createElement('div');
					startElement.className = 'route-start-marker';
					const finishElement = document.createElement('div');
					finishElement.className = 'route-finish-marker';
					routeEndpointMarkers = [
						new mapboxgl.default.Marker({ element: startElement, anchor: 'center' }).setLngLat([route[0].lng, route[0].lat]).addTo(map),
						new mapboxgl.default.Marker({ element: finishElement, anchor: 'center' }).setLngLat([route.at(-1)!.lng, route.at(-1)!.lat]).addTo(map)
					];
					const bounds = new mapboxgl.default.LngLatBounds();
					route.forEach((point) => bounds.extend([point.lng, point.lat]));
					map.fitBounds(bounds, { padding: compact ? 36 : 56, maxZoom: 15, duration: 0 });
				}
				map?.resize();
			});
		}

		initMap();

		return () => {
			cancelled = true;
			marker?.remove();
			routeEndpointMarkers.forEach((routeMarker) => routeMarker.remove());
			map?.remove();
		};
	});
</script>

<div
	class={`overflow-hidden bg-white dark:bg-slate-900 ${
		showHeader
			? `border border-slate-200 dark:border-slate-800 ${compact ? 'rounded-[1.5rem] shadow-sm shadow-slate-200/50 dark:shadow-none' : 'rounded-3xl shadow-sm'}`
			: compact
				? 'rounded-[1.5rem]'
				: 'rounded-3xl'
	}`}
>
	{#if showHeader}
		<div class={compact ? 'border-b border-slate-100 p-3 dark:border-slate-800' : 'border-b border-slate-200 p-5 dark:border-slate-800'}>
			{#if !compact}
				<p class="text-sm font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
					{i18n.t('location')}
				</p>
			{/if}

			<h2 class={compact ? 'truncate text-sm font-black text-slate-950 dark:text-slate-50' : 'mt-1 text-xl font-black text-slate-950 dark:text-slate-50'}>
				{name}
			</h2>

			{#if address}
				<p class={compact ? 'mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400' : 'mt-1 text-sm text-slate-500 dark:text-slate-400'}>
					{address}
				</p>
			{:else}
				<p class={compact ? 'mt-0.5 text-xs text-slate-500 dark:text-slate-400' : 'mt-1 text-sm text-slate-500 dark:text-slate-400'}>{i18n.t('approximate_event_location')}</p>
			{/if}
		</div>
	{/if}

	{#if hasLocation}
		<div bind:this={mapContainer} class={compact ? 'h-44 w-full' : 'h-72 w-full'}></div>
	{:else}
		<div
			class={compact ? 'flex h-44 items-center justify-center bg-slate-50 p-5 text-center dark:bg-slate-800' : 'flex h-72 items-center justify-center bg-slate-50 p-6 text-center dark:bg-slate-800'}
		>
			<div>
				<p class="text-5xl">📍</p>

				<p class="mt-3 font-bold text-slate-950 dark:text-slate-50">{i18n.t('no_location_selected')}</p>

				<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
					{i18n.t('no_location_selected_sub')}
				</p>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(.route-start-marker) { height: 18px; width: 18px; border-radius: 999px; background: #22c55e; border: 3px solid white; box-shadow: 0 1px 5px rgb(0 0 0 / 0.4); }
	:global(.route-finish-marker) { height: 20px; width: 20px; border-radius: 4px; border: 2px solid white; background-color: white; background-image: conic-gradient(#111 25%, white 0 50%, #111 0 75%, white 0); background-size: 10px 10px; box-shadow: 0 1px 5px rgb(0 0 0 / 0.45); }
</style>
