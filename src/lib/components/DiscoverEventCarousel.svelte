<script lang="ts">
	import type { SportEvent } from '$lib/schema';
	import EventCard from '$lib/components/EventCard.svelte';

	let { events }: { events: SportEvent[] } = $props();
	let carousel: HTMLDivElement;
	let activeIndex = $state(0);

	function updateActiveIndex() {
		if (!carousel) return;
		const cards = Array.from(carousel.children) as HTMLElement[];
		if (cards.length === 0) return;

		let closestIndex = 0;
		let closestDistance = Number.POSITIVE_INFINITY;
		for (const [index, card] of cards.entries()) {
			const distance = Math.abs(card.offsetLeft - carousel.scrollLeft);
			if (distance < closestDistance) {
				closestDistance = distance;
				closestIndex = index;
			}
		}
		activeIndex = closestIndex;
	}

	function goToCard(index: number) {
		const card = carousel?.children[index] as HTMLElement | undefined;
		if (!card) return;
		carousel.scrollTo({ left: card.offsetLeft, behavior: 'smooth' });
	}
</script>

<div class="sm:hidden">
	<div
		bind:this={carousel}
		onscroll={updateActiveIndex}
		class="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
	>
		{#each events as event (event.id)}
			<div class="w-full min-w-full snap-center">
				<EventCard {event} variant="vertical" discoverMobile />
			</div>
		{/each}
	</div>

	{#if events.length > 1}
		<div class="mt-2 flex items-center justify-center gap-2" aria-label="Event carousel pages">
			{#each events as event, index (event.id)}
				<button
					type="button"
					onclick={() => goToCard(index)}
					class={`h-2 rounded-full transition-all duration-300 ${
						activeIndex === index
							? 'w-6 bg-blue-600'
							: 'w-2 bg-slate-300 hover:bg-slate-400 dark:bg-slate-700 dark:hover:bg-slate-600'
					}`}
					aria-label={`Show event ${index + 1} of ${events.length}`}
					aria-current={activeIndex === index ? 'true' : undefined}
				></button>
			{/each}
		</div>
	{/if}
</div>

<div class="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-3">
	{#each events as event (event.id)}
		<EventCard {event} variant="vertical" />
	{/each}
</div>
