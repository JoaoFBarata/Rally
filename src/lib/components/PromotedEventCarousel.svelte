<script lang="ts">
	import type { SportEvent } from '$lib/schema';
	import EventCard from '$lib/components/EventCard.svelte';

	let {
		events,
		cardVariant = 'default',
		compactHero = false,
		miniHero = false,
		heroCtaLabel = 'View event',
		ariaLabel = 'Event carousel',
		autoAdvanceMs = 6500
	} = $props<{
		events: SportEvent[];
		cardVariant?: 'default' | 'profile' | 'hero';
		compactHero?: boolean;
		miniHero?: boolean;
		heroCtaLabel?: string;
		ariaLabel?: string;
		autoAdvanceMs?: number;
	}>();
	let currentIndex = $state(0);
	let touchStartX = 0;
	let touchStartY = 0;
	let dragOffset = $state(0);
	let isDragging = $state(false);
	let isSettling = $state(false);
	let currentEvent = $derived(events.length ? events[currentIndex % events.length] : null);
	let previousEvent = $derived(events.length > 1 ? events[(currentIndex - 1 + events.length) % events.length] : null);
	let nextEvent = $derived(events.length > 1 ? events[(currentIndex + 1) % events.length] : null);
	let dotIndexes = $derived(visibleDotIndexes());

	function showPrevious() {
		if (!events.length) return;
		currentIndex = (currentIndex - 1 + events.length) % events.length;
	}

	function showNext() {
		if (!events.length) return;
		currentIndex = (currentIndex + 1) % events.length;
	}

	function goToIndex(index: number) {
		if (!events.length) return;
		currentIndex = (index + events.length) % events.length;
	}

	function handleTouchStart(event: TouchEvent) {
		const touch = event.changedTouches[0];
		touchStartX = touch.clientX;
		touchStartY = touch.clientY;
		dragOffset = 0;
		isDragging = true;
	}

	function handleTouchMove(event: TouchEvent) {
		if (!isDragging || events.length < 2) return;

		const touch = event.changedTouches[0];
		const diffX = touch.clientX - touchStartX;
		const diffY = touch.clientY - touchStartY;

		if (Math.abs(diffX) < 8) return;
		if (Math.abs(diffY) > Math.abs(diffX) * 1.15) {
			dragOffset = 0;
			return;
		}

		dragOffset = Math.max(-120, Math.min(120, diffX));
	}

	function handleTouchEnd(event: TouchEvent) {
		const touch = event.changedTouches[0];
		const diffX = touch.clientX - touchStartX;
		const diffY = touch.clientY - touchStartY;

		isDragging = false;

		if (Math.abs(diffX) < 42 || Math.abs(diffX) < Math.abs(diffY) * 1.25) {
			dragOffset = 0;
			return;
		}

		const direction = diffX < 0 ? -1 : 1;
		isSettling = true;
		dragOffset = direction * window.innerWidth;

		window.setTimeout(() => {
			if (direction < 0) showNext();
			else showPrevious();

			isSettling = false;
			dragOffset = 0;
		}, 220);
	}

	function visibleDotIndexes() {
		if (events.length <= 7) return Array.from({ length: events.length }, (_, index) => index);

		const indexes = new Set<number>([
			0,
			events.length - 1,
			currentIndex - 1,
			currentIndex,
			currentIndex + 1
		]);

		return [...indexes]
			.map((index) => (index + events.length) % events.length)
			.sort((a, b) => a - b);
	}

	$effect(() => {
		const eventCount = events.length;
		if (!eventCount) {
			currentIndex = 0;
			return;
		}
		if (currentIndex >= eventCount) currentIndex = 0;
		if (eventCount === 1) return;

		const timer = window.setInterval(showNext, autoAdvanceMs);
		return () => window.clearInterval(timer);
	});
</script>

{#if currentEvent}
	<div class="space-y-3" role="region" aria-label={ariaLabel}>
		<div
			class="relative overflow-visible"
			role="group"
			aria-label={`${ariaLabel} cards`}
			style="touch-action: pan-y;"
			ontouchstart={handleTouchStart}
			ontouchmove={handleTouchMove}
			ontouchend={handleTouchEnd}
		>
			<div class="block overflow-hidden md:hidden">
				<div
					class="flex will-change-transform"
					class:transition-transform={!isDragging && isSettling}
					class:duration-200={!isDragging && isSettling}
					style={`transform: translateX(calc(-100% + ${dragOffset}px));`}
				>
					<div class="w-full shrink-0 px-1">
						{#if previousEvent}
							<EventCard
								event={previousEvent}
								variant={cardVariant}
								{compactHero}
								{miniHero}
								{heroCtaLabel}
							/>
						{/if}
					</div>
					<div class="w-full shrink-0 px-1">
						<EventCard
							event={currentEvent}
							variant={cardVariant}
							{compactHero}
							{miniHero}
							{heroCtaLabel}
						/>
					</div>
					<div class="w-full shrink-0 px-1">
						{#if nextEvent}
							<EventCard
								event={nextEvent}
								variant={cardVariant}
								{compactHero}
								{miniHero}
								{heroCtaLabel}
							/>
						{/if}
					</div>
				</div>
			</div>

			<div class="relative hidden md:mx-auto md:block md:max-w-4xl md:px-14">
				<div
					class="overflow-hidden rounded-[2rem]"
				>
					<div
					class="flex will-change-transform transition-transform duration-500 ease-out"
					style={`transform: translateX(calc(-100% * ${currentIndex}));`}
					>
						{#each events as event (event.id)}
							<div class="w-full shrink-0">
								<EventCard
									event={event}
									variant={cardVariant}
									{compactHero}
									{miniHero}
									{heroCtaLabel}
								/>
							</div>
						{/each}
					</div>
				</div>
			</div>

			{#if events.length > 1}
				<button
					type="button"
					onclick={showPrevious}
					class="absolute left-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-slate-700 shadow-md ring-1 ring-slate-200 transition hover:scale-105 hover:bg-slate-50 active:scale-95 dark:bg-slate-900/95 dark:text-slate-200 dark:ring-slate-800 dark:hover:bg-slate-800 md:grid"
					aria-label="Previous event"
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5" aria-hidden="true">
						<path d="m15 18-6-6 6-6" />
					</svg>
				</button>

				<button
					type="button"
					onclick={showNext}
					class="absolute right-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-slate-700 shadow-md ring-1 ring-slate-200 transition hover:scale-105 hover:bg-slate-50 active:scale-95 dark:bg-slate-900/95 dark:text-slate-200 dark:ring-slate-800 dark:hover:bg-slate-800 md:grid"
					aria-label="Next event"
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5" aria-hidden="true">
						<path d="m9 18 6-6-6-6" />
					</svg>
				</button>
			{/if}
		</div>

		{#if events.length > 1}
			<div class="flex items-center justify-center gap-1.5" aria-label={`Event ${currentIndex + 1} of ${events.length}`}>
				{#each dotIndexes as index, dotPosition (index)}
					{#if dotPosition > 0 && dotIndexes[dotPosition - 1] < index - 1}
						<span class="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
					{/if}
					<button
						type="button"
						onclick={() => goToIndex(index)}
						class={`h-2 rounded-full transition-all ${index === currentIndex ? 'w-6 bg-blue-600' : 'w-2 bg-blue-200 dark:bg-blue-900'}`}
						aria-label={`Show event ${index + 1}`}
					></button>
				{/each}
			</div>
		{/if}
	</div>
{/if}
