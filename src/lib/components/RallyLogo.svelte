<!-- src/lib/components/RallyLogo.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { initTheme, themeState } from '$lib/theme.svelte';

	type LogoSize = 'xs' | 'sm' | 'compact' | 'md' | 'lg';

	let {
		size = 'md',
		href = '/',
		mark = false,
		additionalClasses = ''
	}: { size?: LogoSize; href?: string; mark?: boolean; additionalClasses?: string } = $props();

	const sizes: Record<LogoSize, string> = {
		xs: 'h-7',
		sm: 'h-8',
		compact: 'h-11',
		md: 'h-12',
		lg: 'h-16'
	};

	const currentSize = $derived(sizes[size]);

	onMount(() => {
		initTheme();
	});

	const logoSrc = $derived(
		mark
			? $themeState
				? '/r-logo-white.PNG'
				: '/r-logo-black.PNG'
			: $themeState
				? '/rally-logo-white.png'
				: '/rally-logo-black.png'
	);
</script>

<a {href} class={`flex flex-row w-fit items-center ${additionalClasses}`}>
	<img src={logoSrc} alt="Rally Logo" class={`${currentSize} w-auto object-contain`} />
</a>
