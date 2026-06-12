<script lang="ts">
	import { onMount } from 'svelte';
	import { applyTheme, initTheme, themeState } from '$lib/theme.svelte';

	onMount(() => {
		initTheme();
	});

	function toggleTheme() {
		applyTheme(!themeState.isDark);
	}
</script>

<button
	type="button"
	onclick={toggleTheme}
	aria-label="Toggle dark mode"
	class={`relative flex h-8 w-14 items-center rounded-full border transition ${
		themeState.isDark
			? 'border-blue-500 bg-blue-600'
			: 'border-slate-300 bg-slate-200'
	}`}
>
	<span
		class={`absolute flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs shadow-md transition-transform ${
			themeState.isDark ? 'translate-x-7' : 'translate-x-1'
		}`}
	>
		{themeState.isDark ? '🌙' : '☀️'}
	</span>
</button>