<!-- src/routes/messages/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/firebase';
	import { getInvitesForUser, respondToInvite } from '$lib/services/invite.service';
	import { getEventById } from '$lib/services/event.service';
	import {
		getFriendRequestsForUser,
		getFriendsForUser,
		respondToFriendRequest
	} from '$lib/services/social.service';
	import {
		getConversationsForUser,
		getOrCreateDirectConversation
	} from '$lib/services/chat.service';
	import { getUserProfile } from '$lib/services/user.service';
	import type {
		ChatConversation,
		EventInvite,
		FriendRequest,
		FriendRequestStatus,
		InviteStatus,
		SportEvent,
		UserProfile
	} from '$lib/schema';

	type InviteWithEvent = EventInvite & {
		event: SportEvent | null;
	};

	type FriendRequestWithProfile = FriendRequest & {
		fromUser: UserProfile | null;
	};

	type ConversationWithProfile = ChatConversation & {
		otherUser: UserProfile | null;
	};

	let invites = $state<InviteWithEvent[]>([]);
	let friendRequests = $state<FriendRequestWithProfile[]>([]);
	let conversations = $state<ConversationWithProfile[]>([]);
	let friends = $state<UserProfile[]>([]);

	let loading = $state(true);
	let actionLoading = $state('');
	let error = $state('');

	function formatDate(dateValue: unknown) {
		try {
			const timestamp = dateValue as { toDate?: () => Date };

			if (timestamp?.toDate) {
				return timestamp.toDate().toLocaleString('en-GB', {
					weekday: 'short',
					day: '2-digit',
					month: 'short',
					hour: '2-digit',
					minute: '2-digit'
				});
			}

			return 'Date not set';
		} catch {
			return 'Date not set';
		}
	}

	async function loadMessagesPage() {
		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto('/login');
			return;
		}

		loading = true;
		error = '';

		try {
			const userInvites = await getInvitesForUser(currentUser.uid);

			invites = await Promise.all(
				userInvites.map(async (invite) => {
					const event = await getEventById(invite.eventId);

					return {
						...invite,
						event
					};
				})
			);

			const requests = await getFriendRequestsForUser(currentUser.uid);

			friendRequests = await Promise.all(
				requests.map(async (request) => {
					const fromUser = await getUserProfile(request.fromUserId);

					return {
						...request,
						fromUser
					};
				})
			);

			friends = await getFriendsForUser(currentUser.uid);

			const userConversations = await getConversationsForUser(currentUser.uid);

			conversations = await Promise.all(
				userConversations.map(async (conversation) => {
					const otherUserId = conversation.memberIds.find((id) => id !== currentUser.uid);
					const otherUser = otherUserId ? await getUserProfile(otherUserId) : null;

					return {
						...conversation,
						otherUser
					};
				})
			);
		} catch (err) {
			console.error('Messages load error:', err);
			error = err instanceof Error ? err.message : 'Could not load messages.';
		} finally {
			loading = false;
		}
	}

	async function handleInviteResponse(invite: InviteWithEvent, status: InviteStatus) {
		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto('/login');
			return;
		}

		actionLoading = `${invite.id}-${status}`;
		error = '';

		try {
			await respondToInvite({
				inviteId: invite.id,
				eventId: invite.eventId,
				userId: currentUser.uid,
				status
			});

			await loadMessagesPage();
		} catch (err) {
			console.error('Invite response error:', err);
			error = err instanceof Error ? err.message : 'Could not update invitation.';
		} finally {
			actionLoading = '';
		}
	}

	async function handleFriendRequestResponse(
		request: FriendRequestWithProfile,
		status: FriendRequestStatus
	) {
		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto('/login');
			return;
		}

		actionLoading = `${request.id}-${status}`;
		error = '';

		try {
			await respondToFriendRequest({
				requestId: request.id,
				fromUserId: request.fromUserId,
				toUserId: currentUser.uid,
				status
			});

			await loadMessagesPage();
		} catch (err) {
			console.error('Friend response error:', err);
			error = err instanceof Error ? err.message : 'Could not update friend request.';
		} finally {
			actionLoading = '';
		}
	}

	async function startConversation(friendId: string) {
		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto('/login');
			return;
		}

		try {
			const conversationId = await getOrCreateDirectConversation(currentUser.uid, friendId);
			await goto(`/messages/${conversationId}`);
		} catch (err) {
			console.error('Start conversation error:', err);
			error = err instanceof Error ? err.message : 'Could not start conversation.';
		}
	}

	onMount(() => {
		loadMessagesPage();
	});
</script>

<main class="mx-auto max-w-6xl px-5 py-6">
	<header class="mb-6">
		<p class="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
			Rally
		</p>
		<h1 class="mt-2 text-3xl font-bold text-slate-950 dark:text-slate-50">Messages</h1>
		<p class="mt-1 text-slate-500 dark:text-slate-400">
			Invitations, friend requests and conversations.
		</p>
	</header>

	{#if error}
		<div
			class="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
		>
			{error}
		</div>
	{/if}

	{#if loading}
		<section
			class="rounded-[2rem] border border-slate-200 bg-white p-8 text-slate-950 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
		>
			Loading messages...
		</section>
	{:else}
		<section
			class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
		>
			<div class="flex items-center justify-between gap-4">
				<div>
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">
						Event invitations
					</h2>
					<p class="text-sm text-slate-500 dark:text-slate-400">
						Scroll sideways to review invitations.
					</p>
				</div>

				<span class="rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
					{invites.filter((invite) => invite.status === 'pending').length} pending
				</span>
			</div>

			{#if invites.length === 0}
				<div
					class="mt-5 rounded-3xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700"
				>
					<p class="text-3xl">✉️</p>
					<p class="mt-2 font-bold text-slate-700 dark:text-slate-300">
						No event invitations yet
					</p>
				</div>
			{:else}
				<div class="mt-5 flex gap-4 overflow-x-auto pb-3">
					{#each invites as invite}
						<article
							class="min-w-[310px] max-w-[310px] rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800"
						>
							{#if invite.event}
								<p class="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">
									{invite.event.sport}
								</p>

								<h3 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50">
									{invite.event.title}
								</h3>

								<p class="mt-2 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
									{invite.event.description || 'No description provided.'}
								</p>

								<div class="mt-4 space-y-1 text-sm text-slate-600 dark:text-slate-300">
									<p>📍 {invite.event.location.name}</p>
									<p>🕒 {formatDate(invite.event.startAt)}</p>
									<p>
										👥 {invite.event.participantIds.length}/{invite.event.maxParticipants} players
									</p>
								</div>

								<a
									href={`/events/${invite.event.id}`}
									class="mt-4 inline-flex text-sm font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
								>
									View details →
								</a>

								{#if invite.status === 'pending'}
									<div class="mt-4 grid grid-cols-2 gap-2">
										<button
											onclick={() => handleInviteResponse(invite, 'accepted')}
											disabled={actionLoading !== ''}
											class="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
										>
											Accept
										</button>

										<button
											onclick={() => handleInviteResponse(invite, 'declined')}
											disabled={actionLoading !== ''}
											class="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
										>
											Decline
										</button>
									</div>
								{:else}
									<div
										class="mt-4 rounded-2xl bg-white px-4 py-3 text-center text-sm font-black capitalize text-slate-700 dark:bg-slate-900 dark:text-slate-200"
									>
										{invite.status}
									</div>
								{/if}
							{:else}
								<p class="font-semibold text-slate-700 dark:text-slate-300">
									Event could not be loaded.
								</p>
							{/if}
						</article>
					{/each}
				</div>
			{/if}
		</section>

		<section
			class="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
		>
			<div class="flex items-center justify-between gap-4">
				<div>
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">
						Friend requests
					</h2>
					<p class="text-sm text-slate-500 dark:text-slate-400">
						Accept people before starting conversations.
					</p>
				</div>

				<span class="rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
					{friendRequests.filter((request) => request.status === 'pending').length} pending
				</span>
			</div>

			{#if friendRequests.length === 0}
				<div
					class="mt-5 rounded-3xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700"
				>
					<p class="text-3xl">👥</p>
					<p class="mt-2 font-bold text-slate-700 dark:text-slate-300">No friend requests</p>
				</div>
			{:else}
				<div class="mt-5 grid gap-3 md:grid-cols-2">
					{#each friendRequests as request}
						<article class="rounded-3xl bg-slate-50 p-5 dark:bg-slate-800">
							<div class="flex items-center gap-3">
								<div class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 font-bold text-white">
									{request.fromUser?.displayName?.[0] ?? 'R'}
								</div>

								<div>
									<p class="font-black text-slate-950 dark:text-slate-50">
										{request.fromUser?.displayName ?? 'Rally user'}
									</p>
									<p class="text-sm text-slate-500 dark:text-slate-400">
										@{request.fromUser?.rallyTag}
									</p>
								</div>
							</div>

							{#if request.status === 'pending'}
								<div class="mt-4 grid grid-cols-2 gap-2">
									<button
										onclick={() => handleFriendRequestResponse(request, 'accepted')}
										disabled={actionLoading !== ''}
										class="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
									>
										Accept
									</button>

									<button
										onclick={() => handleFriendRequestResponse(request, 'declined')}
										disabled={actionLoading !== ''}
										class="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
									>
										Decline
									</button>
								</div>
							{:else}
								<p
									class="mt-4 rounded-2xl bg-white px-4 py-3 text-center text-sm font-black capitalize text-slate-700 dark:bg-slate-900 dark:text-slate-200"
								>
									{request.status}
								</p>
							{/if}
						</article>
					{/each}
				</div>
			{/if}
		</section>

		<section
			class="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
		>
			<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Conversations</h2>
			<p class="text-sm text-slate-500 dark:text-slate-400">
				Chats already started with friends or groups.
			</p>

			{#if conversations.length === 0}
				<div
					class="mt-5 rounded-3xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700"
				>
					<p class="text-3xl">💬</p>
					<p class="mt-2 font-bold text-slate-700 dark:text-slate-300">
						No conversations yet
					</p>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Start a chat from your Rally friends below.
					</p>
				</div>
			{:else}
				<div class="mt-5 space-y-3">
					{#each conversations as conversation}
						<a
							href={`/messages/${conversation.id}`}
							class="flex items-center justify-between rounded-3xl bg-slate-50 p-4 transition hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-slate-700"
						>
							<div class="flex items-center gap-3">
								<div class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 font-bold text-white">
									{conversation.otherUser?.displayName?.[0] ?? 'G'}
								</div>

								<div>
									<p class="font-black text-slate-950 dark:text-slate-50">
										{conversation.otherUser?.displayName ?? conversation.title ?? 'Group chat'}
									</p>
									<p class="text-sm text-slate-500 dark:text-slate-400">
										{conversation.lastMessage ?? 'No messages yet'}
									</p>
								</div>
							</div>

							<span class="text-blue-600 dark:text-blue-400">→</span>
						</a>
					{/each}
				</div>
			{/if}
		</section>

		<section
			class="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
		>
			<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Rally friends</h2>
			<p class="text-sm text-slate-500 dark:text-slate-400">
				These are your app friends. Start a direct message.
			</p>

			{#if friends.length === 0}
				<div
					class="mt-5 rounded-3xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700"
				>
					<p class="text-3xl">📇</p>
					<p class="mt-2 font-bold text-slate-700 dark:text-slate-300">No friends yet</p>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Add people from your profile using their Rally tag.
					</p>
				</div>
			{:else}
				<div class="mt-5 grid gap-3 md:grid-cols-2">
					{#each friends as friend}
						<article class="flex items-center justify-between rounded-3xl bg-slate-50 p-4 dark:bg-slate-800">
							<div class="flex items-center gap-3">
								<div class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 font-bold uppercase text-white">
									{friend.displayName?.[0] ?? 'R'}
								</div>

								<div>
									<p class="font-black text-slate-950 dark:text-slate-50">
										{friend.displayName}
									</p>
									<p class="text-sm text-slate-500 dark:text-slate-400">@{friend.rallyTag}</p>
								</div>
							</div>

							<button
								onclick={() => startConversation(friend.id)}
								class="rounded-full bg-white px-4 py-2 text-sm font-bold text-blue-600 shadow-sm transition hover:bg-blue-600 hover:text-white dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-600 dark:hover:text-white"
							>
								Message
							</button>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</main>