<script lang="ts">
	import { onMount } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	import MapboxWorker from 'mapbox-gl/dist/mapbox-gl-csp-worker?worker';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import { themeState } from '$lib/theme.svelte';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { i18n } from '$lib/services/i18n.svelte';

	let {
		lat = $bindable<number | null>(),
		lng = $bindable<number | null>(),
		address = $bindable(''),
		autofillAddress = ''
	} = $props();

	// --- Mapbox Search Box API types -----------------------------------
	// (this is the product that supports POIs like "Estádio de Alvalade",
	// unlike the plain Geocoding v6 API which only covers addresses/streets)

	type SearchSuggestion = {
		mapbox_id: string;
		name?: string;
		name_preferred?: string;
		full_address?: string;
		place_formatted?: string;
		feature_type?: string;
		poi_category?: string[];
	};

	type SearchRetrieveFeature = {
		properties?: {
			name?: string;
			name_preferred?: string;
			full_address?: string;
			place_formatted?: string;
			feature_type?: string;
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
	let suggestions = $state<SearchSuggestion[]>([]);
	let searchLoading = $state(false);
	let searchError = $state('');
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	// A Search Box session groups one "suggest" call with the "retrieve" call
	// that follows it (this is how Mapbox bills/tracks a single search). We
	// mint a new token after every retrieve so the next search starts fresh.
	let sessionToken = $state(crypto.randomUUID());

	function renewSessionToken() {
		sessionToken = crypto.randomUUID();
	}

	function getProximityParam(): string | null {
		if (!map) return null;
		const center = map.getCenter();
		return `${center.lng},${center.lat}`;
	}

	// Builds a single display string once we have the *retrieved* feature.
	function buildFeatureLabel(feature: SearchRetrieveFeature): string {
		const name = feature.properties?.name_preferred ?? feature.properties?.name ?? '';
		const fullAddress =
			feature.properties?.full_address ?? feature.properties?.place_formatted ?? '';
		const featureType = feature.properties?.feature_type;

		if (featureType === 'poi' && name) {
			// e.g. "Estádio de Alvalade, Rua Prof. Fernando da Fonseca, Lisboa"
			if (fullAddress && !fullAddress.startsWith(name)) {
				return `${name}, ${fullAddress}`;
			}
			return name;
		}

		return fullAddress || name;
	}

	// Two-line label for the dropdown (name on top, address underneath).
	function buildSuggestionLabel(suggestion: SearchSuggestion): { primary: string; secondary: string } {
		const primary = suggestion.name_preferred ?? suggestion.name ?? '';
		const secondary = suggestion.full_address ?? suggestion.place_formatted ?? '';
		return { primary, secondary };
	}

	function getFeatureCoords(feature: SearchRetrieveFeature) {
		const longitude =
			feature.properties?.coordinates?.longitude ?? feature.geometry?.coordinates?.[0];
		const latitude =
			feature.properties?.coordinates?.latitude ?? feature.geometry?.coordinates?.[1];

		if (typeof longitude !== 'number' || typeof latitude !== 'number') return null;
		if (Number.isNaN(longitude) || Number.isNaN(latitude)) return null;

		return { lng: longitude, lat: latitude };
	}

	async function retrieveSuggestion(suggestion: SearchSuggestion) {
		const url = new URL(
			`https://api.mapbox.com/search/searchbox/v1/retrieve/${suggestion.mapbox_id}`
		);
		url.searchParams.set('access_token', PUBLIC_MAPBOX_ACCESS_TOKEN);
		url.searchParams.set('session_token', sessionToken);

		const response = await fetch(url);

		if (!response.ok) {
			throw new Error(i18n.t('could_not_get_coords'));
		}

		const data = await response.json();
		const feature = data.features?.[0] as SearchRetrieveFeature | undefined;

		// Retrieve closes the session; next suggest() starts a new one.
		renewSessionToken();

		return feature ?? null;
	}

	$effect(() => {
		const query = autofillAddress.trim();
		if (!query) return;

		searchLoading = true;
		searchError = '';

		void (async () => {
			try {
				const url = new URL('https://api.mapbox.com/search/searchbox/v1/suggest');
				url.searchParams.set('q', query);
				url.searchParams.set('access_token', PUBLIC_MAPBOX_ACCESS_TOKEN);
				url.searchParams.set('session_token', sessionToken);
				url.searchParams.set('country', 'pt');
				url.searchParams.set('language', 'en');
				url.searchParams.set('limit', '1');

				const proximity = getProximityParam();
				if (proximity) url.searchParams.set('proximity', proximity);

				const response = await fetch(url);
				const data = await response.json();
				const suggestion = data.suggestions?.[0] as SearchSuggestion | undefined;
				if (!suggestion) return;

				const feature = await retrieveSuggestion(suggestion);
				if (!feature) return;

				const coords = getFeatureCoords(feature);
				if (!coords) return;

				const resolved = buildFeatureLabel(feature) || query;
				searchQuery = resolved;
				suggestions = [];
				await setLocation(coords.lng, coords.lat, resolved);
			} catch (err) {
				console.error('Autofill search error:', err);
			} finally {
				searchLoading = false;
			}
		})();
	});

	async function searchAddressSuggestions(queryText: string) {
		const cleanQuery = queryText.trim();

		if (cleanQuery.length < 3) {
			suggestions = [];
			return;
		}

		searchLoading = true;
		searchError = '';

		try {
			const url = new URL('https://api.mapbox.com/search/searchbox/v1/suggest');

			url.searchParams.set('q', cleanQuery);
			url.searchParams.set('access_token', PUBLIC_MAPBOX_ACCESS_TOKEN);
			url.searchParams.set('session_token', sessionToken);
			url.searchParams.set('country', 'pt');
			url.searchParams.set('language', 'en');
			url.searchParams.set('limit', '6');
			// No "types" filter on purpose: this returns POIs (e.g. "Estádio de
			// Alvalade") and regular addresses/streets in the same result list.

			const proximity = getProximityParam();
			if (proximity) url.searchParams.set('proximity', proximity);

			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(i18n.t('could_not_search_address'));
			}

			const data = await response.json();

			suggestions = data.suggestions ?? [];
		} catch (err) {
			console.error('Address search error:', err);
			searchError = getFriendlyErrorMessage(err, i18n.t('could_not_search_address'));
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

	// --- POI detection --------------------------------------------------
	// The "Standard" style doesn't reliably expose POIs through
	// queryRenderedFeatures (its internal layer/source-layer names differ
	// from the classic styles), so the actual click detection is done via
	// the Tilequery API, which queries the mapbox-streets-v8 tileset
	// directly by coordinates and doesn't depend on the rendered style at
	// all. Client-side queryRenderedFeatures is still used, but only as a
	// cheap (no network call) heuristic to change the cursor on hover.

	function approxMetersPerPixel(atLat: number, zoom: number): number {
		return (156543.03392 * Math.cos((atLat * Math.PI) / 180)) / Math.pow(2, zoom);
	}

	function clickToleranceMeters(atLat: number): number {
		if (!map) return 30;
		const metersPerPixel = approxMetersPerPixel(atLat, map.getZoom());
		// ~8px of tolerance around the click, clamped to a sane range
		return Math.min(Math.max(metersPerPixel * 8, 15), 100);
	}

	async function queryPoiViaTilequery(
		clickLng: number,
		clickLat: number
	): Promise<{ name: string; lng: number; lat: number } | null> {
		try {
			const radius = clickToleranceMeters(clickLat);

			const url = new URL(
				`https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${clickLng},${clickLat}.json`
			);
			url.searchParams.set('radius', String(Math.round(radius)));
			url.searchParams.set('layers', 'poi_label');
			url.searchParams.set('limit', '10');
			url.searchParams.set('access_token', PUBLIC_MAPBOX_ACCESS_TOKEN);

			const response = await fetch(url);
			if (!response.ok) return null;

			const data = await response.json();
			const features = (data.features ?? []) as Array<{
				properties?: { name?: string; name_en?: string; tilequery?: { distance?: number } };
				geometry?: { coordinates?: [number, number] };
			}>;

			if (features.length === 0) return null;

			// Pick the closest poi to the actual click point.
			features.sort(
				(a, b) => (a.properties?.tilequery?.distance ?? Infinity) - (b.properties?.tilequery?.distance ?? Infinity)
			);

			const closest = features[0];
			const name = closest.properties?.name_en ?? closest.properties?.name ?? '';
			const coords = closest.geometry?.coordinates;

			if (!name || !coords) return null;

			return { name, lng: coords[0], lat: coords[1] };
		} catch (err) {
			console.error('Tilequery POI error:', err);
			return null;
		}
	}

	// Cheap, client-side-only check used purely to decide the cursor icon
	// while hovering (no network request, so it can run on every mousemove).
	function hasPoiUnderPoint(point: mapboxgl.PointLike): boolean {
		if (!map) return false;

		const p = point as mapboxgl.Point;
		const bbox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
			[p.x - 6, p.y - 6],
			[p.x + 6, p.y + 6]
		];

		const features = map.queryRenderedFeatures(bbox);

		return features.some(
			(feature) =>
				feature.sourceLayer === 'poi_label' ||
				(typeof feature.layer?.id === 'string' && feature.layer.id.toLowerCase().includes('poi'))
		);
	}

	async function reverseGeocode(newLng: number, newLat: number) {
		try {
			const url = new URL('https://api.mapbox.com/search/searchbox/v1/reverse');

			url.searchParams.set('longitude', String(newLng));
			url.searchParams.set('latitude', String(newLat));
			url.searchParams.set('access_token', PUBLIC_MAPBOX_ACCESS_TOKEN);
			url.searchParams.set('country', 'pt');
			url.searchParams.set('language', 'en');

			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(i18n.t('could_not_fetch_address'));
			}

			const data = await response.json();
			const feature = data.features?.[0] as SearchRetrieveFeature | undefined;

			address = feature ? buildFeatureLabel(feature) : '';
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

	async function selectSuggestion(suggestion: SearchSuggestion) {
		searchLoading = true;
		searchError = '';

		try {
			const feature = await retrieveSuggestion(suggestion);

			if (!feature) {
				searchError = i18n.t('could_not_get_coords');
				return;
			}

			const coords = getFeatureCoords(feature);

			if (!coords) {
				searchError = i18n.t('could_not_get_coords');
				return;
			}

			const selectedAddress = buildFeatureLabel(feature);

			address = selectedAddress;
			searchQuery = selectedAddress;
			suggestions = [];

			await setLocation(coords.lng, coords.lat, selectedAddress);
		} catch (err) {
			console.error('Retrieve error:', err);
			searchError = getFriendlyErrorMessage(err, i18n.t('could_not_get_coords'));
		} finally {
			searchLoading = false;
		}
	}

	async function useTypedAddress() {
		const cleanAddress = address.trim();

		if (!cleanAddress) {
			searchError = i18n.t('please_type_address');
			return;
		}

		searchLoading = true;
		searchError = '';

		try {
			const suggestUrl = new URL('https://api.mapbox.com/search/searchbox/v1/suggest');

			suggestUrl.searchParams.set('q', cleanAddress);
			suggestUrl.searchParams.set('access_token', PUBLIC_MAPBOX_ACCESS_TOKEN);
			suggestUrl.searchParams.set('session_token', sessionToken);
			suggestUrl.searchParams.set('country', 'pt');
			suggestUrl.searchParams.set('language', 'en');
			suggestUrl.searchParams.set('limit', '1');

			const proximity = getProximityParam();
			if (proximity) suggestUrl.searchParams.set('proximity', proximity);

			const suggestResponse = await fetch(suggestUrl);

			if (!suggestResponse.ok) {
				throw new Error(i18n.t('could_not_find_address'));
			}

			const suggestData = await suggestResponse.json();
			const suggestion = suggestData.suggestions?.[0] as SearchSuggestion | undefined;

			if (!suggestion) {
				searchError = i18n.t('could_not_find_approx_location');
				return;
			}

			const feature = await retrieveSuggestion(suggestion);

			if (!feature) {
				searchError = i18n.t('could_not_find_approx_location');
				return;
			}

			const coords = getFeatureCoords(feature);

			if (!coords) {
				searchError = i18n.t('could_not_get_coords');
				return;
			}

			const selectedAddress = buildFeatureLabel(feature) || cleanAddress;

			searchQuery = selectedAddress;
			suggestions = [];

			await setLocation(coords.lng, coords.lat, selectedAddress);
		} catch (err) {
			console.error('Manual address search error:', err);
			searchError = getFriendlyErrorMessage(err, 'Could not find this address.');
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

		map.getCanvas().style.cursor = 'crosshair';

		map.on('mousemove', (event) => {
			if (!map) return;
			map.getCanvas().style.cursor = hasPoiUnderPoint(event.point) ? 'pointer' : 'crosshair';
		});

		map.on('click', async (event) => {
			searchQuery = '';
			suggestions = [];
			searchError = '';

			const poi = await queryPoiViaTilequery(event.lngLat.lng, event.lngLat.lat);

			if (poi) {
				await setLocation(poi.lng, poi.lat, poi.name);
				return;
			}

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
	class="location-picker-map min-w-0 overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-lg shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-[2rem] sm:shadow-xl sm:shadow-slate-200/70"
>
	<div class="border-b border-slate-200 p-3 dark:border-slate-800 sm:p-5">
		<p class="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400 sm:text-sm">
			{i18n.t('location')}
		</p>

		<h2 class="mt-1 text-lg font-black text-slate-950 dark:text-slate-50 sm:text-xl">{i18n.t('pick_event_location')}</h2>

		<p class="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">
			{i18n.t('pick_location_sub')}
		</p>
	</div>

	<div
		class="space-y-3 border-b border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800 sm:space-y-4 sm:p-5"
	>
		<div>
			<label for="address-search" class="text-xs font-bold text-slate-700 dark:text-slate-300 sm:text-sm">
				{i18n.t('search_address')}
			</label>

			<div class="relative mt-1.5 sm:mt-2">
				<input
					id="address-search"
					value={searchQuery}
					oninput={handleSearchInput}
					placeholder={i18n.t('search_address_placeholder')}
					class="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:ring-blue-950 sm:px-4 sm:py-3 sm:text-base"
				/>

				{#if suggestions.length > 0}
					<div
						class="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
					>
						{#each suggestions as suggestion (suggestion.mapbox_id)}
							{@const label = buildSuggestionLabel(suggestion)}
							<button
								type="button"
								onclick={() => selectSuggestion(suggestion)}
								class="block w-full px-4 py-3 text-left transition hover:bg-blue-50 dark:hover:bg-blue-950"
							>
								<span class="block text-sm font-semibold text-slate-700 dark:text-slate-200">
									{label.primary}
								</span>
								{#if label.secondary}
									<span class="block text-xs font-medium text-slate-500 dark:text-slate-400">
										{label.secondary}
									</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:gap-3">
			<div>
				<label for="manual-address" class="text-xs font-bold text-slate-700 dark:text-slate-300 sm:text-sm">
					{i18n.t('manual_address')}
				</label>

				<input
					id="manual-address"
					bind:value={address}
					placeholder={i18n.t('manual_address_placeholder')}
					class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:ring-blue-950 sm:mt-2 sm:px-4 sm:py-3 sm:text-base"
				/>
			</div>

			<button
				type="button"
				onclick={useTypedAddress}
				disabled={searchLoading || !address.trim()}
				class="self-end rounded-2xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:py-3 sm:text-base"
			>
				{searchLoading ? i18n.t('searching') : i18n.t('find_on_map')}
			</button>
		</div>

		{#if searchError}
			<p
				class="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
			>
				{searchError}
			</p>
		{/if}

		<p class="hidden text-xs font-medium text-slate-500 dark:text-slate-400 sm:block">
			{i18n.t('location_picker_tip')}
		</p>
	</div>

	<div bind:this={mapContainer} class="h-52 w-full sm:h-96 lg:h-[420px]"></div>

	<div
		class="hidden grid-cols-2 gap-3 border-t border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-800 sm:grid sm:p-5 sm:text-sm"
	>
		<div>
			<p class="font-bold text-slate-700 dark:text-slate-300">{i18n.t('latitude')}</p>
			<p class="mt-1 text-slate-500 dark:text-slate-400">{lat ?? i18n.t('not_selected')}</p>
		</div>

		<div>
			<p class="font-bold text-slate-700 dark:text-slate-300">{i18n.t('longitude')}</p>
			<p class="mt-1 text-slate-500 dark:text-slate-400">{lng ?? i18n.t('not_selected')}</p>
		</div>
	</div>
</div>


