<script lang="ts">
	const {
		profile_url,
		name_letter = 'U',
		sport,
		n_confirmed_attendees = 0,
		max_occupancy = 0,
		marker_scale = 0.6,
		marker_color = '#00B4D8FF',
		cluster_count = 0,
		temporal_state = 'upcoming',
		kind = 'event',
		rating_label = null
	} = $props();
	const effectiveTemporalState = $derived(kind === 'venue' ? 'upcoming' : temporal_state);
	const pulseDurationMs = $derived(effectiveTemporalState === 'live' ? 2800 : 2400);
	const pulseDelay = $derived(`-${Date.now() % pulseDurationMs}ms`);
</script>

<div
	id="marker"
	class="marker-{effectiveTemporalState} w-[calc(var(--marker-scale)*7.1875rem)] select-none"
	style="--marker-scale: calc({marker_scale}*var(--map-zoom-scale)); --marker-color: {marker_color}; --pulse-delay: {pulseDelay}"
>
	<div id="marker-icon-wrapper" class="relative w-full h-[calc(var(--marker-scale)*7.1875rem)]">
		<div id="marker-icon" class="w-full h-full">
			<div
				id="outer-marker-icon"
				class="w-full h-full border-[calc(var(--marker-scale)*0.25rem)] border-solid border-(--marker-color) rounded-full flex items-center justify-center overflow-hidden"
			>
				{#if profile_url}
					<img
						class={`h-full w-full rounded-full p-[calc(var(--marker-scale)*${kind === 'venue' ? '0.5875rem' : '0.1875rem'})] object-contain`}
						id="inner-marker-icon"
						src={profile_url}
						alt=""
					/>
				{:else}
					<div
						class="h-full w-full rounded-full p-[calc(var(--marker-scale)*0.1875rem)] bg-white dark:bg-slate-900 flex items-center justify-center"
					>
						<h3
							class="text-slate-700 dark:text-slate-500 font-black text-[calc(var(--marker-scale)*3.75rem)]"
						>
							{name_letter}
						</h3>
					</div>
				{/if}
			</div>
		</div>
		<div id="marker-stats-wrapper">
			{#if cluster_count > 0}
				<div
					id="marker-cluster-badge"
					class="absolute top-[calc(var(--marker-scale)*-0.5rem)] right-[calc(var(--marker-scale)*-1.5rem)]"
				>
					<h3
						class="text-slate-500 dark:text-slate-400 font-bold text-[calc(var(--marker-scale)*2rem)]"
					>
						+{cluster_count}
					</h3>
				</div>
			{:else}
				{#if kind === 'venue'}
					<div
						id="marker-rating-wrapper"
						class="absolute bottom-0 left-0 flex h-[calc(var(--marker-scale)*2.3125rem)] w-[calc(var(--marker-scale)*2.3125rem)] items-center justify-center rounded-full bg-[#fdfdfdFF] p-[calc(var(--marker-scale)*0.1875rem)] dark:bg-[#242424]"
						style="border: calc(var(--marker-scale) * 0.1875rem) solid var(--marker-color);"
					>
						<h3
							class="text-[calc(var(--marker-scale)*0.5625rem)] font-black text-slate-700 dark:text-slate-200"
						>
							{rating_label ?? '—'}
						</h3>
					</div>
				{:else}
					<div
						id="marker-occupation-wrapper"
						class="absolute bottom-0 left-0 w-[calc(var(--marker-scale)*2.3125rem)] h-[calc(var(--marker-scale)*2.3125rem)] rounded-full p-[calc(var(--marker-scale)*0.1875rem)] bg-linear-115 from-[#ff595eFF] from-50% to-[#00B4D8FF] to-50%"
					>
						<div
							class="w-full h-full bg-linear-115 from-[#fdfdfdFF] from-50% to-[#00B4D8FF] to-50% dark:from-[#242424] flex flex-row items-center justify-between px-[calc(var(--marker-scale)*0.1875rem)] rounded-full"
						>
							<div class="mb-[calc(var(--marker-scale)*0.25rem)]">
								<h3
									class="text-[calc(var(--marker-scale)*0.625rem)] text-black dark:text-white font-bold"
								>
									{n_confirmed_attendees}
								</h3>
							</div>
							<div class="mt-[calc(var(--marker-scale)*0.6rem)]">
								<h3 class="text-white font-bold text-[calc(var(--marker-scale)*0.625rem)]">
									{max_occupancy}
								</h3>
							</div>
						</div>
					</div>
				{/if}
				{#if kind !== 'venue'}
					<div
						id="marker-sport-wrapper"
						class="absolute bottom-0 right-0 w-[calc(var(--marker-scale)*2.8125rem)] h-[calc(var(--marker-scale)*2.8125rem)] rounded-full border-[calc(var(--marker-scale)*0.25rem)] border-solid border-[#0065fdFF] bg-[#fdfdfdFF] dark:bg-[#242424] flex justify-center items-center"
					>
						<img src="/{sport}_icon.png" alt="" class="p-[calc(var(--marker-scale)*0.375rem)]" />
					</div>
				{/if}
			{/if}
		</div>
	</div>
	<div id="marker-pin-wrapper" class="w-full flex flex-col items-center justify-center">
		<div
			id="marker-pin-connector"
			class="h-[calc(var(--marker-scale)*1.75125rem)] w-[0.001rem] mb-[calc(var(--marker-scale)*-0.6rem)] ml-[calc(var(--marker-scale)*0.005rem)] border-[calc(var(--marker-scale)*0.125rem)] border-solid border-[#0065fdFF] z-1 rounded-b-[calc(var(--marker-scale)*0.1875rem)]"
		></div>
		<div
			id="marker-pin"
			class="w-[calc(var(--marker-scale)*1.0625rem)] h-[calc(var(--marker-scale)*1.0625rem)] rounded-full bg-[#fdfdfdFF] dark:bg-[#242424] border-[calc(var(--marker-scale)*0.1875rem)] border-solid border-[#0065fdFF]"
		></div>
	</div>
</div>

<style>
	.marker-live #outer-marker-icon {
		animation: live-border-pulse 2.8s ease-in-out infinite;
		animation-delay: var(--pulse-delay);
	}
	.marker-starting_soon #outer-marker-icon {
		animation: soon-border-pulse 2.4s ease-in-out infinite;
		animation-delay: var(--pulse-delay);
	}
	@keyframes live-border-pulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 color-mix(in srgb, var(--marker-color) 18%, transparent);
			filter: brightness(1);
		}
		50% {
			box-shadow:
				0 0 0 calc(var(--marker-scale) * 0.38rem)
					color-mix(in srgb, var(--marker-color) 48%, transparent),
				0 0 calc(var(--marker-scale) * 0.8rem)
					color-mix(in srgb, var(--marker-color) 42%, transparent);
			filter: brightness(1.12);
		}
	}
	@keyframes soon-border-pulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgb(245 158 11 / 0.15);
		}
		50% {
			box-shadow: 0 0 0 calc(var(--marker-scale) * 0.3rem) rgb(245 158 11 / 0.42);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.marker-live #outer-marker-icon,
		.marker-starting_soon #outer-marker-icon {
			animation: none;
		}
	}
</style>
