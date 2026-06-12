<script lang="ts">
	type LogoSize = 'sm' | 'md' | 'lg';

	let { size = 'md', href = '/' }: { size?: LogoSize; href?: string } = $props();

	const sizes: Record<LogoSize, string> = {
		sm: 'h-8',
		md: 'h-12',
		lg: 'h-16'
	};

	const currentSize = $derived(sizes[size]);
</script>

<a href={href} class="inline-flex items-center">
	<img
		src="/rally-logo.png"
		alt="Rally"
		class={`${currentSize} w-auto object-contain`}
	/>
</a>