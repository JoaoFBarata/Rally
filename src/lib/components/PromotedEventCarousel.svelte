<script lang="ts">
	import type { SportEvent } from '$lib/schema';
	import EventCard from '$lib/components/EventCard.svelte';

	let {
		events,
		cardVariant = 'default',
		compactHero = false,
		miniHero = false,
		heroCtaLabel = 'View event'
	} = $props<{
		events: SportEvent[];
		cardVariant?: 'default' | 'profile' | 'hero';
		compactHero?: boolean;
		miniHero?: boolean;
		heroCtaLabel?: string;
	}>();
	let currentIndex = $state(0);
	let currentEvent = $derived(events.length ? events[currentIndex % events.length] : null);

	function showPrevious() {
		if (!events.length) return;
		currentIndex = (currentIndex - 1 + events.length) % events.length;
	}

	function showNext() {
		if (!events.length) return;
		currentIndex = (currentIndex + 1) % events.length;
	}

	$effect(() => {
		const eventCount = events.length;
		if (!eventCount) {
			currentIndex = 0;
			return;
		}
		if (currentIndex >= eventCount) currentIndex = 0;
		if (eventCount === 1) return;

		const timer = window.setInterval(showNext, 6500);
		return () => window.clearInterval(timer);
	});
</script>

{#if currentEvent}
	<div class="space-y-3">
		{#key currentEvent.id}
			<EventCard
				event={currentEvent}
				variant={cardVariant}
				{compactHero}
				{miniHero}
				{heroCtaLabel}
			/>
		{/key}

		{#if events.length > 1}
			<div class="flex items-center justify-between gap-3">
				<button
					type="button"
					onclick={showPrevious}
					class="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-black text-blue-700 transition hover:bg-blue-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300"
					aria-label="Previous promoted event">Previous</button
				>

				<div
					class="flex items-center gap-1.5"
					aria-label={`Promoted event ${currentIndex + 1} of ${events.length}`}
				>
					{#each events as event, index (event.id)}
						<button
							type="button"
							onclick={() => (currentIndex = index)}
							class={`h-2 rounded-full transition-all ${index === currentIndex ? 'w-6 bg-blue-600' : 'w-2 bg-blue-200 dark:bg-blue-900'}`}
							aria-label={`Show promoted event ${index + 1}`}
						></button>
					{/each}
				</div>

				<button
					type="button"
					onclick={showNext}
					class="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-black text-blue-700 transition hover:bg-blue-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300"
					aria-label="Next promoted event">Next</button
				>
			</div>
		{/if}
	</div>
{/if}
