<script lang="ts">
	import { onMount } from 'svelte';
	import { getWeatherForEvent, type WeatherForecast } from '$lib/services/event.service';
	import { i18n } from '$lib/services/i18n.svelte';

	let { lat, lng, startAt, size = 'md' } = $props<{
		lat: number | null | undefined;
		lng: number | null | undefined;
		startAt: any;
		size?: 'sm' | 'md';
	}>();

	let weather = $state<WeatherForecast | null>(null);
	let loading = $state(true);

	function getEventDate(): Date | null {
		if (!startAt) return null;
		if (typeof startAt.toDate === 'function') {
			return startAt.toDate();
		} else if (startAt instanceof Date) {
			return startAt;
		} else if (typeof startAt === 'string' || typeof startAt === 'number') {
			const d = new Date(startAt);
			return Number.isNaN(d.getTime()) ? null : d;
		}
		return null;
	}

	function getFallbackInfo() {
		const date = getEventDate();
		if (!date) {
			return {
				tooltip: i18n.t('weather_forecast_unavailable'),
				label: i18n.t('weather_forecast_unavailable_short')
			};
		}

		const now = Date.now();
		if (date.getTime() < now - 24 * 3600 * 1000) {
			return {
				tooltip: i18n.t('weather_past_unavailable'),
				label: i18n.t('weather_past_event')
			};
		}

		if (date.getTime() - now > 14 * 24 * 3600 * 1000) {
			return {
				tooltip: i18n.t('weather_future_unavailable'),
				label: i18n.t('weather_future_event')
			};
		}

		return {
			tooltip: i18n.t('weather_forecast_unavailable'),
			label: i18n.t('weather_forecast_unavailable_short')
		};
	}

	function getWeatherDescription(description: string) {
		const translated = i18n.t(description);
		return translated === description ? description : translated;
	}

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

{#if !loading}
	{#if weather}
		{#if size === 'sm'}
			<span
				class="inline-flex items-center gap-1 rounded-full bg-slate-100/70 px-2 py-0.5 text-[10px] font-black text-slate-600 dark:bg-slate-850 dark:text-slate-300"
				title={getWeatherDescription(weather.description)}
			>
				<span>{weather.icon}</span>
				<span>{Math.round(weather.temp)}°C</span>
			</span>
		{:else}
			<div
				class="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800/80 dark:text-slate-300 dark:ring-slate-700/60"
				title={getWeatherDescription(weather.description)}
			>
				<span class="text-base">{weather.icon}</span>
				<span>{Math.round(weather.temp)}°C</span>
				<span class="hidden text-xs text-slate-400 dark:text-slate-500 sm:inline-block">•</span>
				<span class="hidden text-xs text-slate-500 dark:text-slate-400 sm:inline-block">{getWeatherDescription(weather.description)}</span>
			</div>
		{/if}
	{:else}
		{@const info = getFallbackInfo()}
		{#if size === 'sm'}
			<span
				class="inline-flex items-center gap-1 rounded-full bg-slate-50/50 px-2 py-0.5 text-[10px] font-semibold text-slate-400 dark:bg-slate-850/50 dark:text-slate-500 cursor-help"
				title={info.tooltip}
			>
				<span>☁️</span>
				<span>N/A</span>
			</span>
		{:else}
			<div
				class="inline-flex items-center gap-2 rounded-xl bg-slate-50/50 px-3 py-1.5 text-xs font-semibold text-slate-400 shadow-sm ring-1 ring-slate-100/80 dark:bg-slate-800/40 dark:text-slate-500 dark:ring-slate-750/30 cursor-help"
				title={info.tooltip}
			>
				<span class="text-sm">☁️</span>
				<span>{info.label}</span>
			</div>
		{/if}
	{/if}
{/if}
