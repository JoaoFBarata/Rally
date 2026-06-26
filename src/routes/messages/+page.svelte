<!-- src/routes/messages/+page.svelte -->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { auth } from '$lib/firebase';
	import { listenInvitesForUser, respondToInvite } from '$lib/services/invite.service';
	import { getEventById, getEffectiveEventStatus } from '$lib/services/event.service';
	import RallyWordmark from '$lib/components/RallyWordmark.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import {
		getFriendsForUser,
		listenFriendRequestsForUser,
		respondToFriendRequest
	} from '$lib/services/social.service';
	import {
		clearConversationForUser,
		getOrCreateDirectConversation,
		hideConversationForUser,
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
		isFinishedEvent: boolean;
	};

	let invites = $state<InviteWithEvent[]>([]);
	let friendRequests = $state<FriendRequestWithProfile[]>([]);
	let conversations = $state<ConversationWithProfile[]>([]);
	let friends = $state<UserProfile[]>([]);
	let showFinishedChats = $state(false);
	let openConversationMenuId = $state('');
	let pinnedConversationIds = $state<string[]>([]);
	let mutedConversationIds = $state<string[]>([]);

	let activeConversations = $derived(
		sortConversationPins(conversations.filter((c) => !c.isFinishedEvent))
	);
	let finishedEventConversations = $derived(
		sortConversationPins(conversations.filter((c) => c.isFinishedEvent))
	);

	let loading = $state(true);
	let actionLoading = $state('');
	let error = $state('');
	let unsubscribeConversations: Unsubscribe | null = null;
	let unsubscribeInvites: Unsubscribe | null = null;
	let unsubscribeFriendRequests: Unsubscribe | null = null;
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressOpenedConversationId = '';

	function sortConversationPins(items: ConversationWithProfile[]) {
		return [...items].sort((a, b) => {
			const pinDiff =
				(pinnedConversationIds.includes(b.id) ? 1 : 0) -
				(pinnedConversationIds.includes(a.id) ? 1 : 0);
			if (pinDiff !== 0) return pinDiff;
			return b.lastInteractionAtMs - a.lastInteractionAtMs;
		});
	}

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

	function saveConversationPrefs() {
		if (!browser) return;
		localStorage.setItem('rally:pinned-conversations', JSON.stringify(pinnedConversationIds));
		localStorage.setItem('rally:muted-conversations', JSON.stringify(mutedConversationIds));
	}

	function loadConversationPrefs() {
		if (!browser) return;

		try {
			pinnedConversationIds = JSON.parse(
				localStorage.getItem('rally:pinned-conversations') ?? '[]'
			);
			mutedConversationIds = JSON.parse(localStorage.getItem('rally:muted-conversations') ?? '[]');
		} catch {
			pinnedConversationIds = [];
			mutedConversationIds = [];
		}
	}

	function toggleConversationPin(conversationId: string) {
		pinnedConversationIds = pinnedConversationIds.includes(conversationId)
			? pinnedConversationIds.filter((id) => id !== conversationId)
			: [conversationId, ...pinnedConversationIds];
		saveConversationPrefs();
		openConversationMenuId = '';
	}

	function toggleConversationMute(conversationId: string) {
		mutedConversationIds = mutedConversationIds.includes(conversationId)
			? mutedConversationIds.filter((id) => id !== conversationId)
			: [conversationId, ...mutedConversationIds];
		saveConversationPrefs();
		openConversationMenuId = '';
	}

	function openConversationMenu(conversationId: string) {
		openConversationMenuId = openConversationMenuId === conversationId ? '' : conversationId;
	}

	function showConversationMenu(conversationId: string) {
		openConversationMenuId = conversationId;
	}

	function startLongPress(conversationId: string) {
		clearLongPress();
		longPressOpenedConversationId = '';
		longPressTimer = setTimeout(() => {
			showConversationMenu(conversationId);
			longPressOpenedConversationId = conversationId;
			longPressTimer = null;
		}, 450);
	}

	function clearLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function finishLongPress() {
		clearLongPress();
	}

	function closeConversationMenuOnOutsidePress(event: PointerEvent) {
		if (!openConversationMenuId) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('[data-conversation-menu]')) return;
		openConversationMenuId = '';
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

	function isConversationClearedForUser(conversation: ChatConversation, userId: string) {
		const clearedAt = conversation.clearedFor?.[userId];
		const clearedAtMs = timestampToMillis(clearedAt);
		const lastMessageAtMs = timestampToMillis(conversation.lastMessageAt);

		return clearedAtMs > 0 && lastMessageAtMs > 0 && clearedAtMs >= lastMessageAtMs;
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
		const visibleConversations = userConversations.filter(
			(conversation) => !(conversation.hiddenFor ?? []).includes(currentUserId)
		);

		const conversationsWithProfiles = await Promise.all(
			visibleConversations.map(async (conversation) => {
				const unreadCount = conversation.unreadCounts?.[currentUserId] ?? 0;

				if (conversation.type === 'rally_system') {
					const isCleared = isConversationClearedForUser(conversation, currentUserId);
					return {
						...conversation,
						otherUser: null,
						unreadCount,
						lastInteractionAtMs: getConversationLastInteraction(conversation),
						displayName: 'Rally',
						displaySubtitle: isCleared ? 'No messages' : 'Activity & event updates',
						lastMessage: isCleared ? '' : conversation.lastMessage,
						displayPhotoURL: null,
						displayHref: `/messages/${conversation.id}`,
						isOrganizationChat: false
					};
				}

				if (conversation.type === 'group') {
					const isCleared = isConversationClearedForUser(conversation, currentUserId);
					return {
						...conversation,
						otherUser: null,
						unreadCount,
						lastInteractionAtMs: getConversationLastInteraction(conversation),
						displayName: conversation.title ?? 'Event group',
						displaySubtitle: isCleared ? 'No messages' : 'Event group chat',
						lastMessage: isCleared ? '' : conversation.lastMessage,
						displayPhotoURL: conversation.photoURL ?? null,
						displayHref: `/messages/${conversation.id}`,
						isOrganizationChat: false
					};
				}

				if (conversation.type === 'tournament_team') {
					const isCleared = isConversationClearedForUser(conversation, currentUserId);
					return {
						...conversation,
						otherUser: null,
						unreadCount,
						lastInteractionAtMs: getConversationLastInteraction(conversation),
						displayName: conversation.title ?? 'Tournament team',
						displaySubtitle: isCleared ? 'No messages' : 'Team chat',
						lastMessage: isCleared ? '' : conversation.lastMessage,
						displayPhotoURL: conversation.photoURL ?? null,
						displayHref: `/messages/${conversation.id}`,
						isOrganizationChat: false
					};
				}

				if (conversation.type === 'organization_direct') {
					const isCleared = isConversationClearedForUser(conversation, currentUserId);
					return {
						...conversation,
						otherUser: null,
						unreadCount,
						lastInteractionAtMs: getConversationLastInteraction(conversation),
						displayName: conversation.organizationName ?? conversation.title ?? 'Organization',
						displaySubtitle: isCleared ? 'No messages' : 'Organization inbox',
						lastMessage: isCleared ? '' : conversation.lastMessage,
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
					displaySubtitle: isConversationClearedForUser(conversation, currentUserId)
						? 'No messages'
						: `@${otherUser?.rallyTag ?? 'rally'}`,
					lastMessage: isConversationClearedForUser(conversation, currentUserId)
						? ''
						: conversation.lastMessage,
					displayPhotoURL: otherUser?.photoURL ?? null,
					displayHref: `/messages/${conversation.id}`,
					isOrganizationChat: false
				};
			})
		);

		const eventIds = [
			...new Set(
				conversationsWithProfiles
					.filter((c) => (c.type === 'group' || c.type === 'tournament_team') && c.eventId)
					.map((c) => c.eventId!)
			)
		];

		const fetchedEvents = await Promise.all(eventIds.map((id) => getEventById(id)));
		const eventStatusMap = new Map<string, boolean>();
		for (let i = 0; i < eventIds.length; i++) {
			const ev = fetchedEvents[i];
			if (ev) {
				const status = getEffectiveEventStatus(ev);
				eventStatusMap.set(eventIds[i], status === 'finished' || status === 'cancelled');
			}
		}

		conversations = conversationsWithProfiles
			.map((c) => ({
				...c,
				isFinishedEvent:
					(c.type === 'group' || c.type === 'tournament_team') && c.eventId
						? (eventStatusMap.get(c.eventId) ?? false)
						: false
			}))
			.sort((a, b) => {
				if (a.type === 'rally_system') return -1;
				if (b.type === 'rally_system') return 1;
				if (a.isFinishedEvent !== b.isFinishedEvent) return a.isFinishedEvent ? 1 : -1;
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
		if (longPressOpenedConversationId === conversationId) {
			longPressOpenedConversationId = '';
			return;
		}

		const currentUser = auth.currentUser;

		if (currentUser) {
			await markConversationAsRead(conversationId, currentUser.uid);
		}

		await goto(`/messages/${conversationId}`);
	}

	async function handleDeleteConversation(conversation: ConversationWithProfile) {
		const currentUser = auth.currentUser;

		if (!currentUser) return;
		if (!confirm(`Remove "${conversation.displayName}" from your chat list?`)) return;

		actionLoading = `conversation-${conversation.id}`;
		error = '';

		try {
			await hideConversationForUser(conversation.id, currentUser.uid);
			openConversationMenuId = '';
		} catch (err) {
			console.error('Delete conversation error:', err);
			error = err instanceof Error ? err.message : 'Could not remove conversation.';
		} finally {
			actionLoading = '';
		}
	}

	async function handleClearConversation(conversation: ConversationWithProfile) {
		const currentUser = auth.currentUser;

		if (!currentUser) return;
		if (!confirm(`Clear all messages from "${conversation.displayName}" for you?`)) return;

		actionLoading = `clear-${conversation.id}`;
		error = '';

		try {
			await clearConversationForUser(conversation.id, currentUser.uid);
			openConversationMenuId = '';
		} catch (err) {
			console.error('Clear conversation error:', err);
			error = err instanceof Error ? err.message : 'Could not clear conversation.';
		} finally {
			actionLoading = '';
		}
	}

	onMount(() => {
		loadConversationPrefs();
		loadMessagesPage();
	});

	onDestroy(() => {
		stopConversationsListener();
		stopInvitesListener();
		stopFriendRequestsListener();
		clearLongPress();
	});
</script>

<main
	class="min-h-screen bg-white text-slate-950 dark:bg-slate-950 dark:text-white"
	onpointerdown={closeConversationMenuOnOutsidePress}
>
	<div class="mx-auto max-w-4xl px-4 py-4 sm:px-5 sm:py-6">
		<header class="mb-4 sm:mb-6">
			<div class="hidden sm:block">
				<RallyWordmark size="sm" />
			</div>
			<h1 class="text-2xl font-black tracking-tight sm:mt-3 sm:text-3xl">Messages</h1>
			<p class="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">
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
			<section class="mb-6 sm:mb-8">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-sm font-black uppercase tracking-[0.16em] text-slate-400 sm:text-base sm:normal-case sm:tracking-normal sm:text-slate-950 sm:dark:text-white">Event invitations</h2>
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
								class="min-w-[220px] max-w-[220px] rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900 sm:min-w-[280px] sm:max-w-[280px] sm:rounded-3xl sm:p-4"
							>
								{#if invite.event}
									<p
										class="text-xs font-black uppercase tracking-wide text-blue-600 dark:text-blue-400"
									>
										{invite.event.sport}
									</p>

									<h3 class="mt-1 truncate text-base font-black sm:text-lg">
										{invite.event.title}
									</h3>

									<p class="mt-1 truncate text-xs text-slate-500 dark:text-slate-400 sm:mt-2 sm:text-sm">
										📍 {invite.event.location.name}
									</p>

									<p class="mt-1 truncate text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
										🕒 {formatDate(invite.event.startAt)}
									</p>

									<div class="mt-3 flex items-center justify-between gap-2 sm:mt-4">
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

			<section class="mb-6 sm:mb-8">
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

			<section class="mb-6 sm:mb-8">
				<h2 class="mb-3 text-sm font-black uppercase tracking-[0.16em] text-slate-400 sm:text-base sm:normal-case sm:tracking-normal sm:text-slate-950 sm:dark:text-white">Chats</h2>

				{#if conversations.length === 0}
					<p class="text-sm text-slate-500 dark:text-slate-400">
						No conversations yet. Start a chat from your friends below.
					</p>
				{:else}
					<div class="divide-y divide-slate-100 dark:divide-slate-800">
						{#each activeConversations as conversation (conversation.id)}
							<div
								role="group"
								class="relative flex w-full items-center gap-2 rounded-2xl p-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800 sm:rounded-3xl sm:p-2"
								oncontextmenu={(event) => {
									event.preventDefault();
									showConversationMenu(conversation.id);
								}}
								onpointerdown={() => startLongPress(conversation.id)}
								onpointerup={finishLongPress}
								onpointerleave={clearLongPress}
							>
								<button
									type="button"
									onclick={() => openConversation(conversation.id)}
									class="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1 text-left"
								>
									<div
										class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full sm:h-12 sm:w-12 {conversation.type ===
										'rally_system'
											? 'bg-blue-600 text-white'
											: 'bg-slate-100 text-blue-600 dark:bg-slate-800 dark:text-blue-300'} text-base font-black"
									>
										{#if conversation.type === 'rally_system'}
											<svg
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2.5"
												stroke-linecap="round"
												stroke-linejoin="round"
												class="h-5 w-5"
												aria-hidden="true"
											>
												<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
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
												<span
													class="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white"
												>
													Official
												</span>
											{/if}

											{#if pinnedConversationIds.includes(conversation.id)}
												<span class="text-xs text-blue-500" aria-label="Pinned">●</span>
											{/if}

											{#if mutedConversationIds.includes(conversation.id)}
												<span class="text-xs text-slate-400" aria-label="Muted">Muted</span>
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

								{#if conversation.type !== 'rally_system'}
									<button
										type="button"
										onclick={() => openConversationMenu(conversation.id)}
										data-conversation-menu
										class="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-slate-800 dark:hover:bg-slate-900 dark:hover:text-white md:flex"
										aria-label="Conversation options"
									>
										⌄
									</button>

									{#if openConversationMenuId === conversation.id}
										<div
											role="menu"
											tabindex="-1"
											data-conversation-menu
											class="absolute right-3 top-12 z-20 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 text-sm shadow-2xl shadow-slate-300/50 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40"
											onpointerdown={(event) => event.stopPropagation()}
											onpointerup={(event) => event.stopPropagation()}
											onclick={(event) => event.stopPropagation()}
											onkeydown={(event) => event.stopPropagation()}
										>
											<button
												type="button"
												onclick={() => toggleConversationPin(conversation.id)}
												class="block w-full rounded-xl px-3 py-2 text-left font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
											>
												{pinnedConversationIds.includes(conversation.id)
													? 'Unpin chat'
													: 'Pin chat'}
											</button>
											<button
												type="button"
												onclick={() => toggleConversationMute(conversation.id)}
												class="block w-full rounded-xl px-3 py-2 text-left font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
											>
												{mutedConversationIds.includes(conversation.id)
													? 'Unmute chat'
													: 'Mute chat'}
											</button>
											<button
												type="button"
												onclick={() => handleClearConversation(conversation)}
												disabled={actionLoading === `clear-${conversation.id}`}
												class="block w-full rounded-xl px-3 py-2 text-left font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
											>
												Clear chat
											</button>
											<button
												type="button"
												onclick={() => handleDeleteConversation(conversation)}
												disabled={actionLoading === `conversation-${conversation.id}`}
												class="block w-full rounded-xl px-3 py-2 text-left font-bold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
											>
												Delete chat
											</button>
										</div>
									{/if}
								{/if}
							</div>
						{/each}

						{#if finishedEventConversations.length > 0}
							<button
								type="button"
								onclick={() => (showFinishedChats = !showFinishedChats)}
								class="flex w-full items-center gap-2 py-3 text-left"
							>
								<span
									class="text-xs font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500"
								>
									Finished events
								</span>
								<span
									class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400"
								>
									{finishedEventConversations.length}
								</span>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="ml-auto h-4 w-4 text-slate-400 transition-transform duration-200 dark:text-slate-500 {showFinishedChats
										? 'rotate-180'
										: ''}"
									aria-hidden="true"
								>
									<path d="M6 9l6 6 6-6" />
								</svg>
							</button>

							{#if showFinishedChats}
								{#each finishedEventConversations as conversation (conversation.id)}
									<div
										role="group"
										class="relative flex w-full items-center gap-2 rounded-3xl p-2 opacity-60 transition hover:bg-slate-100 hover:opacity-100 dark:hover:bg-slate-800"
										oncontextmenu={(event) => {
											event.preventDefault();
											showConversationMenu(conversation.id);
										}}
										onpointerdown={() => startLongPress(conversation.id)}
										onpointerup={finishLongPress}
										onpointerleave={clearLongPress}
									>
										<button
											type="button"
											onclick={() => openConversation(conversation.id)}
											class="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1 text-left"
										>
											<div
												class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full sm:h-12 sm:w-12 bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 text-base font-black"
											>
												{#if conversation.displayPhotoURL}
													<img
														src={conversation.displayPhotoURL}
														alt={conversation.displayName}
														class="h-full w-full object-cover grayscale"
													/>
												{:else}
													{conversation.displayName.charAt(0).toUpperCase()}
												{/if}
											</div>

											<div class="min-w-0 flex-1">
												<p class="truncate font-black text-slate-950 dark:text-slate-50">
													{conversation.displayName}
												</p>
												<p class="truncate text-xs text-slate-500 dark:text-slate-400">
													{conversation.lastMessage ?? conversation.displaySubtitle}
												</p>
											</div>

											{#if conversation.unreadCount > 0}
												<span
													class="flex min-h-6 min-w-6 items-center justify-center rounded-full bg-slate-400 px-2 text-xs font-black text-white dark:bg-slate-600"
												>
													{formatUnreadCount(conversation.unreadCount)}
												</span>
											{/if}
										</button>

										<button
											type="button"
											onclick={() => openConversationMenu(conversation.id)}
											data-conversation-menu
											class="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-slate-800 dark:hover:bg-slate-900 dark:hover:text-white md:flex"
											aria-label="Conversation options"
										>
											⌄
										</button>

										{#if openConversationMenuId === conversation.id}
											<div
												role="menu"
												tabindex="-1"
												data-conversation-menu
												class="absolute right-3 top-12 z-20 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 text-sm shadow-2xl shadow-slate-300/50 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40"
												onpointerdown={(event) => event.stopPropagation()}
												onpointerup={(event) => event.stopPropagation()}
												onclick={(event) => event.stopPropagation()}
												onkeydown={(event) => event.stopPropagation()}
											>
												<button
													type="button"
													onclick={() => toggleConversationPin(conversation.id)}
													class="block w-full rounded-xl px-3 py-2 text-left font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
												>
													{pinnedConversationIds.includes(conversation.id)
														? 'Unpin chat'
														: 'Pin chat'}
												</button>
												<button
													type="button"
													onclick={() => toggleConversationMute(conversation.id)}
													class="block w-full rounded-xl px-3 py-2 text-left font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
												>
													{mutedConversationIds.includes(conversation.id)
														? 'Unmute chat'
														: 'Mute chat'}
												</button>
												<button
													type="button"
													onclick={() => handleClearConversation(conversation)}
													disabled={actionLoading === `clear-${conversation.id}`}
													class="block w-full rounded-xl px-3 py-2 text-left font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
												>
													Clear chat
												</button>
												<button
													type="button"
													onclick={() => handleDeleteConversation(conversation)}
													disabled={actionLoading === `conversation-${conversation.id}`}
													class="block w-full rounded-xl px-3 py-2 text-left font-bold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
												>
													Delete chat
												</button>
											</div>
										{/if}
									</div>
								{/each}
							{/if}
						{/if}
					</div>
				{/if}
			</section>

			<section>
				<h2 class="mb-3 text-sm font-black uppercase tracking-[0.16em] text-slate-400 sm:text-base sm:normal-case sm:tracking-normal sm:text-slate-950 sm:dark:text-white">Rally friends</h2>

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
									class="shrink-0 rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-blue-600 transition hover:bg-blue-600 hover:text-white dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-600 dark:hover:text-white"
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
