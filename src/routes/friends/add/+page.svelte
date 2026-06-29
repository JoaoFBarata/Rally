<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import RallyWordmark from '$lib/components/RallyWordmark.svelte';
	import { authState } from '$lib/auth.svelte';
	import { sendFriendRequestByTag } from '$lib/services/social.service';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';

	let loading = $state(true);
	let sending = $state(false);
	let error = $state('');
	let success = $state('');
	let tag = $state('');

	async function sendInvite() {
		const currentUser = authState.user;

		if (!currentUser || !tag) return;

		sending = true;
		error = '';
		success = '';

		try {
			const target = await sendFriendRequestByTag({
				fromUserId: currentUser.uid,
				rallyTag: tag
			});

			success = `Friend request sent to ${target.displayName}.`;
		} catch (err) {
			console.error('QR friend request error:', err);
			error = getFriendlyErrorMessage(err, 'Could not send friend request.');
		} finally {
			sending = false;
			loading = false;
		}
	}

	onMount(() => {
		tag = page.url.searchParams.get('tag')?.trim() ?? '';

		if (!tag) {
			error = 'This friend QR code is missing a Rally tag.';
			loading = false;
		}
	});

	$effect(() => {
		if (authState.loading || !tag || success || error || sending) return;

		if (!authState.user) {
			const returnTo = `${page.url.pathname}${page.url.search}`;
			goto(resolve(`/login?returnTo=${encodeURIComponent(returnTo)}`));
			return;
		}

		void sendInvite();
	});
</script>

<main
	class="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 text-slate-950 dark:bg-slate-950 dark:text-slate-50"
>
	<section
		class="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
	>
		<div class="mb-6 flex justify-center">
			<RallyWordmark size="md" />
		</div>

		<h1 class="text-3xl font-black">Add friend</h1>
		<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
			{#if tag}
				Connecting you with <span class="font-bold">@{tag}</span>.
			{:else}
				Reading the Rally friend QR code.
			{/if}
		</p>

		{#if loading || sending || authState.loading}
			<div class="mt-8 flex justify-center">
				<div
					class="h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600 dark:border-slate-800 dark:border-t-blue-400"
				></div>
			</div>
		{/if}

		{#if success}
			<div
				class="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
			>
				{success}
			</div>
		{/if}

		{#if error}
			<div
				class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
			>
				{error}
			</div>
		{/if}

		<div class="mt-8 flex flex-col gap-3 sm:flex-row">
			<a
				href={resolve('/profile')}
				class="flex-1 rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 dark:shadow-blue-950/40"
			>
				Go to profile
			</a>

			<a
				href={resolve('/messages')}
				class="flex-1 rounded-2xl border border-slate-200 px-5 py-3 font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-300"
			>
				Messages
			</a>
		</div>
	</section>
</main>
