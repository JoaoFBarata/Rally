<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { i18n } from '$lib/services/i18n.svelte';

	let { organizationId, active }: { organizationId: string; active: 'event' | 'tournament' } = $props();

	function selectType(type: 'event' | 'tournament') {
		if (type === active) return;
		if (type === 'event') {
			void goto(resolve(`/organizations/${organizationId}/events/create`), { replaceState: true });
			return;
		}
		void goto(resolve(`/organizations/${organizationId}/tournaments/create`), { replaceState: true });
	}
</script>

<div class="relative grid h-12 w-full max-w-sm grid-cols-2 rounded-2xl border border-slate-200 bg-slate-100 p-1 shadow-inner dark:border-slate-700 dark:bg-slate-800">
	<span
		aria-hidden="true"
		class={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-white shadow-md ring-1 ring-slate-200/80 transition-transform duration-300 ease-out dark:bg-slate-700 dark:ring-slate-600 ${active === 'tournament' ? 'translate-x-full' : 'translate-x-0'}`}
	></span>
	<button type="button" onclick={() => selectType('event')} aria-pressed={active === 'event'} class={`relative z-10 rounded-xl px-3 text-sm font-black transition-colors ${active === 'event' ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'}`}>
		{i18n.t('create_event')}
	</button>
	<button type="button" onclick={() => selectType('tournament')} aria-pressed={active === 'tournament'} class={`relative z-10 rounded-xl px-3 text-sm font-black transition-colors ${active === 'tournament' ? 'text-purple-700 dark:text-purple-300' : 'text-slate-500 dark:text-slate-400'}`}>
		{i18n.t('create_tournament')}
	</button>
</div>
