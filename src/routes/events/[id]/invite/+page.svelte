<!-- src/routes/events/[id]/invite/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { inviteUsersToEvent } from '$lib/services/invite.service';
	import { getEventById } from '$lib/services/event.service';
	import { getFriendsForUser } from '$lib/services/social.service';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { goBack } from '$lib/utils/navigation';
	import { createAppUrl } from '$lib/utils/app-url';
	import { Capacitor } from '@capacitor/core';
	import { Share } from '@capacitor/share';
	import type { SportEvent, UserProfile } from '$lib/schema';
	import { i18n } from '$lib/services/i18n.svelte';

	let eventId = $state('');
	let event = $state<SportEvent | null>(null);
	let friends = $state<UserProfile[]>([]);
	let selectedFriendIds = $state<string[]>([]);

	let loading = $state(true);
	let sending = $state(false);
	let success = $state('');
	let error = $state('');
	let linkCopied = $state(false);

	let canInvite = $derived.by(() => {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return false;

		return event.creatorId === currentUser.uid || event.participantIds.includes(currentUser.uid);
	});

	let availableFriends = $derived.by(() => {
		if (!event) return friends;

		return friends.filter((friend) => !event?.participantIds.includes(friend.id));
	});

	function isSelected(friendId: string) {
		return selectedFriendIds.includes(friendId);
	}

	function toggleFriend(friendId: string) {
		if (selectedFriendIds.includes(friendId)) {
			selectedFriendIds = selectedFriendIds.filter((id) => id !== friendId);
		} else {
			selectedFriendIds = [...selectedFriendIds, friendId];
		}
	}

	function selectAllFriends() {
		selectedFriendIds = availableFriends.map((friend) => friend.id);
	}

	function clearSelection() {
		selectedFriendIds = [];
	}

	function getInviteLink() {
		return createAppUrl(resolve(`/events/${eventId}`));
	}

	async function copyInviteLink() {
		try {
			await navigator.clipboard.writeText(getInviteLink());
			linkCopied = true;
			setTimeout(() => (linkCopied = false), 2500);
		} catch (err) {
			console.error('Could not copy invite link:', err);
			error = i18n.t('could_not_share_event');
		}
	}

	async function shareInviteLink() {
		const url = getInviteLink();
		const shareData = {
			title: event?.title ?? 'Rally',
			text: i18n.t('invite_link_share_text', { title: event?.title ?? '' }),
			url
		};

		try {
			if (Capacitor.getPlatform() !== 'web') {
				await Share.share({
					...shareData,
					dialogTitle: i18n.t('share_event_aria')
				});
			} else if (navigator.share) {
				await navigator.share(shareData);
			} else {
				await copyInviteLink();
			}
		} catch (err) {
			if ((err as DOMException)?.name !== 'AbortError')
				console.error('Could not share invite link:', err);
		}
	}

	onMount(async () => {
		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto(resolve('/login'));
			return;
		}

		const id = page.params.id;

		if (!id) {
			error = i18n.t('event_id_not_found');
			loading = false;
			return;
		}

		eventId = id;

		try {
			event = await getEventById(id);

			if (!event) {
				error = i18n.t('event_not_found');
				return;
			}

			friends = await getFriendsForUser(currentUser.uid);
		} catch (err) {
			console.error('Invite page load error:', err);
			error = getFriendlyErrorMessage(err, i18n.t('could_not_load_invite_page'));
		} finally {
			loading = false;
		}
	});

	async function handleSendInvites() {
		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto(resolve('/login'));
			return;
		}

		if (!event) {
			error = i18n.t('event_not_found');
			return;
		}

		if (!canInvite) {
			error = i18n.t('cannot_invite_event');
			return;
		}

		if (selectedFriendIds.length === 0) {
			error = i18n.t('select_friend_to_invite');
			return;
		}

		sending = true;
		error = '';
		success = '';

		try {
			const count = await inviteUsersToEvent({
				eventId,
				fromUserId: currentUser.uid,
				toUserIds: selectedFriendIds
			});

			success = i18n.t(count === 1 ? 'invite_sent_success' : 'invites_sent_success', { count });
			selectedFriendIds = [];
		} catch (err) {
			console.error('Invite error:', err);
			error = getFriendlyErrorMessage(err, i18n.t('send_invites_failed'));
		} finally {
			sending = false;
		}
	}
</script>

<div class="mx-auto w-full max-w-3xl px-5 pb-28 sm:px-0 sm:pb-0">
	<button
		type="button"
		onclick={() => goBack(resolve(`/events/${eventId}`))}
		class="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
	>
		<span class="leading-none">←</span>
		<span>{i18n.t('back')}</span>
	</button>

	<div class="mt-6">
		<p class="text-sm font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
			Rally
		</p>

		<h1 class="mt-2 text-3xl font-black text-slate-950 dark:text-slate-50">
			{i18n.t('invite_people')}
		</h1>

		{#if event}
			<p class="mt-2 text-slate-500 dark:text-slate-400">
				{i18n.t('invite_friends_to_join', { title: event.title })}
			</p>
		{:else}
			<p class="mt-2 text-slate-500 dark:text-slate-400">
				{i18n.t('choose_friends_to_invite')}
			</p>
		{/if}
	</div>

	{#if error}
		<div
			class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
		>
			{error}
		</div>
	{/if}

	{#if success}
		<div
			class="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
		>
			{success}
		</div>
	{/if}

	{#if loading}
		<div class="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
			{i18n.t('loading_friends')}
		</div>
	{:else if !canInvite}
		<div class="mt-8 rounded-3xl bg-slate-50 p-8 text-center dark:bg-slate-900">
			<p class="text-4xl">🔒</p>
			<h2 class="mt-3 text-xl font-black text-slate-950 dark:text-white">
				{i18n.t('cannot_invite_people_title')}
			</h2>
			<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
				{i18n.t('cannot_invite_people_sub')}
			</p>
		</div>
	{:else}
		<section
			class="mt-8 rounded-[1.75rem] border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/60 dark:bg-blue-950/25 sm:p-5"
		>
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 class="text-lg font-black text-slate-950 dark:text-white">
						{i18n.t('invite_by_link')}
					</h2>
					<p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
						{i18n.t('invite_by_link_sub')}
					</p>
				</div>
				<div class="flex shrink-0 gap-2">
					<button
						type="button"
						onclick={copyInviteLink}
						class="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-blue-700 shadow-sm ring-1 ring-blue-100 transition hover:bg-blue-100 dark:bg-slate-900 dark:text-blue-300 dark:ring-blue-900"
					>
						{linkCopied ? i18n.t('event_link_copied') : i18n.t('copy_invite_link')}
					</button>
					<button
						type="button"
						onclick={shareInviteLink}
						class="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
					>
						{i18n.t('share_invite_link')}
					</button>
				</div>
			</div>
		</section>

		<div
			class="mt-8 overflow-hidden rounded-[1.75rem] bg-white/70 p-4 shadow-sm shadow-slate-200/50 ring-1 ring-slate-200/70 dark:bg-slate-900/60 dark:shadow-none dark:ring-slate-800"
		>
			<div class="mb-4 flex items-center justify-between gap-4">
				<div>
					<h2 class="text-lg font-black text-slate-950 dark:text-white">
						{i18n.t('friends')}
					</h2>
					<p class="text-sm text-slate-500 dark:text-slate-400">
						{i18n.t('select_one_or_more_friends')}
					</p>
				</div>

				<div class="flex gap-2">
					<button
						type="button"
						onclick={selectAllFriends}
						class="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
					>
						{i18n.t('select_all')}
					</button>

					<button
						type="button"
						onclick={clearSelection}
						class="rounded-full px-4 py-2 text-sm font-bold text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
					>
						{i18n.t('clear')}
					</button>
				</div>
			</div>

			{#if availableFriends.length === 0}
				<div class="rounded-3xl bg-slate-50 p-8 text-center dark:bg-slate-900">
					<p class="text-4xl">👥</p>
					<h2 class="mt-3 text-xl font-black text-slate-950 dark:text-white">
						{i18n.t('no_friends_available')}
					</h2>
					<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
						{i18n.t('no_friends_available_sub')}
					</p>
				</div>
			{:else}
				<div
					class="max-h-[27.5rem] overflow-y-auto overscroll-contain pr-1 divide-y divide-slate-100 dark:divide-slate-800 sm:max-h-[34rem]"
				>
					{#each availableFriends as friend (friend.id)}
						<button
							type="button"
							onclick={() => toggleFriend(friend.id)}
							class="flex w-full items-center gap-3 rounded-2xl px-1 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900"
						>
							<UserAvatar
								displayName={friend.displayName}
								email={friend.email}
								photoURL={friend.photoURL}
								size="md"
							/>

							<div class="min-w-0 flex-1">
								<p class="truncate font-black text-slate-950 dark:text-white">
									{friend.displayName}
								</p>
								<p class="truncate text-sm text-slate-500 dark:text-slate-400">
									@{friend.rallyTag}
								</p>
							</div>

							<div
								class={`flex h-7 w-7 items-center justify-center rounded-full border text-sm font-black transition ${
									isSelected(friend.id)
										? 'border-blue-600 bg-blue-600 text-white'
										: 'border-slate-300 text-transparent dark:border-slate-700'
								}`}
							>
								✓
							</div>
						</button>
					{/each}
				</div>
			{/if}

			<div
				class="mt-5 rounded-[1.75rem] border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none sm:p-4"
			>
				<div class="flex items-center justify-between gap-3">
					<p class="text-sm font-bold text-slate-600 dark:text-slate-300">
						{i18n.t('selected_count', { count: selectedFriendIds.length })}
					</p>

					<button
						type="button"
						onclick={handleSendInvites}
						disabled={sending || selectedFriendIds.length === 0}
						class="rounded-full bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
					>
						{sending ? i18n.t('sending') : i18n.t('send_invites')}
					</button>
				</div>
			</div>
		</div>

		<div class="mt-10 border-t border-slate-100 pt-6 dark:border-slate-800">
			<h2 class="text-lg font-black text-slate-950 dark:text-white">
				{i18n.t('groups')}
			</h2>
			<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
				{i18n.t('groups_invites_future')}
			</p>
		</div>
	{/if}
</div>
