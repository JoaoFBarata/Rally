<script lang="ts">
	import { onMount } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';

	let {
		lat = $bindable<number | null>(),
		lng = $bindable<number | null>(),
		address = $bindable('')
	} = $props();

	let mapContainer: HTMLDivElement;
	let map: mapboxgl.Map | null = null;
	let marker: mapboxgl.Marker | null = null;
	async function reverseGeocode(newLng: number, newLat: number) {
		try {
			const url = new URL('https://api.mapbox.com/search/geocode/v6/reverse');

			url.searchParams.set('longitude', String(newLng));
			url.searchParams.set('latitude', String(newLat));
			url.searchParams.set('access_token', PUBLIC_MAPBOX_ACCESS_TOKEN);

			const response = await fetch(url);

			if (!response.ok) {
				throw new Error('Could not fetch address.');
			}

			const data = await response.json();

			const feature = data.features?.[0];

			if (!feature) {
				address = '';
				return;
			}

			address =
				feature.properties?.full_address ??
				feature.properties?.name_preferred ??
				feature.properties?.name ??
				feature.properties?.place_formatted ??
				'';
		} catch (err) {
			console.error('Reverse geocoding error:', err);
		}
	}
	async function setLocation(newLng: number, newLat: number) {
		lng = Number(newLng.toFixed(6));
		lat = Number(newLat.toFixed(6));

		await reverseGeocode(lng, lat);

		if (!marker) {
			marker = new mapboxgl.Marker({ color: '#2563eb' });
		}

		marker.setLngLat([lng, lat]);

		if (map && !marker.getElement().parentElement) {
			marker.addTo(map);
		}
	}

	onMount(() => {
		mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN;

		map = new mapboxgl.Map({
			container: mapContainer,
			style: 'mapbox://styles/mapbox/streets-v12',
			center: [-9.1393, 38.7223],
			zoom: 10
		});

		map.addControl(new mapboxgl.NavigationControl(), 'top-right');

		map.on('load', () => {
			map?.resize();
		});

		map.on('click', async (event) => {
			await setLocation(event.lngLat.lng, event.lngLat.lat);
		});

		return () => {
			marker?.remove();
			map?.remove();
		};
	});
</script>
<style>
		:global(.location-picker-map .mapboxgl-canvas) {
			cursor: crosshair !important;
		}

		:global(.location-picker-map .mapboxgl-canvas-container.mapboxgl-interactive) {
			cursor: crosshair !important;
		}

		:global(.location-picker-map .mapboxgl-canvas-container.mapboxgl-interactive:active) {
			cursor: crosshair !important;
		}
	</style>
<div
	class="location-picker-map overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
>
	<div class="border-b border-slate-200 p-5 dark:border-slate-800">
		<p class="text-sm font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
			Location
		</p>

		<h2 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50">
			Pick event location
		</h2>

		<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
			Click on the map to define the event location.
		</p>
	</div>

	<div bind:this={mapContainer} class="h-[520px] w-full"></div>

	<div
		class="grid gap-3 border-t border-slate-200 bg-slate-50 p-5 text-sm dark:border-slate-800 dark:bg-slate-800 md:grid-cols-2"
	>
		<div>
			<p class="font-bold text-slate-700 dark:text-slate-300">Latitude</p>
			<p class="mt-1 text-slate-500 dark:text-slate-400">{lat ?? 'Not selected'}</p>
		</div>

		<div>
			<p class="font-bold text-slate-700 dark:text-slate-300">Longitude</p>
			<p class="mt-1 text-slate-500 dark:text-slate-400">{lng ?? 'Not selected'}</p>
		</div>
	</div>
</div>
