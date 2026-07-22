<script lang="ts">
	import { getProfileAvatarsForGender, profileAvatarOptions } from '$lib/avatar-options';
	import ImageCropperModal from '$lib/components/ImageCropperModal.svelte';
	import type { ProfileGender } from '$lib/schema';
	import { i18n } from '$lib/services/i18n.svelte';
	import { themeState } from '$lib/theme.svelte';

	let {
		onComplete,
		onPhotoComplete
	}: {
		onComplete: (params: { gender: ProfileGender; avatar: string }) => Promise<void>;
		onPhotoComplete: (file: File) => Promise<void>;
	} = $props();

	const genderOptions: {
		value: ProfileGender | 'all';
		labelKey: string;
		icon: string;
	}[] = [
		{ value: 'all', labelKey: 'avatar_filter_all', icon: '\u2726' },
		{ value: 'female', labelKey: 'avatar_filter_female', icon: '\u2640' },
		{ value: 'male', labelKey: 'avatar_filter_male', icon: '\u2642' },
		{ value: 'neutral', labelKey: 'avatar_filter_neutral', icon: '\u25C7' }
	];

	let selectedFilter = $state<ProfileGender | 'all'>('all');
	let selectedAvatar = $state('');
	let saving = $state(false);
	let error = $state('');
	let fileInput = $state<HTMLInputElement | null>(null);
	let cropperImageSrc = $state('');
	let showCropper = $state(false);

	const visibleAvatars = $derived(
		selectedFilter === 'all' ? profileAvatarOptions : getProfileAvatarsForGender(selectedFilter)
	);

	function chooseFilter(filter: ProfileGender | 'all') {
		selectedFilter = filter;
		error = '';
	}

	async function saveAvatar() {
		if (!selectedAvatar || saving) return;
		const avatar = profileAvatarOptions.find((option) => option.src === selectedAvatar);
		if (!avatar) return;

		saving = true;
		error = '';

		try {
			await onComplete({ gender: avatar.gender, avatar: selectedAvatar });
		} catch (err) {
			console.error('Avatar onboarding error:', err);
			error = i18n.t('could_not_update_profile_photo');
		} finally {
			saving = false;
		}
	}

	function chooseOwnPhoto(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			cropperImageSrc = String(reader.result ?? '');
			showCropper = true;
		};
		reader.readAsDataURL(file);
	}

	async function saveOwnPhoto(file: File) {
		showCropper = false;
		saving = true;
		error = '';
		try {
			await onPhotoComplete(file);
		} catch (err) {
			console.error('Avatar photo onboarding error:', err);
			error = i18n.t('could_not_update_profile_photo');
		} finally {
			if (fileInput) fileInput.value = '';
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
			<img src="/rally-logo-white.png" alt="Rally" class="h-7 w-auto object-contain sm:h-9" />
			<h2 id="avatar-onboarding-title" class="mt-3 text-2xl font-black tracking-tight sm:text-4xl">
				{i18n.t('choose_avatar_title')}
			</h2>
			<p class="mt-2 max-w-xl text-sm font-semibold leading-6 text-blue-50 sm:text-base">
				{i18n.t('choose_avatar_intro')}
			</p>
		</div>

		<div class="p-4 sm:p-8">
			<div
				class="flex gap-3 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				{#each genderOptions as option (option.value)}
					<button
						type="button"
						onclick={() => chooseFilter(option.value)}
						aria-pressed={selectedFilter === option.value}
						class={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-black transition sm:gap-2 sm:px-4 sm:text-sm ${
							selectedFilter === option.value
								? 'border-blue-500 bg-blue-50 text-blue-700 shadow-[inset_0_0_0_1px_rgb(59_130_246_/_0.45)] dark:bg-blue-950/50 dark:text-blue-200'
								: 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50/60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-700'
						}`}
					>
						<span
							class="grid h-5 w-5 place-items-center rounded-full bg-current/10 text-base leading-none sm:h-6 sm:w-6 sm:text-lg"
							aria-hidden="true">{option.icon}</span
						>
						<span>{i18n.t(option.labelKey)}</span>
					</button>
				{/each}
			</div>

			<div
				class="mt-4 grid max-h-[46dvh] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5"
			>
				{#each visibleAvatars as avatar (avatar.id)}
					<button
						type="button"
						onclick={() => (selectedAvatar = avatar.src)}
						aria-pressed={selectedAvatar === avatar.src}
						aria-label={i18n.t(avatar.labelKey)}
						class={`aspect-square overflow-hidden rounded-full border bg-transparent p-1 transition duration-200 sm:p-1.5 ${
							selectedAvatar === avatar.src
								? 'border-blue-600 shadow-md shadow-blue-600/10 ring-2 ring-inset ring-blue-600'
								: 'border-slate-200 hover:border-blue-300 dark:border-slate-700 dark:hover:border-blue-700'
						}`}
					>
						<img src={avatar.src} alt="" class="h-full w-full rounded-full object-cover" />
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

			<div class="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
				<div class="flex items-center justify-between gap-3">
					<p class="min-w-0 text-xs font-bold text-slate-500 dark:text-slate-400">
						{i18n.t('avatar_options_count', { count: visibleAvatars.length })}
					</p>
					<div class="flex shrink-0 items-center gap-2">
						<button
							type="button"
							onclick={() => fileInput?.click()}
							disabled={saving}
							aria-label={i18n.t('use_own_photo')}
							title={i18n.t('use_own_photo')}
							class="grid h-11 w-11 place-items-center rounded-xl border border-blue-200 text-blue-700 transition hover:bg-blue-50 active:scale-95 disabled:opacity-45 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40"
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.2"
								class="h-5 w-5"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.4l1.15-1.5h5.9L16.1 6h1.4A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
								/>
								<circle cx="12" cy="12.5" r="3.25" />
							</svg>
						</button>
						<button
							type="button"
							onclick={saveAvatar}
							disabled={!selectedAvatar || saving}
							class="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:px-7 sm:text-base"
						>
							{saving ? i18n.t('saving') : i18n.t('confirm_avatar')}
						</button>
					</div>
				</div>
				<input
					bind:this={fileInput}
					onchange={chooseOwnPhoto}
					type="file"
					accept="image/*"
					class="hidden"
				/>
			</div>
		</div>
	</div>
</div>

{#if showCropper}
	<ImageCropperModal
		imageSrc={cropperImageSrc}
		shape="circle"
		aspectRatio={1}
		onConfirm={(file) => void saveOwnPhoto(file)}
		onCancel={() => {
			showCropper = false;
			if (fileInput) fileInput.value = '';
		}}
	/>
{/if}
