<script lang="ts">
	import type { Sport } from '$lib/schema';
	import { i18n } from '$lib/services/i18n.svelte';
	import { formatSport } from '$lib/utils/format.utils';

	let {
		onComplete
	}: {
		onComplete: (sports: Sport[]) => Promise<void>;
	} = $props();

	const availableSports: Sport[] = [
		'football',
		'padel',
		'basketball',
		'running',
		'gym',
		'tennis',
		'cycling',
		'volleyball',
		'bowling',
		'snooker',
		'golf',
		'swimming',
		'hiking',
		'yoga',
		'surf',
		'pingpong',
		'rugby',
		'americanfootball',
		'other'
	];

	let selectedSports = $state<Sport[]>([]);
	let saving = $state(false);
	let error = $state('');

	function toggleSport(sport: Sport) {
		selectedSports = selectedSports.includes(sport)
			? selectedSports.filter((item) => item !== sport)
			: [...selectedSports, sport];
	}

	async function saveSports() {
		if (selectedSports.length === 0 || saving) return;

		saving = true;
		error = '';

		try {
			await onComplete(selectedSports);
		} catch (err) {
			console.error('Sports onboarding error:', err);
			error = i18n.t('could_not_save_sports');
		} finally {
			saving = false;
		}
	}
</script>

<div
	class="fixed inset-0 z-[250] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-3 backdrop-blur-md sm:p-6"
	role="dialog"
	aria-modal="true"
	aria-labelledby="sports-onboarding-title"
>
	<div
		class="my-auto w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-2xl shadow-slate-950/30 dark:border-slate-700 dark:bg-slate-900"
	>
		<div
			class="bg-gradient-to-br from-blue-600 via-blue-600 to-cyan-500 px-5 py-6 text-white sm:px-8 sm:py-8"
		>
			<img src="/rally-logo-white.png" alt="Rally" class="h-7 w-auto object-contain sm:h-9" />
			<h2 id="sports-onboarding-title" class="mt-3 text-2xl font-black tracking-tight sm:text-4xl">
				{i18n.t('choose_fav_sports_title')}
			</h2>
			<p class="mt-2 max-w-xl text-sm font-semibold leading-6 text-blue-50 sm:text-base">
				{i18n.t('events_match_pref_msg')}
			</p>
		</div>

		<div class="p-4 sm:p-8">
			<div
				class="grid max-h-[52dvh] grid-cols-2 gap-3 overflow-y-auto px-0.5 py-0.5 pr-1 sm:grid-cols-3 lg:grid-cols-4"
			>
				{#each availableSports as sport (sport)}
					<button
						type="button"
						onclick={() => toggleSport(sport)}
						aria-pressed={selectedSports.includes(sport)}
						class={`flex min-w-0 items-center gap-2.5 rounded-2xl border p-3 text-left transition duration-200 sm:p-4 ${
							selectedSports.includes(sport)
								? 'border-blue-500 bg-blue-50 text-blue-700 shadow-[inset_0_0_0_1px_rgb(59_130_246_/_0.45)] dark:bg-blue-950/50 dark:text-blue-200'
								: 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50/60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-700'
						}`}
					>
						<span class="grid h-11 w-11 shrink-0 place-items-center">
							<img src="/{sport}_icon.png" alt="" class="h-10 w-10 object-contain" />
						</span>
						<span class="truncate text-xs font-black sm:text-sm">{formatSport(sport)}</span>
					</button>
				{/each}
			</div>

			{#if error}
				<p
					class="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:bg-red-950/50 dark:text-red-300"
				>
					{error}
				</p>
			{/if}

			<div
				class="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800"
			>
				<p class="text-xs font-bold text-slate-500 dark:text-slate-400">
					{selectedSports.length}
					{i18n.t('sports')}
				</p>
				<button
					type="button"
					onclick={saveSports}
					disabled={selectedSports.length === 0 || saving}
					class="rounded-2xl bg-blue-600 px-7 py-3.5 font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
				>
					{saving ? i18n.t('saving') : i18n.t('save_profile')}
				</button>
			</div>
		</div>
	</div>
</div>
