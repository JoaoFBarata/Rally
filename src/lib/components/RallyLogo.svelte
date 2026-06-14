<!-- src/lib/components/RallyLogo.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { initTheme, themeState } from '$lib/theme.svelte';

	type LogoSize = 'sm' | 'md' | 'lg';

	let { size = 'md', href = '/' }: { size?: LogoSize; href?: string } = $props();

	const sizes: Record<LogoSize, string> = {
		sm: 'h-8',
		md: 'h-12',
		lg: 'h-16'
	};

	const currentSize = $derived(sizes[size]);

	onMount(() => {
		initTheme();
	});

	const logoSrc = $derived(
		$themeState ? '/rally-logo-white.png' : '/rally-logo-black.png'
	);
</script>

<a href={href} class="inline-flex items-center">
	<img
		src={logoSrc}
		alt="Rally"
		class={`${currentSize} w-auto object-contain`}
	/>
</a>