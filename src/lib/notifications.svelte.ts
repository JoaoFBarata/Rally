import type { Unsubscribe } from 'firebase/firestore';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '$lib/firebase';
import { listenConversationsForUser } from '$lib/services/chat.service';
import { listenFriendRequestsForUser } from '$lib/services/social.service';
import { listenInvitesForUser } from '$lib/services/invite.service';
import type { ChatConversation, EventInvite, FriendRequest } from '$lib/schema';
import { toastState } from '$lib/toast.svelte';
import { getUserProfile } from '$lib/services/user.service';

export const notificationState = $state({
	unreadMessages: 0,
	pendingInvites: 0,
	pendingFriendRequests: 0,
	total: 0,
	ready: false
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
}

export function startNotifications(userId: string) {
	stopNotifications();

	// ─── Conversations (New Messages) ──────────────────────────────────────────
	let conversationsInitialized = false;
	const lastMessageTimes = new Map<string, number>();

	const unsubscribeConversations = listenConversationsForUser(userId, (conversations: ChatConversation[]) => {
		notificationState.unreadMessages = conversations.reduce((total, conversation) => {
			const directCount = conversation.unreadCounts?.[userId];

			if (typeof directCount === 'number') {
				return total + directCount;
			}

			return total + (conversation.unreadFor?.includes(userId) ? 1 : 0);
		}, 0);

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

	const unsubscribeInvites = listenInvitesForUser(userId, (invites: EventInvite[]) => {
		const pendingInvites = invites.filter((invite) => invite.status === 'pending');
		notificationState.pendingInvites = pendingInvites.length;

		for (const invite of pendingInvites) {
			if (invitesInitialized && !currentInviteIds.has(invite.id)) {
				getDoc(doc(db, 'events', invite.eventId)).then((eventSnap) => {
					const eventTitle = eventSnap.exists() ? eventSnap.data().title : 'um evento';
					toastState.add(
						'Novo Convite de Evento!',
						`Foste convidado para participar em "${eventTitle}".`,
						'invite'
					);
				});
			}
		}

		currentInviteIds.clear();
		for (const invite of pendingInvites) {
			currentInviteIds.add(invite.id);
		}

		invitesInitialized = true;
		updateTotal();
		notificationState.ready = true;
	});

	// ─── Friend Requests ────────────────────────────────────────────────────────
	let friendRequestsInitialized = false;
	const currentRequestIds = new Set<string>();

	const unsubscribeFriendRequests = listenFriendRequestsForUser(userId, (requests: FriendRequest[]) => {
		const pendingRequests = requests.filter((request) => request.status === 'pending');
		notificationState.pendingFriendRequests = pendingRequests.length;

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