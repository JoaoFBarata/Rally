<script lang="ts">
	import { onMount } from 'svelte';
	import { getWeatherForEvent, type WeatherForecast } from '$lib/services/event.service';

	let { lat, lng, startAt, size = 'md' } = $props<{
		lat: number | null | undefined;
		lng: number | null | undefined;
		startAt: any;
		size?: 'sm' | 'md';
	}>();

	let weather = $state<WeatherForecast | null>(null);
	let loading = $state(true);

	onMount(() => {
		async function fetchWeather() {
			if (lat === null || lat === undefined || lng === null || lng === undefined || !startAt) {
				loading = false;
				return;
			}
			try {
				weather = await getWeatherForEvent(lat, lng, startAt);
			} catch (err) {
				console.error('Weather component error:', err);
			} finally {
				loading = false;
			}
		}
		void fetchWeather();
	});
</script>

{#if !loading && weather}
	{#if size === 'sm'}
		<span
			class="inline-flex items-center gap-1 rounded-full bg-slate-100/70 px-2 py-0.5 text-[10px] font-black text-slate-600 dark:bg-slate-850 dark:text-slate-300"
			title={weather.description}
		>
			<span>{weather.icon}</span>
			<span>{Math.round(weather.temp)}°C</span>
		</span>
	{:else}
		<div
			class="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/80 dark:text-slate-300 dark:ring-slate-700/60"
			title={weather.description}
		>
			<span class="text-base">{weather.icon}</span>
			<span>{Math.round(weather.temp)}°C</span>
			<span class="hidden text-xs text-slate-400 dark:text-slate-500 sm:inline-block">•</span>
			<span class="hidden text-xs text-slate-500 dark:text-slate-400 sm:inline-block capitalize">{weather.description}</span>
		</div>
	{/if}
{/if}
