<script lang="ts">
	import { i18n } from '$lib/services/i18n.svelte';

	let {
		text,
		initialLines = 3,
		stepLines = 3,
		maxPreviewChars = 160,
		class: className = ''
	} = $props<{
		text: string;
		initialLines?: number;
		stepLines?: number;
		maxPreviewChars?: number;
		class?: string;
	}>();

	let visibleLines = $state(3);
	let fullyExpanded = $state(false);
	let initialized = $state(false);
	let shouldClamp = $derived(text.length > maxPreviewChars);
	let clampStyle = $derived(
		fullyExpanded || !shouldClamp
			? ''
			: `display: -webkit-box; -webkit-line-clamp: ${visibleLines}; -webkit-box-orient: vertical; overflow: hidden;`
	);

	$effect(() => {
		if (!initialized) {
			visibleLines = initialLines;
			initialized = true;
		}
	});

	function showMore() {
		if (fullyExpanded) return;
		if (visibleLines >= initialLines + stepLines * 2) {
			fullyExpanded = true;
			return;
		}
		visibleLines += stepLines;
	}
</script>

<div>
	<p class={className} style={clampStyle}>{text}</p>
	{#if shouldClamp && !fullyExpanded}
		<button
			type="button"
			onclick={showMore}
			class="mt-1 text-xs font-black text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
		>
			{i18n.t('show_more')}
		</button>
	{/if}
</div>
