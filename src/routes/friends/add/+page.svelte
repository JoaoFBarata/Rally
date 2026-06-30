<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import { authState } from '$lib/auth.svelte';
	import { sendFriendRequestByTag } from '$lib/services/social.service';
	import { getUserProfile } from '$lib/services/user.service';
	import type { UserProfile } from '$lib/schema';
	import { createAppUrl } from '$lib/utils/app-url';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';

	let sending = $state(false);
	let autoSent = $state(false);
	let loadingProfile = $state(false);
	let error = $state('');
	let success = $state('');
	let tag = $state('');
	let sourceTag = $state('');
	let currentProfile = $state<UserProfile | null>(null);
	let qrCodeDataUrl = $state('');
	let qrCodeLink = $state('');
	let showQr = $state(false);

	async function goBack() {
		await goto(resolve('/dashboard'));
	}

	async function sendInvite(targetTag = tag.trim(), automatic = false) {
		const currentUser = authState.user;
		const cleanTag = targetTag.trim().replace(/^@/, '');

		if (!currentUser || !cleanTag || sending) return;

		sending = true;
		error = '';
		success = '';

		try {
			const target = await sendFriendRequestByTag({
				fromUserId: currentUser.uid,
				rallyTag: cleanTag
			});

			success = `Friend request sent to ${target.displayName}.`;
			tag = '';
			if (automatic) autoSent = true;
		} catch (err) {
			console.error('Friend request error:', err);
			error = getFriendlyErrorMessage(err, 'Could not send friend request.');
			if (automatic) autoSent = true;
		} finally {
			sending = false;
		}
	}

	async function loadCurrentProfile(userId: string) {
		if (loadingProfile || currentProfile?.id === userId) return;

		loadingProfile = true;

		try {
			currentProfile = await getUserProfile(userId);

			if (browser && currentProfile?.rallyTag) {
				const link = createAppUrl(`/friends/add?tag=${encodeURIComponent(currentProfile.rallyTag)}`);
				qrCodeLink = link;
				qrCodeDataUrl = await QRCode.toDataURL(link, {
					width: 320,
					margin: 1,
					color: {
						dark: '#020617',
						light: '#ffffff'
					}
				});
			}
		} catch (err) {
			console.error('Friend add profile load error:', err);
			error = getFriendlyErrorMessage(err, 'Could not load your profile.');
		} finally {
			loadingProfile = false;
		}
	}

	onMount(() => {
		sourceTag = page.url.searchParams.get('tag')?.trim().replace(/^@/, '') ?? '';
		tag = sourceTag;
	});

	$effect(() => {
		const currentUser = authState.user;
		if (authState.loading) return;

		if (!currentUser) {
			const returnTo = `${page.url.pathname}${page.url.search}`;
			void goto(resolve(`/login?returnTo=${encodeURIComponent(returnTo)}`));
			return;
		}

		void loadCurrentProfile(currentUser.uid);

		if (sourceTag && !autoSent && !sending) {
			void sendInvite(sourceTag, true);
		}
	});
</script>

<main class="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:px-6">
	<div class="pointer-events-none absolute inset-0 opacity-80 blur-[1px]">
		<div class="mx-auto grid h-full max-w-7xl grid-cols-[1fr_360px] gap-5 px-4 py-8">
			<div class="space-y-6">
				<div class="h-20 max-w-xl rounded-[2rem] bg-white/70 shadow-sm dark:bg-slate-900/70"></div>
				<div class="h-72 max-w-2xl rounded-[2rem] bg-blue-100/70 shadow-sm dark:bg-blue-950/30"></div>
				<div class="grid max-w-2xl grid-cols-3 gap-4">
					<div class="h-24 rounded-[1.5rem] bg-white/70 dark:bg-slate-900/70"></div>
					<div class="h-24 rounded-[1.5rem] bg-white/70 dark:bg-slate-900/70"></div>
					<div class="h-24 rounded-[1.5rem] bg-white/70 dark:bg-slate-900/70"></div>
				</div>
			</div>
			<div class="hidden space-y-5 xl:block">
				<div class="h-52 rounded-[2rem] bg-white/70 shadow-sm dark:bg-slate-900/70"></div>
				<div class="h-28 rounded-[1.5rem] bg-white/70 shadow-sm dark:bg-slate-900/70"></div>
			</div>
		</div>
	</div>
	<div class="pointer-events-none absolute inset-0 bg-slate-100/60 backdrop-blur-sm dark:bg-slate-950/70"></div>

	<section class="relative z-10 mx-auto w-full max-w-xl">
		<button
			type="button"
			onclick={goBack}
			class="absolute -right-2 -top-5 z-10 grid h-11 w-11 place-items-center rounded-full bg-white text-xl font-black text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-950 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:text-white sm:-right-4 sm:-top-4"
			aria-label="Close"
		>
			×
		</button>

		<div class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-300/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
			<div class="flex items-start justify-between gap-4">
				<div>
					<h1 class="text-2xl font-black text-slate-950 dark:text-slate-50">Add friend</h1>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Use a Rally tag or show your QR code.
					</p>
				</div>

				<button
					type="button"
					onclick={() => (showQr = true)}
					class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
					aria-label="Show my QR code"
				>
					<img src="/qr-code.png" alt="" class="h-6 w-6 object-contain dark:invert" />
				</button>
			</div>

			{#if sourceTag}
				<div class="mt-5 rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
					QR detected for <span class="font-black">@{sourceTag}</span>. Sending the request automatically.
				</div>
			{/if}

			<form
				class="mt-5"
				onsubmit={(event) => {
					event.preventDefault();
					void sendInvite();
				}}
			>
				<div class="flex gap-2">
					<div class="flex min-w-0 flex-1 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500 focus-within:border-blue-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:focus-within:border-blue-800 dark:focus-within:ring-blue-950/40">
						<input
							id="friend-tag"
							bind:value={tag}
							placeholder="example: joao-8f3a1"
							class="min-w-0 flex-1 border-0 bg-transparent p-0 text-slate-900 shadow-none outline-none ring-0 placeholder:text-slate-400 focus:border-0 focus:outline-none focus:ring-0 dark:text-slate-100"
						/>
					</div>

					<button
						type="submit"
						disabled={sending || !tag.trim()}
						class="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{sending ? '...' : 'Add'}
					</button>
				</div>
			</form>

			{#if success}
				<div class="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
					{success}
				</div>
			{/if}

			{#if error}
				<div class="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
					{error}
				</div>
			{/if}
		</div>
	</section>
</main>

{#if showQr}
	<dialog
		open
		class="fixed inset-0 z-[120] m-0 flex h-full w-full max-w-none items-end justify-center border-0 bg-slate-950/55 px-0 backdrop-blur-sm sm:items-center sm:px-5"
		onclick={(event) => {
			if (event.target === event.currentTarget) showQr = false;
		}}
		aria-labelledby="friend-qr-title"
	>
		<div class="max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-[2rem] bg-white p-5 text-center shadow-2xl dark:bg-slate-900 sm:rounded-[2rem]">
			<div class="flex items-start justify-between gap-4 text-left">
				<div>
					<h2 id="friend-qr-title" class="text-2xl font-black text-slate-950 dark:text-slate-50">My QR code</h2>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Show this to add you on Rally.</p>
				</div>
				<button
					type="button"
					onclick={() => (showQr = false)}
					class="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xl font-black text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
					aria-label="Close QR code"
				>
					×
				</button>
			</div>

			<div class="mt-6 flex justify-center">
				<div class="rounded-[2rem] border border-slate-200 bg-white p-3 shadow-inner">
					{#if qrCodeDataUrl}
						<img src={qrCodeDataUrl} alt="Rally friend QR code" class="h-56 w-56 rounded-2xl sm:h-64 sm:w-64" />
					{:else}
						<div class="grid h-56 w-56 place-items-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-500 sm:h-64 sm:w-64">
							Generating QR...
						</div>
					{/if}
				</div>
			</div>

			<p class="mt-5 text-sm font-black text-slate-700 dark:text-slate-200">
				@{currentProfile?.rallyTag ?? 'your-tag'}
			</p>

			{#if qrCodeLink}
				<p class="mt-2 break-all text-xs text-slate-400 dark:text-slate-500">{qrCodeLink}</p>
			{/if}
		</div>
	</dialog>
{/if}
