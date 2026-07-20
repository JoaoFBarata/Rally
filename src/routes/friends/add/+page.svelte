<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import { Capacitor } from '@capacitor/core';
	import { Share } from '@capacitor/share';
	import { authState } from '$lib/auth.svelte';
	import {
		addFriendByQrCode,
		sendFriendRequestById,
		sendFriendRequestByTag
	} from '$lib/services/social.service';
	import { getUserProfile } from '$lib/services/user.service';
	import type { UserProfile } from '$lib/schema';
	import { createAppUrl } from '$lib/utils/app-url';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { i18n } from '$lib/services/i18n.svelte';

	let sending = $state(false);
	let loadingProfile = $state(false);
	let error = $state('');
	let success = $state('');
	let tag = $state('');
	let sourceTag = $state('');
	let sourceQrUserId = $state('');
	let sourceLinkUserId = $state('');
	let qrFriendProcessed = $state(false);
	let currentProfile = $state<UserProfile | null>(null);
	let qrCodeDataUrl = $state('');
	let qrCodeLink = $state('');
	let friendShareLink = $state('');
	let showQr = $state(false);

	async function goBack() {
		await goto(resolve('/profile'));
	}

	async function copyFriendLink() {
		if (!friendShareLink) return;
		await navigator.clipboard.writeText(friendShareLink);
		success = i18n.t('friend_link_copied');
	}

	async function shareFriendLink() {
		if (!friendShareLink) return;

		try {
			if (Capacitor.isNativePlatform()) {
				await Share.share({
					title: 'Rally',
					text: i18n.t('friend_link_share_text'),
					url: friendShareLink,
					dialogTitle: i18n.t('share_friend_link')
				});
				return;
			}

			if (navigator.share) {
				await navigator.share({
					title: 'Rally',
					text: i18n.t('friend_link_share_text'),
					url: friendShareLink
				});
				return;
			}

			await copyFriendLink();
		} catch (err) {
			if ((err as DOMException)?.name !== 'AbortError') {
				console.error('Friend link share error:', err);
			}
		}
	}

	async function acceptQrFriendship(currentUserId: string, targetUserId: string) {
		if (qrFriendProcessed || sending) return;
		qrFriendProcessed = true;
		sending = true;
		error = '';

		try {
			await addFriendByQrCode({ fromUserId: currentUserId, toUserId: targetUserId });
			success = i18n.t('qr_friend_added');
		} catch (err) {
			console.error('QR friendship error:', err);
			error = getFriendlyErrorMessage(err, i18n.t('could_not_add_qr_friend'));
		} finally {
			sending = false;
		}
	}

	async function sendInvite(targetTag = tag.trim()) {
		const currentUser = authState.user;
		const cleanTag = targetTag.trim().replace(/^@/, '');

		if (!currentUser || !cleanTag || sending) return;

		sending = true;
		error = '';
		success = '';

		try {
			if (sourceLinkUserId) {
				await sendFriendRequestById({
					fromUserId: currentUser.uid,
					toUserId: sourceLinkUserId
				});
				success = i18n.t('friend_request_sent');
			} else {
				const target = await sendFriendRequestByTag({
					fromUserId: currentUser.uid,
					rallyTag: cleanTag
				});
				success = i18n.t('friend_request_sent_to', { name: target.displayName });
			}
			tag = '';
		} catch (err) {
			console.error('Friend request error:', err);
			error = getFriendlyErrorMessage(err, i18n.t('could_not_send_friend_request'));
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
				friendShareLink = createAppUrl(
					`/friends/add?source=link&user=${encodeURIComponent(currentProfile.id)}&tag=${encodeURIComponent(currentProfile.rallyTag)}`
				);
				qrCodeLink = createAppUrl(
					`/friends/add?source=qr&user=${encodeURIComponent(currentProfile.id)}`
				);
				qrCodeDataUrl = await QRCode.toDataURL(qrCodeLink, {
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
			error = getFriendlyErrorMessage(err, i18n.t('could_not_load_profile'));
		} finally {
			loadingProfile = false;
		}
	}

	onMount(() => {
		sourceTag = page.url.searchParams.get('tag')?.trim().replace(/^@/, '') ?? '';
		sourceQrUserId =
			page.url.searchParams.get('source') === 'qr'
				? (page.url.searchParams.get('user')?.trim() ?? '')
				: '';
		sourceLinkUserId =
			page.url.searchParams.get('source') === 'link'
				? (page.url.searchParams.get('user')?.trim() ?? '')
				: '';
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
		if (sourceQrUserId) void acceptQrFriendship(currentUser.uid, sourceQrUserId);
	});
</script>

<main
	class="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:px-6"
>
	<div class="pointer-events-none absolute inset-0 opacity-80 blur-[1px]">
		<div class="mx-auto grid h-full max-w-7xl grid-cols-[1fr_360px] gap-5 px-4 py-8">
			<div class="space-y-6">
				<div class="h-20 max-w-xl rounded-[2rem] bg-white/70 shadow-sm dark:bg-slate-900/70"></div>
				<div
					class="h-72 max-w-2xl rounded-[2rem] bg-blue-100/70 shadow-sm dark:bg-blue-950/30"
				></div>
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
	<div
		class="pointer-events-none absolute inset-0 bg-slate-100/60 backdrop-blur-sm dark:bg-slate-950/70"
	></div>

	<section class="relative z-10 mx-auto w-full max-w-xl">
		<button
			type="button"
			onclick={goBack}
			class="absolute -right-2 -top-5 z-10 grid h-11 w-11 place-items-center rounded-full bg-white text-xl font-black text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-950 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:text-white sm:-right-4 sm:-top-4"
			aria-label={i18n.t('close_aria')}
		>
			×
		</button>

		<div
			class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-300/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
		>
			<div class="flex items-start justify-between gap-4">
				<div>
					<h1 class="text-2xl font-black text-slate-950 dark:text-slate-50">
						{i18n.t('add_friend')}
					</h1>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						{i18n.t('add_friend_sub')}
					</p>
				</div>

				<button
					type="button"
					onclick={() => (showQr = true)}
					class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
					aria-label={i18n.t('my_qr_code')}
				>
					<img src="/qr-code.png" alt="" class="h-6 w-6 object-contain" />
				</button>
			</div>

			{#if sourceQrUserId && !success && !error}
				<div
					class="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
				>
					{i18n.t('qr_friendship_processing')}
				</div>
			{:else if sourceTag}
				<div
					class="mt-5 rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
				>
					{i18n.t('qr_detected_sending', { tag: sourceTag })}
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
					<div
						class="flex min-w-0 flex-1 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500 focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:focus-within:border-blue-700 dark:focus-within:ring-blue-950/40"
					>
						<input
							id="friend-tag"
							bind:value={tag}
							placeholder={i18n.t('add_friend_placeholder')}
							class="min-w-0 flex-1 appearance-none border-0 bg-slate-50 p-0 text-slate-950 caret-blue-600 shadow-none outline-none ring-0 [color-scheme:light] placeholder:text-slate-400 focus:border-0 focus:outline-none focus:ring-0 dark:bg-slate-900 dark:text-white dark:caret-blue-400 dark:[color-scheme:dark] dark:placeholder:text-slate-500"
						/>
					</div>

					<button
						type="submit"
						disabled={sending || !tag.trim()}
						class="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{sending ? '...' : i18n.t('add')}
					</button>
				</div>
			</form>

			{#if qrCodeDataUrl}
				<div class="mt-6 sm:hidden">
					<div
						class="mx-auto w-fit rounded-[2rem] border border-blue-100 bg-white p-3 shadow-inner dark:border-blue-900/60"
					>
						<img
							src={qrCodeDataUrl}
							alt={i18n.t('rally_friend_qr_code')}
							class="h-52 w-52 rounded-2xl"
						/>
					</div>
					<p class="mt-3 text-center text-sm font-black text-slate-700 dark:text-slate-200">
						@{currentProfile?.rallyTag ?? i18n.t('your_tag')}
					</p>
				</div>
			{/if}

			<div class="mt-5 grid grid-cols-2 gap-2">
				<button
					type="button"
					onclick={shareFriendLink}
					disabled={!friendShareLink}
					class="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-50"
				>
					{i18n.t('share_friend_link')}
				</button>
				<button
					type="button"
					onclick={copyFriendLink}
					disabled={!friendShareLink}
					class="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
				>
					{i18n.t('copy_friend_link')}
				</button>
			</div>

			{#if success}
				<div
					class="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
				>
					{success}
				</div>
			{/if}

			{#if error}
				<div
					class="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
				>
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
		<div
			class="max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-[2rem] bg-white p-5 text-center shadow-2xl dark:bg-slate-900 sm:rounded-[2rem]"
		>
			<div class="flex items-start justify-between gap-4 text-left">
				<div>
					<h2 id="friend-qr-title" class="text-2xl font-black text-slate-950 dark:text-slate-50">
						{i18n.t('my_qr_code')}
					</h2>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{i18n.t('show_qr_add_you')}</p>
				</div>
				<button
					type="button"
					onclick={() => (showQr = false)}
					class="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xl font-black text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
					aria-label={i18n.t('close_qr_code')}
				>
					×
				</button>
			</div>

			<div class="mt-6 flex justify-center">
				<div class="rounded-[2rem] border border-slate-200 bg-white p-3 shadow-inner">
					{#if qrCodeDataUrl}
						<img
							src={qrCodeDataUrl}
							alt={i18n.t('rally_friend_qr_code')}
							class="h-56 w-56 rounded-2xl sm:h-64 sm:w-64"
						/>
					{:else}
						<div
							class="grid h-56 w-56 place-items-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-500 sm:h-64 sm:w-64"
						>
							{i18n.t('generating_qr')}
						</div>
					{/if}
				</div>
			</div>

			<p class="mt-5 text-sm font-black text-slate-700 dark:text-slate-200">
				@{currentProfile?.rallyTag ?? i18n.t('your_tag')}
			</p>

			{#if qrCodeLink}
				<p class="mt-2 break-all text-xs text-slate-400 dark:text-slate-500">{qrCodeLink}</p>
			{/if}
		</div>
	</dialog>
{/if}
