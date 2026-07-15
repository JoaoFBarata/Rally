import type { Unsubscribe } from 'firebase/firestore';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '$lib/firebase';
import { listenConversationsForUser } from '$lib/services/chat.service';
import { listenFriendRequestsForUser } from '$lib/services/social.service';
import { listenInvitesForUser } from '$lib/services/invite.service';
import { getEffectiveEventStatus } from '$lib/services/event.service';
import type { ChatConversation, EventInvite, FriendRequest, SportEvent } from '$lib/schema';
import { toastState } from '$lib/toast.svelte';
import { getUserProfile } from '$lib/services/user.service';

export type NotificationPreview = {
	id: string;
	type: 'message' | 'invite' | 'friend_request';
	title: string;
	body: string;
	href: string;
	createdAtMs: number;
	photoURL?: string | null;
};

export const notificationState = $state({
	unreadMessages: 0,
	pendingInvites: 0,
	pendingFriendRequests: 0,
	total: 0,
	ready: false,
	previews: [] as NotificationPreview[]
});

let unsubscribers: Unsubscribe[] = [];

function updateTotal() {
	notificationState.total =
		notificationState.unreadMessages +
		notificationState.pendingInvites +
		notificationState.pendingFriendRequests;
}

export function stopNotifications() {
	for (const unsubscribe of unsubscribers) {
		unsubscribe();
	}

	unsubscribers = [];

	notificationState.unreadMessages = 0;
	notificationState.pendingInvites = 0;
	notificationState.pendingFriendRequests = 0;
	notificationState.total = 0;
	notificationState.ready = false;
	notificationState.previews = [];
}

function getTimestampMillis(value: unknown) {
	try {
		const timestamp = value as { toMillis?: () => number; toDate?: () => Date };
		if (timestamp?.toMillis) return timestamp.toMillis();
		if (timestamp?.toDate) return timestamp.toDate().getTime();
		return 0;
	} catch {
		return 0;
	}
}

function mergeNotificationPreviews(type: NotificationPreview['type'], previews: NotificationPreview[]) {
	const existing = notificationState.previews.filter((item) => item.type !== type);
	notificationState.previews = [...existing, ...previews]
		.sort((a, b) => b.createdAtMs - a.createdAtMs)
		.slice(0, 30);
}

export function startNotifications(userId: string) {
	stopNotifications();

	// ─── Conversations (New Messages) ──────────────────────────────────────────
	let conversationsInitialized = false;
	const lastMessageTimes = new Map<string, number>();
	let conversationPreviewVersion = 0;

	const unsubscribeConversations = listenConversationsForUser(userId, (conversations: ChatConversation[]) => {
		const unreadConversations = conversations.filter((conversation) => {
			const directCount = conversation.unreadCounts?.[userId];
			return typeof directCount === 'number'
				? directCount > 0
				: conversation.unreadFor?.includes(userId);
		});

		notificationState.unreadMessages = unreadConversations.length;

		const previewVersion = ++conversationPreviewVersion;
		void Promise.all(
			unreadConversations.map(async (conversation) => {
				let title = conversation.title || 'New message';
				let photoURL = conversation.photoURL ?? conversation.organizationLogoURL ?? null;

				if (conversation.type === 'direct') {
					const otherUserId = conversation.memberIds.find((id) => id !== userId);
					const profile = otherUserId ? await getUserProfile(otherUserId) : null;
					title = profile?.displayName ?? 'Rally user';
					photoURL = profile?.photoURL ?? null;
				} else if (conversation.type === 'organization_direct') {
					title = conversation.organizationName ?? conversation.title ?? 'Organization';
				}

				return {
					id: `message-${conversation.id}`,
					type: 'message' as const,
					title,
					body: conversation.lastMessage || 'New message',
					href: `/messages/${conversation.id}`,
					createdAtMs: getTimestampMillis(conversation.lastMessageAt),
					photoURL
				};
			})
		).then((previews) => {
			if (previewVersion !== conversationPreviewVersion) return;
			mergeNotificationPreviews('message', previews);
		});

		for (const conversation of conversations) {
			const lastTime = conversation.lastMessageAt?.toMillis() ?? 0;
			const oldTime = lastMessageTimes.get(conversation.id);

			if (conversationsInitialized && oldTime !== undefined && lastTime > oldTime) {
				if (conversation.lastSenderId !== userId) {
					const senderId = conversation.lastSenderId;
					if (senderId) {
						getUserProfile(senderId).then((profile) => {
							const senderName = profile?.displayName || 'Alguém';
							const chatTitle = conversation.title || 'Mensagem Direta';
							const textPreview = conversation.lastMessage || 'Nova mensagem';
							toastState.add(
								`Nova mensagem em ${chatTitle}`,
								`${senderName}: "${textPreview}"`,
								'message'
							);
						});
					}
				}
			}
			lastMessageTimes.set(conversation.id, lastTime);
		}

		conversationsInitialized = true;
		updateTotal();
		notificationState.ready = true;
	});

	// ─── Event Invites ──────────────────────────────────────────────────────────
	let invitesInitialized = false;
	const currentInviteIds = new Set<string>();
	let inviteRefreshVersion = 0;

	const unsubscribeInvites = listenInvitesForUser(userId, (invites: EventInvite[]) => {
		const refreshVersion = ++inviteRefreshVersion;
		const pendingInvites = invites.filter((invite) => invite.status === 'pending');

		void Promise.all(
			pendingInvites.map(async (invite) => {
				const eventSnap = await getDoc(doc(db, 'events', invite.eventId));
				if (!eventSnap.exists()) return null;

				const event = { id: eventSnap.id, ...eventSnap.data() } as SportEvent;
				const status = getEffectiveEventStatus(event);
				if (status === 'finished' || status === 'cancelled') return null;

				return { invite, event };
			})
		).then((activeInvites) => {
			if (refreshVersion !== inviteRefreshVersion) return;

			const filteredInvites = activeInvites.filter(
				(item): item is { invite: EventInvite; event: SportEvent } => item !== null
			);

			notificationState.pendingInvites = filteredInvites.length;
			mergeNotificationPreviews(
				'invite',
				filteredInvites.map(({ invite, event }) => ({
					id: `invite-${invite.id}`,
					type: 'invite' as const,
					title: 'Event invite',
					body: event.title ?? 'Tap to see your invite',
					href: `/events/${event.id}`,
					createdAtMs: getTimestampMillis(invite.createdAt),
					photoURL: event.groupPhotoURL ?? null
				}))
			);

			for (const { invite, event } of filteredInvites) {
				if (invitesInitialized && !currentInviteIds.has(invite.id)) {
					toastState.add(
						'Novo Convite de Evento!',
						`Foste convidado para participar em "${event.title ?? 'um evento'}".`,
						'invite'
					);
				}
			}

			currentInviteIds.clear();
			for (const { invite } of filteredInvites) {
				currentInviteIds.add(invite.id);
			}

			invitesInitialized = true;
			updateTotal();
			notificationState.ready = true;
		});
	});

	// ─── Friend Requests ────────────────────────────────────────────────────────
	let friendRequestsInitialized = false;
	const currentRequestIds = new Set<string>();
	let friendRequestPreviewVersion = 0;

	const unsubscribeFriendRequests = listenFriendRequestsForUser(userId, (requests: FriendRequest[]) => {
		const pendingRequests = requests.filter((request) => request.status === 'pending');
		notificationState.pendingFriendRequests = pendingRequests.length;
		const previewVersion = ++friendRequestPreviewVersion;

		void Promise.all(
			pendingRequests.map(async (request) => {
				const profile = await getUserProfile(request.fromUserId);
				return {
					id: `friend-request-${request.id}`,
					type: 'friend_request' as const,
					title: profile?.displayName ?? 'Rally user',
					body: 'Sent you a friend request',
					href: '/messages',
					createdAtMs: getTimestampMillis(request.createdAt),
					photoURL: profile?.photoURL ?? null
				};
			})
		).then((previews) => {
			if (previewVersion !== friendRequestPreviewVersion) return;
			mergeNotificationPreviews('friend_request', previews);
		});

		for (const request of pendingRequests) {
			if (friendRequestsInitialized && !currentRequestIds.has(request.id)) {
				getUserProfile(request.fromUserId).then((profile) => {
					const senderName = profile?.displayName || 'Alguém';
					toastState.add(
						'Pedido de Amizade!',
						`${senderName} enviou-te um pedido de amizade.`,
						'invite'
					);
				});
			}
		}

		currentRequestIds.clear();
		for (const request of pendingRequests) {
			currentRequestIds.add(request.id);
		}

		friendRequestsInitialized = true;
		updateTotal();
		notificationState.ready = true;
	});

	// ─── Friendships (Listen to friend list) ────────────────────────────────────
	let friendIds = new Set<string>();
	const unsubscribeFriendships = onSnapshot(
		query(collection(db, 'friendships'), where('memberIds', 'array-contains', userId)),
		(snapshot) => {
			const currentFriendIds = new Set<string>();
			for (const d of snapshot.docs) {
				const members = d.data().memberIds as string[];
				const friendId = members.find((id) => id !== userId);
				if (friendId) {
					currentFriendIds.add(friendId);
				}
			}
			friendIds = currentFriendIds;
		}
	);

	// ─── Events (New events created by friends) ─────────────────────────────────
	let eventsInitialized = false;
	const unsubscribeEvents = onSnapshot(collection(db, 'events'), (snapshot) => {
		if (!eventsInitialized) {
			eventsInitialized = true;
			return;
		}

		for (const change of snapshot.docChanges()) {
			if (change.type === 'added') {
				const eventData = change.doc.data();
				const creatorId = eventData.creatorId;

				if (creatorId && creatorId !== userId && friendIds.has(creatorId)) {
					const eventTitle = eventData.title || 'Novo evento';
					getUserProfile(creatorId).then((profile) => {
						const creatorName = profile?.displayName || 'Um amigo';
						toastState.add(
							'Atividade de Amigos',
							`${creatorName} criou o evento "${eventTitle}".`,
							'event'
						);
					});
				}
			}
		}
	});

	unsubscribers = [
		unsubscribeConversations,
		unsubscribeInvites,
		unsubscribeFriendRequests,
		unsubscribeFriendships,
		unsubscribeEvents
	];
}
