<script lang="ts">
	import { onMount } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';

	let {
		lat = $bindable<number | null>(),
		lng = $bindable<number | null>()
	} = $props();

	let mapContainer: HTMLDivElement;
	let map: mapboxgl.Map | null = null;
	let marker: mapboxgl.Marker | null = null;

	function setLocation(newLng: number, newLat: number) {
		lng = Number(newLng.toFixed(6));
		lat = Number(newLat.toFixed(6));

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

		map.on('click', (event) => {
			setLocation(event.lngLat.lng, event.lngLat.lat);
		});

		return () => {
			marker?.remove();
			map?.remove();
		};
	});
</script>

<div
	class="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
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