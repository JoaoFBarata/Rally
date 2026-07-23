<script lang="ts">
	import { Bookmark } from '@lucide/svelte';
	import type { BookmarkKind } from '$lib/services/bookmark.service';
	import { bookmarkState } from '$lib/services/bookmark-state.svelte';

	let {
		kind,
		id,
		class: className = ''
	}: { kind: BookmarkKind; id: string; class?: string } = $props();

	let saved = $derived(bookmarkState.isSaved(kind, id));

	function handleClick(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		bookmarkState.toggle(kind, id);
	}
</script>

<button
	type="button"
	onclick={handleClick}
	aria-label={saved ? 'Remove bookmark' : 'Add bookmark'}
	aria-pressed={saved}
	class={`z-20 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/90 text-slate-700 shadow-md backdrop-blur transition hover:scale-105 hover:text-amber-600 dark:bg-slate-950/85 dark:text-slate-200 ${className}`}
>
	<Bookmark class="h-4 w-4" fill={saved ? 'currentColor' : 'none'} />
</button>
