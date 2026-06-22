<script lang="ts">
	import { onMount } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	import MapboxWorker from 'mapbox-gl/dist/mapbox-gl-csp-worker?worker';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import { themeState } from '$lib/theme.svelte';

	let {
		lat = $bindable<number | null>(),
		lng = $bindable<number | null>(),
		address = $bindable(''),
		autofillAddress = ''
	} = $props();

	type MapboxGeocodeFeature = {
		id?: string;
		properties?: {
			full_address?: string;
			name_preferred?: string;
			name?: string;
			place_formatted?: string;
			coordinates?: {
				longitude?: number;
				latitude?: number;
			};
		};
		geometry?: {
			coordinates?: [number, number];
		};
	};

	let mapContainer: HTMLDivElement;
	let map: mapboxgl.Map | null = null;
	let marker: mapboxgl.Marker | null = null;

	let searchQuery = $state('');
	let suggestions = $state<MapboxGeocodeFeature[]>([]);
	let searchLoading = $state(false);
	let searchError = $state('');
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const query = autofillAddress.trim();
		if (!query) return;

		searchLoading = true;
		searchError = '';

		const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
		url.searchParams.set('q', query);
		url.searchParams.set('access_token', PUBLIC_MAPBOX_ACCESS_TOKEN);
		url.searchParams.set('country', 'pt');
		url.searchParams.set('limit', '1');
		url.searchParams.set('language', 'en');

		fetch(url)
			.then((r) => r.json())
			.then((data) => {
				const feature = data.features?.[0] as MapboxGeocodeFeature | undefined;
				if (!feature) return;
				const coords = getFeatureCoords(feature);
				if (!coords) return;
				const resolved = getFeatureAddress(feature) || query;
				searchQuery = resolved;
				suggestions = [];
				return setLocation(coords.lng, coords.lat, resolved);
			})
			.catch((err) => {
				console.error('Autofill geocode error:', err);
			})
			.finally(() => {
				searchLoading = false;
			});
	});

	function getFeatureAddress(feature: MapboxGeocodeFeature) {
		return (
			feature.properties?.full_address ??
			feature.properties?.name_preferred ??
			feature.properties?.name ??
			feature.properties?.place_formatted ??
			''
		);
	}

	function getFeatureCoords(feature: MapboxGeocodeFeature) {
		const longitude =
			feature.properties?.coordinates?.longitude ?? feature.geometry?.coordinates?.[0];

		const latitude =
			feature.properties?.coordinates?.latitude ?? feature.geometry?.coordinates?.[1];

		if (typeof longitude !== 'number' || typeof latitude !== 'number') return null;
		if (Number.isNaN(longitude) || Number.isNaN(latitude)) return null;

		return {
			lng: longitude,
			lat: latitude
		};
	}

	async function searchAddressSuggestions(queryText: string) {
		const cleanQuery = queryText.trim();

		if (cleanQuery.length < 3) {
			suggestions = [];
			return;
		}

		searchLoading = true;
		searchError = '';

		try {
			const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');

			url.searchParams.set('q', cleanQuery);
			url.searchParams.set('access_token', PUBLIC_MAPBOX_ACCESS_TOKEN);
			url.searchParams.set('country', 'pt');
			url.searchParams.set('limit', '5');
			url.searchParams.set('language', 'en');

			const response = await fetch(url);

			if (!response.ok) {
				throw new Error('Could not search address.');
			}

			const data = await response.json();

			suggestions = data.features ?? [];
		} catch (err) {
			console.error('Address search error:', err);
			searchError = err instanceof Error ? err.message : 'Could not search address.';
			suggestions = [];
		} finally {
			searchLoading = false;
		}
	}

	function handleSearchInput(inputEvent: Event) {
		const value = (inputEvent.currentTarget as HTMLInputElement).value;
		searchQuery = value;

		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}

		searchTimeout = setTimeout(() => {
			void searchAddressSuggestions(value);
		}, 350);
	}

	async function reverseGeocode(newLng: number, newLat: number) {
		try {
			const url = new URL('https://api.mapbox.com/search/geocode/v6/reverse');

			url.searchParams.set('longitude', String(newLng));
			url.searchParams.set('latitude', String(newLat));
			url.searchParams.set('access_token', PUBLIC_MAPBOX_ACCESS_TOKEN);
			url.searchParams.set('country', 'pt');
			url.searchParams.set('language', 'en');

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

	async function setLocation(newLng: number, newLat: number, nextAddress?: string) {
		lng = Number(newLng.toFixed(6));
		lat = Number(newLat.toFixed(6));

		if (nextAddress !== undefined) {
			address = nextAddress;
		} else {
			await reverseGeocode(lng, lat);
		}

		if (!marker) {
			marker = new mapboxgl.Marker({ color: '#2563eb' });
		}

		marker.setLngLat([lng, lat]);

		if (map && !marker.getElement().parentElement) {
			marker.addTo(map);
		}

		map?.flyTo({
			center: [lng, lat],
			zoom: 15,
			speed: 1.2,
			curve: 1.3,
			essential: true
		});
	}

	async function selectSuggestion(feature: MapboxGeocodeFeature) {
		const coords = getFeatureCoords(feature);
		const selectedAddress = getFeatureAddress(feature);

		if (!coords) {
			searchError = 'Could not get coordinates for this address.';
			return;
		}

		address = selectedAddress;
		searchQuery = selectedAddress;
		suggestions = [];
		searchError = '';

		await setLocation(coords.lng, coords.lat, selectedAddress);
	}

	async function useTypedAddress() {
		const cleanAddress = address.trim();

		if (!cleanAddress) {
			searchError = 'Please type an address first.';
			return;
		}

		searchLoading = true;
		searchError = '';

		try {
			const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');

			url.searchParams.set('q', cleanAddress);
			url.searchParams.set('access_token', PUBLIC_MAPBOX_ACCESS_TOKEN);
			url.searchParams.set('country', 'pt');
			url.searchParams.set('limit', '1');
			url.searchParams.set('language', 'en');

			const response = await fetch(url);

			if (!response.ok) {
				throw new Error('Could not find this address.');
			}

			const data = await response.json();
			const feature = data.features?.[0] as MapboxGeocodeFeature | undefined;

			if (!feature) {
				searchError =
					'Could not find an approximate location. Try a street name, postal code, or click on the map.';
				return;
			}

			const coords = getFeatureCoords(feature);

			if (!coords) {
				searchError = 'Could not get coordinates for this address.';
				return;
			}

			const selectedAddress = getFeatureAddress(feature) || cleanAddress;

			searchQuery = selectedAddress;
			suggestions = [];

			await setLocation(coords.lng, coords.lat, selectedAddress);
		} catch (err) {
			console.error('Manual address geocoding error:', err);
			searchError = err instanceof Error ? err.message : 'Could not find this address.';
		} finally {
			searchLoading = false;
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

		const unsubscribeThemeState = themeState.subscribe((state) => {
			const lightPreset = state ? 'night' : 'day';

			if (map) {
				map.setConfig('basemap', { lightPreset });
			}
		});

		map.addControl(new mapboxgl.NavigationControl(), 'top-right');

		map.on('load', () => {
			map?.resize();

			if (lat !== null && lng !== null) {
				void setLocation(lng, lat, address || undefined);
			}
		});

		map.on('click', async (event) => {
			searchQuery = '';
			suggestions = [];
			searchError = '';

			await setLocation(event.lngLat.lng, event.lngLat.lat);
		});

		return () => {
			if (searchTimeout) {
				clearTimeout(searchTimeout);
			}

			unsubscribeThemeState();
			marker?.remove();
			map?.remove();
		};
	});
</script>

<div
	class="location-picker-map min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-[2rem]"
>
	<div class="border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
		<p class="text-sm font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
			Location
		</p>

		<h2 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50">Pick event location</h2>

		<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
			Search by street, postal code, or click on the map to define the event location.
		</p>
	</div>

	<div
		class="space-y-4 border-b border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800 sm:p-5"
	>
		<div>
			<label for="address-search" class="text-sm font-bold text-slate-700 dark:text-slate-300">
				Search address
			</label>

			<div class="relative mt-2">
				<input
					id="address-search"
					value={searchQuery}
					oninput={handleSearchInput}
					placeholder="Street, postal code, place name..."
					class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:ring-blue-950"
				/>

				{#if suggestions.length > 0}
					<div
						class="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
					>
						{#each suggestions as suggestion, index (suggestion.id ?? `${getFeatureAddress(suggestion)}-${index}`)}
							<button
								type="button"
								onclick={() => selectSuggestion(suggestion)}
								class="block w-full px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700 dark:text-slate-200 dark:hover:bg-blue-950 dark:hover:text-blue-300"
							>
								{getFeatureAddress(suggestion)}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:gap-3">
			<div>
				<label for="manual-address" class="text-sm font-bold text-slate-700 dark:text-slate-300">
					Address
				</label>

				<input
					id="manual-address"
					bind:value={address}
					placeholder="You can also type the address manually"
					class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:ring-blue-950"
				/>
			</div>

			<button
				type="button"
				onclick={useTypedAddress}
				disabled={searchLoading || !address.trim()}
				class="self-end rounded-2xl bg-blue-600 px-3 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:text-base"
			>
				{searchLoading ? 'Searching...' : 'Find on map'}
			</button>
		</div>

		{#if searchError}
			<p
				class="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
			>
				{searchError}
			</p>
		{/if}

		<p class="text-xs font-medium text-slate-500 dark:text-slate-400">
			Tip: after searching, you can still click on the map to adjust the marker.
		</p>
	</div>

	<div bind:this={mapContainer} class="h-72 w-full sm:h-96 lg:h-[520px]"></div>

	<div
		class="grid grid-cols-2 gap-3 border-t border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-800 sm:p-5 sm:text-sm"
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
