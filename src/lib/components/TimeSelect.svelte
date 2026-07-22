<script lang="ts">
	import { i18n } from '$lib/services/i18n.svelte';

	let {
		id,
		value = $bindable(''),
		placeholder = '',
		flush = false,
		invalid = false
	}: {
		id?: string;
		value?: string;
		placeholder?: string;
		flush?: boolean;
		invalid?: boolean;
	} = $props();

	const timeOptions = Array.from({ length: 96 }, (_, index) => {
		const totalMinutes = index * 15;
		const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
		const minutes = String(totalMinutes % 60).padStart(2, '0');

		return `${hours}:${minutes}`;
	});
</script>

<select
	{id}
	bind:value
	aria-invalid={invalid}
	class={`${flush ? '' : 'mt-2'} w-full min-w-0 rounded-2xl border px-3 py-2.5 text-sm text-slate-950 outline-none transition sm:px-4 sm:py-3 sm:text-base ${
		invalid
			? 'border-red-400 bg-red-50/70 focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-100 dark:border-red-700 dark:bg-red-950/30 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-red-950'
			: 'border-slate-200 bg-slate-50 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-slate-500 dark:focus:bg-slate-800 dark:focus:ring-slate-700'
	}`}
>
	<option value="" disabled>{placeholder || i18n.t('select_time')}</option>
	{#each timeOptions as option (option)}
		<option value={option}>{option}</option>
	{/each}
</select>
