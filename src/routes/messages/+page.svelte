<!-- src/routes/messages/+page.svelte -->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/firebase';
	import { listenInvitesForUser, respondToInvite } from '$lib/services/invite.service';
	import { getEventById } from '$lib/services/event.service';
	import RallyWordmark from '$lib/components/RallyWordmark.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import {
		getFriendsForUser,
		listenFriendRequestsForUser,
		respondToFriendRequest
	} from '$lib/services/social.service';
	import {
		getOrCreateDirectConversation,
		listenConversationsForUser,
		markConversationAsRead
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
	import type { Unsubscribe } from 'firebase/firestore';

	type InviteWithEvent = EventInvite & {
		event: SportEvent | null;
	};

	type FriendRequestWithProfile = FriendRequest & {
		fromUser: UserProfile | null;
	};

	type ConversationWithProfile = ChatConversation & {
		otherUser: UserProfile | null;
		unreadCount: number;
		lastInteractionAtMs: number;
		displayName: string;
		displaySubtitle: string;
		displayPhotoURL: string | null;
		displayHref: string;
		isOrganizationChat: boolean;
	};

	let invites = $state<InviteWithEvent[]>([]);
	let friendRequests = $state<FriendRequestWithProfile[]>([]);
	let conversations = $state<ConversationWithProfile[]>([]);
	let friends = $state<UserProfile[]>([]);

	let loading = $state(true);
	let actionLoading = $state('');
	let error = $state('');
	let unsubscribeConversations: Unsubscribe | null = null;
	let unsubscribeInvites: Unsubscribe | null = null;
	let unsubscribeFriendRequests: Unsubscribe | null = null;

	function stopConversationsListener() {
		if (unsubscribeConversations) {
			unsubscribeConversations();
			unsubscribeConversations = null;
		}
	}

	function stopInvitesListener() {
		if (unsubscribeInvites) {
			unsubscribeInvites();
			unsubscribeInvites = null;
		}
	}

	function stopFriendRequestsListener() {
		if (unsubscribeFriendRequests) {
			unsubscribeFriendRequests();
			unsubscribeFriendRequests = null;
		}
	}
	function timestampToMillis(value: unknown) {
		try {
			const timestamp = value as { toDate?: () => Date };
			return timestamp?.toDate?.()?.getTime?.() ?? 0;
		} catch {
			return 0;
		}
	}

	function getConversationLastInteraction(conversation: ChatConversation) {
		return (
			timestampToMillis(conversation.lastMessageAt) ||
			timestampToMillis(conversation.updatedAt) ||
			timestampToMillis(conversation.createdAt)
		);
	}



	function formatUnreadCount(count: number) {
		return count > 99 ? '99+' : String(count);
	}

	function sortByDisplayName(a: UserProfile, b: UserProfile) {
		return (a.displayName ?? '').localeCompare(b.displayName ?? '', undefined, {
			sensitivity: 'base'
		});
	}

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

	async function updateConversationPreviews(
		userConversations: ChatConversation[],
		currentUserId: string
	) {
		const conversationsWithProfiles = await Promise.all(
			userConversations.map(async (conversation) => {
				const unreadCount = conversation.unreadCounts?.[currentUserId] ?? 0;

				if (conversation.type === 'rally_system') {
					return {
						...conversation,
						otherUser: null,
						unreadCount,
						lastInteractionAtMs: getConversationLastInteraction(conversation),
						displayName: 'Rally',
						displaySubtitle: 'Activity & event updates',
						displayPhotoURL: null,
						displayHref: `/messages/${conversation.id}`,
						isOrganizationChat: false
					};
				}

				if (conversation.type === 'group') {
					return {
						...conversation,
						otherUser: null,
						unreadCount,
						lastInteractionAtMs: getConversationLastInteraction(conversation),
						displayName: conversation.title ?? 'Event group',
						displaySubtitle: 'Event group chat',
						displayPhotoURL: conversation.photoURL ?? null,
						displayHref: `/messages/${conversation.id}`,
						isOrganizationChat: false
					};
				}

				if (conversation.type === 'organization_direct') {
					return {
						...conversation,
						otherUser: null,
						unreadCount,
						lastInteractionAtMs: getConversationLastInteraction(conversation),
						displayName: conversation.organizationName ?? conversation.title ?? 'Organization',
						displaySubtitle: 'Organization inbox',
						displayPhotoURL: conversation.organizationLogoURL ?? conversation.photoURL ?? null,
						displayHref: `/messages/${conversation.id}`,
						isOrganizationChat: true
					};
				}

				const otherUserId = conversation.memberIds.find((id) => id !== currentUserId);
				const otherUser = otherUserId ? await getUserProfile(otherUserId) : null;

				return {
					...conversation,
					otherUser,
					unreadCount,
					lastInteractionAtMs: getConversationLastInteraction(conversation),
					displayName: otherUser?.displayName ?? 'Rally user',
					displaySubtitle: `@${otherUser?.rallyTag ?? 'rally'}`,
					displayPhotoURL: otherUser?.photoURL ?? null,
					displayHref: `/messages/${conversation.id}`,
					isOrganizationChat: false
				};
			})
		);

		conversations = conversationsWithProfiles.sort((a, b) => {
			if (a.type === 'rally_system') return -1;
			if (b.type === 'rally_system') return 1;
			return b.lastInteractionAtMs - a.lastInteractionAtMs;
		});
	}

	async function updateInvitesWithEvents(userInvites: EventInvite[]) {
		const invitesWithEvents = await Promise.all(
			userInvites.map(async (invite) => {
				const event = await getEventById(invite.eventId);

				return {
					...invite,
					event
				};
			})
		);

		invites = invitesWithEvents.sort(
			(a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt)
		);
	}

	async function updateFriendRequestsWithProfiles(requests: FriendRequest[]) {
		const requestsWithProfiles = await Promise.all(
			requests.map(async (request) => {
				const fromUser = await getUserProfile(request.fromUserId);

				return {
					...request,
					fromUser
				};
			})
		);

		friendRequests = requestsWithProfiles.sort(
			(a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt)
		);
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
			stopInvitesListener();

			unsubscribeInvites = listenInvitesForUser(
				currentUser.uid,
				(userInvites) => {
					void updateInvitesWithEvents(userInvites);
				},
				(listenerError) => {
					console.error('Invites realtime error:', listenerError);
					error = listenerError.message;
				}
			);

			stopFriendRequestsListener();

			unsubscribeFriendRequests = listenFriendRequestsForUser(
				currentUser.uid,
				(requests) => {
					void updateFriendRequestsWithProfiles(requests);
				},
				(listenerError) => {
					console.error('Friend requests realtime error:', listenerError);
					error = listenerError.message;
				}
			);

			const rawFriends = await getFriendsForUser(currentUser.uid);
			friends = rawFriends.sort(sortByDisplayName);

			stopConversationsListener();

			unsubscribeConversations = listenConversationsForUser(
				currentUser.uid,
				(userConversations) => {
					void updateConversationPreviews(userConversations, currentUser.uid);
				},
				(listenerError) => {
					console.error('Conversations realtime error:', listenerError);
					error = listenerError.message;
				}
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

			if (status === 'accepted') {
				const rawFriends = await getFriendsForUser(currentUser.uid);
				friends = rawFriends.sort(sortByDisplayName);
			}
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
			await markConversationAsRead(conversationId, currentUser.uid);
			await goto(`/messages/${conversationId}`);
		} catch (err) {
			console.error('Start conversation error:', err);
			error = err instanceof Error ? err.message : 'Could not start conversation.';
		}
	}

	async function openConversation(conversationId: string) {
		const currentUser = auth.currentUser;

		if (currentUser) {
			await markConversationAsRead(conversationId, currentUser.uid);
		}

		await goto(`/messages/${conversationId}`);
	}

	onMount(() => {
	loadMessagesPage();
	});

	onDestroy(() => {
		stopConversationsListener();
		stopInvitesListener();
		stopFriendRequestsListener();
	});
</script>

<main class="min-h-screen bg-white text-slate-950 dark:bg-slate-950 dark:text-white">
	<div class="mx-auto max-w-4xl px-5 py-6">
		<header class="mb-6">
			<RallyWordmark size="sm" />
			<h1 class="mt-3 text-3xl font-black tracking-tight">Messages</h1>
			<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
				Invitations, chats and Rally friends.
			</p>
		</header>

		{#if error}
			<div
				class="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
			>
				{error}
			</div>
		{/if}

		{#if loading}
			<div class="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
				Loading messages...
			</div>
		{:else}
			<section class="mb-8">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-base font-black">Event invitations</h2>
					<span class="text-sm font-bold text-blue-600 dark:text-blue-400">
						{invites.filter((invite) => invite.status === 'pending').length} pending
					</span>
				</div>

				{#if invites.length === 0}
					<p
						class="rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400"
					>
						No event invitations yet.
					</p>
				{:else}
					<div class="flex gap-3 overflow-x-auto pb-2">
						{#each invites as invite (invite.id)}
							<article
								class="min-w-[280px] max-w-[280px] rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900"
							>
								{#if invite.event}
									<p
										class="text-xs font-black uppercase tracking-wide text-blue-600 dark:text-blue-400"
									>
										{invite.event.sport}
									</p>

									<h3 class="mt-1 truncate text-lg font-black">
										{invite.event.title}
									</h3>

									<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
										📍 {invite.event.location.name}
									</p>

									<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
										🕒 {formatDate(invite.event.startAt)}
									</p>

									<div class="mt-4 flex items-center justify-between gap-2">
										<a
											href={`/events/${invite.event.id}`}
											class="text-sm font-bold text-blue-600 dark:text-blue-400"
										>
											Details
										</a>

										{#if invite.status === 'pending'}
											<div class="flex gap-2">
												<button
													onclick={() => handleInviteResponse(invite, 'accepted')}
													disabled={actionLoading !== ''}
													class="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
												>
													Accept
												</button>

												<button
													onclick={() => handleInviteResponse(invite, 'declined')}
													disabled={actionLoading !== ''}
													class="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200 disabled:opacity-60 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-700"
												>
													Decline
												</button>
											</div>
										{:else}
											<span class="text-xs font-bold capitalize text-slate-500">
												{invite.status}
											</span>
										{/if}
									</div>
								{:else}
									<p class="text-sm text-slate-500">Event could not be loaded.</p>
								{/if}
							</article>
						{/each}
					</div>
				{/if}
			</section>

			<section class="mb-8">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-base font-black">Friend requests</h2>
					<span class="text-sm font-bold text-blue-600 dark:text-blue-400">
						{friendRequests.filter((request) => request.status === 'pending').length} pending
					</span>
				</div>

				{#if friendRequests.length === 0}
					<p class="text-sm text-slate-500 dark:text-slate-400">No friend requests.</p>
				{:else}
					<div class="divide-y divide-slate-100 dark:divide-slate-800">
						{#each friendRequests.slice(0, 3) as request (request.id)}
							<div class="flex items-center gap-3 py-4">
								<a
									href={`/users/${request.fromUserId}`}
									class="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1 transition hover:bg-slate-100 dark:hover:bg-slate-900"
								>
									<UserAvatar
										displayName={request.fromUser?.displayName}
										email={request.fromUser?.email}
										photoURL={request.fromUser?.photoURL}
										size="md"
									/>

									<div class="min-w-0 flex-1">
										<p class="truncate font-black">
											{request.fromUser?.displayName ?? 'Rally user'}
										</p>
										<p class="truncate text-sm text-slate-500 dark:text-slate-400">
											@{request.fromUser?.rallyTag}
										</p>
									</div>
								</a>

								{#if request.status === 'pending'}
									<div class="flex gap-2">
										<button
											onclick={() => handleFriendRequestResponse(request, 'accepted')}
											disabled={actionLoading !== ''}
											class="rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
										>
											Accept
										</button>

										<button
											onclick={() => handleFriendRequestResponse(request, 'declined')}
											disabled={actionLoading !== ''}
											class="rounded-full px-4 py-2 text-sm font-bold text-slate-500 hover:text-red-600 disabled:opacity-60"
										>
											Decline
										</button>
									</div>
								{:else}
									<span class="text-sm font-bold capitalize text-slate-500">
										{request.status}
									</span>
								{/if}
							</div>
						{/each}
					</div>

					{#if friendRequests.length > 3}
						<p class="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
							Showing latest 3 requests.
						</p>
					{/if}
				{/if}
			</section>

			<section class="mb-8">
				<h2 class="mb-3 text-base font-black">Chats</h2>

				{#if conversations.length === 0}
					<p class="text-sm text-slate-500 dark:text-slate-400">
						No conversations yet. Start a chat from your friends below.
					</p>
				{:else}
					<div class="divide-y divide-slate-100 dark:divide-slate-800">
						{#each conversations as conversation (conversation.id)}
							<button
								type="button"
								onclick={() => openConversation(conversation.id)}
								class="flex w-full items-center gap-3 rounded-3xl p-3 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800"
							>
								<div
									class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full {conversation.type === 'rally_system' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-blue-600 dark:bg-slate-800 dark:text-blue-300'} text-base font-black"
								>
									{#if conversation.type === 'rally_system'}
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5" aria-hidden="true">
											<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
										</svg>
									{:else if conversation.displayPhotoURL}
										<img
											src={conversation.displayPhotoURL}
											alt={conversation.displayName}
											class="h-full w-full object-cover"
										/>
									{:else}
										{conversation.displayName.charAt(0).toUpperCase()}
									{/if}
								</div>

								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<p class="truncate font-black text-slate-950 dark:text-slate-50">
											{conversation.displayName}
										</p>

										{#if conversation.type === 'rally_system'}
											<span class="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white">
												Official
											</span>
										{:else if conversation.isOrganizationChat}
											<span
												class="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300"
											>
												Company
											</span>
										{/if}
									</div>

									<p class="truncate text-xs text-slate-500 dark:text-slate-400">
										{conversation.lastMessage ?? conversation.displaySubtitle}
									</p>
								</div>

								{#if conversation.unreadCount > 0}
									<span
										class="flex min-h-6 min-w-6 items-center justify-center rounded-full bg-blue-600 px-2 text-xs font-black text-white"
									>
										{formatUnreadCount(conversation.unreadCount)}
									</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</section>

			<section>
				<h2 class="mb-3 text-base font-black">Rally friends</h2>

				{#if friends.length === 0}
					<p class="text-sm text-slate-500 dark:text-slate-400">
						No friends yet. Add people from your profile using their Rally tag.
					</p>
				{:else}
					<div class="divide-y divide-slate-100 dark:divide-slate-800">
						{#each friends as friend (friend.id)}
							<div class="flex items-center gap-3 py-4">
								<UserAvatar
									displayName={friend.displayName}
									email={friend.email}
									photoURL={friend.photoURL}
									size="md"
								/>

								<div class="min-w-0 flex-1">
									<p class="truncate font-black">{friend.displayName}</p>
									<p class="truncate text-sm text-slate-500 dark:text-slate-400">
										@{friend.rallyTag}
									</p>
								</div>

								<button
									onclick={() => startConversation(friend.id)}
									class="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-blue-600 transition hover:bg-blue-600 hover:text-white dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-600 dark:hover:text-white"
								>
									Message
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	</div>
</main>