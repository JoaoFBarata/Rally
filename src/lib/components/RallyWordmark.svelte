<script lang="ts">
	import { onMount } from 'svelte';
	import { initTheme, themeState } from '$lib/theme.svelte';

	type WordmarkSize = 'sm' | 'md' | 'lg';

	let { size = 'sm' }: { size?: WordmarkSize } = $props();

	const sizes: Record<WordmarkSize, string> = {
		sm: 'h-5',
		md: 'h-7',
		lg: 'h-9'
	};

	const currentSize = $derived(sizes[size]);

	const logoSrc = $derived(
		themeState.isDark ? '/r-logo-white.PNG' : '/r-logo-black.PNG'
	);

	onMount(() => {
		initTheme();
	});
</script>

<img
	src={logoSrc}
	alt="Rally"
	class={`${currentSize} w-auto object-contain`}
/>