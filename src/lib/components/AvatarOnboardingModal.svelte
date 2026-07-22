<script lang="ts">
	import { getProfileAvatarsForGender } from '$lib/avatar-options';
	import type { ProfileGender } from '$lib/schema';
	import { i18n } from '$lib/services/i18n.svelte';

	let {
		onComplete
	}: {
		onComplete: (params: { gender: ProfileGender; avatar: string }) => Promise<void>;
	} = $props();

	const genderOptions: { value: ProfileGender; labelKey: string }[] = [
		{ value: 'female', labelKey: 'gender_female' },
		{ value: 'male', labelKey: 'gender_male' },
		{ value: 'neutral', labelKey: 'gender_neutral' }
	];

	let selectedGender = $state<ProfileGender | null>(null);
	let selectedAvatar = $state('');
	let saving = $state(false);
	let error = $state('');

	const visibleAvatars = $derived(selectedGender ? getProfileAvatarsForGender(selectedGender) : []);

	function chooseGender(gender: ProfileGender) {
		selectedGender = gender;
		selectedAvatar = '';
		error = '';
	}

	async function saveAvatar() {
		if (!selectedGender || !selectedAvatar || saving) return;

		saving = true;
		error = '';

		try {
			await onComplete({ gender: selectedGender, avatar: selectedAvatar });
		} catch (err) {
			console.error('Avatar onboarding error:', err);
			error = err instanceof Error ? err.message : i18n.t('could_not_update_profile_photo');
		} finally {
			saving = false;
		}
	}
</script>

<div
	class="fixed inset-0 z-[260] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-3 backdrop-blur-md sm:p-6"
	role="dialog"
	aria-modal="true"
	aria-labelledby="avatar-onboarding-title"
>
	<div
		class="my-auto w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-2xl shadow-slate-950/30 dark:border-slate-700 dark:bg-slate-900"
	>
		<div
			class="bg-gradient-to-br from-blue-600 via-cyan-500 to-emerald-400 px-5 py-6 text-white sm:px-8 sm:py-8"
		>
			<p class="text-xs font-black uppercase tracking-[0.24em] text-blue-50">Rally</p>
			<h2 id="avatar-onboarding-title" class="mt-2 text-2xl font-black tracking-tight sm:text-4xl">
				{i18n.t('choose_avatar_title')}
			</h2>
			<p class="mt-2 max-w-xl text-sm font-semibold leading-6 text-blue-50 sm:text-base">
				{i18n.t('choose_avatar_intro')}
			</p>
		</div>

		<div class="p-4 sm:p-8">
			<div class="grid gap-2 sm:grid-cols-3">
				{#each genderOptions as option (option.value)}
					<button
						type="button"
						onclick={() => chooseGender(option.value)}
						aria-pressed={selectedGender === option.value}
						class={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${
							selectedGender === option.value
								? 'border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-600 dark:bg-blue-950/50 dark:text-blue-200'
								: 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50/60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-700'
						}`}
					>
						{i18n.t(option.labelKey)}
					</button>
				{/each}
			</div>

			{#if selectedGender}
				<div
					class="mt-5 grid max-h-[46dvh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4"
				>
					{#each visibleAvatars as avatar (avatar.id)}
						<button
							type="button"
							onclick={() => (selectedAvatar = avatar.src)}
							aria-pressed={selectedAvatar === avatar.src}
							aria-label={i18n.t(avatar.labelKey)}
							class={`aspect-square overflow-hidden rounded-3xl border bg-slate-50 p-2 transition duration-200 dark:bg-slate-800 ${
								selectedAvatar === avatar.src
									? 'border-blue-600 shadow-lg shadow-blue-600/15 ring-4 ring-blue-600'
									: 'border-slate-200 hover:border-blue-300 dark:border-slate-700 dark:hover:border-blue-700'
							}`}
						>
							<img src={avatar.src} alt="" class="h-full w-full object-cover" />
						</button>
					{/each}
				</div>
			{:else}
				<div
					class="mt-5 rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400"
				>
					{i18n.t('choose_gender_first')}
				</div>
			{/if}

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
					{selectedGender
						? i18n.t('avatar_options_count', { count: visibleAvatars.length })
						: i18n.t('avatar_required')}
				</p>
				<button
					type="button"
					onclick={saveAvatar}
					disabled={!selectedGender || !selectedAvatar || saving}
					class="rounded-2xl bg-blue-600 px-7 py-3.5 font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
				>
					{saving ? i18n.t('saving') : i18n.t('save_profile')}
				</button>
			</div>
		</div>
	</div>
</div>
