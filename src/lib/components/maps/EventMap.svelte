<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import type { Map, Marker } from 'mapbox-gl';

	let {
		lat,
		lng,
		name = 'Event location',
		address = ''
	}: {
		lat: number | null;
		lng: number | null;
		name?: string;
		address?: string;
	} = $props();

	let mapContainer: HTMLDivElement;
	let map: Map | null = null;
	let marker: Marker | null = null;

	const hasLocation = $derived(
		typeof lat === 'number' &&
			typeof lng === 'number' &&
			!Number.isNaN(lat) &&
			!Number.isNaN(lng)
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
				map?.resize();
			});
		}

		initMap();

		return () => {
			cancelled = true;
			marker?.remove();
			map?.remove();
		};
	});
</script>

<div
	class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
>
	<div class="border-b border-slate-200 p-5 dark:border-slate-800">
		<p class="text-sm font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
			Location
		</p>

		<h2 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50">
			{name}
		</h2>

		{#if address}
			<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
				{address}
			</p>
		{:else}
			<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
				Approximate event location.
			</p>
		{/if}
	</div>

	{#if hasLocation}
		<div bind:this={mapContainer} class="h-72 w-full"></div>
	{:else}
		<div class="flex h-72 items-center justify-center bg-slate-50 p-6 text-center dark:bg-slate-800">
			<div>
				<p class="text-5xl">📍</p>

				<p class="mt-3 font-bold text-slate-950 dark:text-slate-50">
					No location selected
				</p>

				<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
					This event does not have map coordinates yet.
				</p>
			</div>
		</div>
	{/if}
</div>