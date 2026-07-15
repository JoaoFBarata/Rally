<script lang="ts">
	type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

	let {
		photoURL = null,
		displayName = '',
		email = '',
		size = 'md',
		plain = false
	}: {
		photoURL?: string | null;
		displayName?: string | null;
		email?: string | null;
		size?: AvatarSize;
		plain?: boolean;
	} = $props();

	const sizes: Record<AvatarSize, string> = {
		sm: 'h-9 w-9 text-sm',
		md: 'h-11 w-11 text-base',
		lg: 'h-14 w-14 text-xl',
		xl: 'h-20 w-20 text-3xl'
	};

	const currentSize = $derived(sizes[size]);
	const ringClasses = $derived(plain ? '' : 'ring-2 ring-white dark:ring-slate-800');

	function getInitial() {
		const source = displayName || email || '?';
		return source.trim().slice(0, 1).toUpperCase();
	}
</script>

{#if photoURL}
	<img
		src={photoURL}
		alt={displayName || 'User profile'}
		referrerpolicy="no-referrer"
		class={`${currentSize} rounded-full object-cover ${ringClasses}`}
	/>
{:else}
	<div
		class={`${currentSize} flex items-center justify-center rounded-full bg-blue-100 font-black text-blue-600 dark:bg-blue-950 dark:text-blue-300 ${ringClasses}`}
	>
		{getInitial()}
	</div>
{/if}
