<script lang="ts">
	type LogoSize = 'sm' | 'md' | 'lg';

	let { size = 'md', href = '/' }: { size?: LogoSize; href?: string } = $props();

	const sizes: Record<LogoSize, { icon: string; text: string }> = {
		sm: {
			icon: 'h-9 w-9 text-lg',
			text: 'text-xl'
		},
		md: {
			icon: 'h-12 w-12 text-2xl',
			text: 'text-3xl'
		},
		lg: {
			icon: 'h-16 w-16 text-4xl',
			text: 'text-5xl'
		}
	};

	const currentSize = $derived(sizes[size]);
</script>

<a href={href} class="inline-flex items-center gap-1">
	<div
		class={`flex ${currentSize.icon} items-center justify-center rounded-2xl bg-blue-600 font-black text-white shadow-lg shadow-blue-600/25`}
	>
		R
	</div>

	<span class={`${currentSize.text} font-bold tracking-tight text-slate-950`}>
		ally
	</span>
</a>