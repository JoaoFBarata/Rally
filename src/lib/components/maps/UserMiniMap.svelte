<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';

	let mapContainer: HTMLDivElement;
	let status = $state('Getting your location...');
	let map: import('mapbox-gl').Map | null = null;
	let marker: import('mapbox-gl').Marker | null = null;

	const fallbackCenter: [number, number] = [-9.1393, 38.7223]; // Lisboa

	async function createMap(center: [number, number], isFallback = false) {
		const mapboxgl = await import('mapbox-gl');

		mapboxgl.default.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN;

		map = new mapboxgl.default.Map({
			container: mapContainer,
			style: 'mapbox://styles/mapbox/streets-v12',
			center,
			zoom: 12,
			interactive: true
		});

		map.addControl(new mapboxgl.default.NavigationControl(), 'top-right');

		marker = new mapboxgl.default.Marker({
			color: isFallback ? '#64748b' : '#2563eb'
		})
			.setLngLat(center)
			.addTo(map);

		map.on('load', () => {
			map?.resize();
		});

		status = isFallback ? 'Showing approximate default area' : 'Showing your area';
	}

	onMount(() => {
		if (!navigator.geolocation) {
			createMap(fallbackCenter, true);
			return;
		}

		navigator.geolocation.getCurrentPosition(
			async (position) => {
				const center: [number, number] = [
					position.coords.longitude,
					position.coords.latitude
				];

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
			marker?.remove();
			map?.remove();
		};
	});
</script>

<div
	class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
>
	<div bind:this={mapContainer} class="h-72 w-full"></div>

	<div class="border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800">
		<p class="text-sm font-semibold text-slate-700 dark:text-slate-300">
			{status}
		</p>
		<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
			Used to show nearby sports activity.
		</p>
	</div>
</div>