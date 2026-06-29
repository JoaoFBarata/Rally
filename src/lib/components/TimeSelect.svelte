<script lang="ts">
	let {
		id,
		value = $bindable(''),
		placeholder = 'Select time',
		flush = false
	}: {
		id?: string;
		value?: string;
		placeholder?: string;
		flush?: boolean;
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
	class={`${flush ? '' : 'mt-2'} w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-950 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-slate-500 dark:focus:bg-slate-800 dark:focus:ring-slate-700 sm:px-4`}
>
	<option value="" disabled>{placeholder}</option>
	{#each timeOptions as option}
		<option value={option}>{option}</option>
	{/each}
</select>
