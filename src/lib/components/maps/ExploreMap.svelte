<script lang="ts">
	import { onMount } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import type { SportEvent } from '$lib/schema';

	let { events = [], currentUserId } = $props<{
		events: SportEvent[];
		currentUserId: string;
	}>();

	let mapContainer: HTMLDivElement;
	let map = $state<mapboxgl.Map | null>(null);
	let mapReady = $state(false);
	let selectedEvent = $state<SportEvent | null>(null);
	let markers: mapboxgl.Marker[] = [];

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

	function clearMarkers() {
		for (const marker of markers) {
			marker.remove();
		}

		markers = [];
	}

	function selectEvent(event: SportEvent) {
		selectedEvent = event;

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
		return event.creatorId === currentUserId ? '#2563eb' : '#dc2626';
	}
	function renderMarkers() {
		if (!map || !mapReady) return;

		clearMarkers();

		const eventsWithCoords = events
			.map((event) => ({
				event,
				coords: getCoords(event)
			}))
			.filter((item) => item.coords !== null);

		if (eventsWithCoords.length === 0) return;

		const bounds = new mapboxgl.LngLatBounds();

		for (const item of eventsWithCoords) {
			if (!item.coords) continue;

			const marker = new mapboxgl.Marker({ color: getMarkerColor(item.event) })
				.setLngLat([item.coords.lng, item.coords.lat])
				.addTo(map);
			marker.getElement().addEventListener('click', () => {
				selectEvent(item.event);
			});

			markers.push(marker);
			bounds.extend([item.coords.lng, item.coords.lat]);
		}

		map.fitBounds(bounds, {
			padding: 80,
			maxZoom: 13
		});
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
			mapReady = true;
			map?.resize();
			renderMarkers();
		});

		return () => {
			clearMarkers();
			map?.remove();
		};
	});

	$effect(() => {
		if (mapReady) {
			renderMarkers();
		}
	});
</script>

<section class="relative overflow-hidden rounded-4x1 border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
	<div bind:this={mapContainer} class="h-130 w-full"></div>
	
	<div class="absolute right-0 bottom-0 z-10 rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-lg">

		<div class="flex items-center gap-2 text-sm">
			<span class="h-3 w-3 rounded-full bg-blue-600"></span>
			<span>My events</span>
		</div>

		<div class="mt-2 flex items-center gap-2 text-sm">
			<span class="h-3 w-3 rounded-full bg-red-600"></span>
			<span>Public events</span>
		</div>

		<div class="mt-2 flex items-center gap-2 text-sm">
			<span class="h-3 w-3 rounded-full bg-yellow-600"></span>
			<span>Friends' events</span>
		</div>
	
	</div>

	{#if selectedEvent}
		<aside
			class="absolute left-5 top-5 z-10 w-80 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-300/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
		>
			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-xs font-bold uppercase tracking-[0.25em] text-blue-600">
						{selectedEvent.sport}
					</p>

					<h2 class="mt-2 text-2xl font-black leading-tight text-slate-950 dark:text-slate-50">
						{selectedEvent.title}
					</h2>
				</div>

				<button
					type="button"
					onclick={() => (selectedEvent = null)}
					class="flex h-6 w-6 items-center justify-center square-full text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
				>
					×
				</button>
			</div>

			<div class="mt-5 space-y-4">
				<div>
					<p class="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-350">Location</p>
					<p class="mt-1 font-semibold text-slate-800 dark:text-slate-300">
						{selectedEvent.location?.name ?? 'Location not set'}
					</p>

					{#if selectedEvent.location?.address}
						<p class="mt-1 text-sm text-slate-500">
							{selectedEvent.location.address}
						</p>
					{/if}
				</div>

				<div class="rounded-2xl bg-blue-50 p-4 dark:bg-slate-800">
					<p class="text-xs font-bold uppercase tracking-wide text-blue-500">Players</p>
					<p class="mt-1 text-2xl font-black text-blue-600">
						{selectedEvent.participantIds.length}/{selectedEvent.maxParticipants}
					</p>
					<p class="text-sm font-medium text-slate-500">confirmed players</p>
				</div>

				{#if selectedEvent.pricePerPerson}
					<div>
						<p class="text-xs font-bold uppercase tracking-wide text-slate-400">Price</p>
						<p class="mt-1 font-semibold text-slate-800 dark:text-slate-300">
							€{selectedEvent.pricePerPerson.toFixed(2)} / person
						</p>
					</div>
				{/if}

				<a
					href={`/events/${selectedEvent.id}`}
					class="block rounded-2xl bg-blue-600 px-5 py-3 text-center font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
				>
					View event
				</a>
			</div>
		</aside>
	{/if}
</section>