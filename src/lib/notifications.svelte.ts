import type { Unsubscribe } from 'firebase/firestore';
import { listenConversationsForUser } from '$lib/services/chat.service';
import { listenFriendRequestsForUser } from '$lib/services/social.service';
import { listenInvitesForUser } from '$lib/services/invite.service';
import type { ChatConversation, EventInvite, FriendRequest } from '$lib/schema';

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

	const unsubscribeConversations = listenConversationsForUser(userId, (conversations: ChatConversation[]) => {
		notificationState.unreadMessages = conversations.filter((conversation) =>
			conversation.unreadFor?.includes(userId)
		).length;

		updateTotal();
		notificationState.ready = true;
	});

	const unsubscribeInvites = listenInvitesForUser(userId, (invites: EventInvite[]) => {
		notificationState.pendingInvites = invites.filter(
			(invite) => invite.status === 'pending'
		).length;

		updateTotal();
		notificationState.ready = true;
	});

	const unsubscribeFriendRequests = listenFriendRequestsForUser(userId, (requests: FriendRequest[]) => {
		notificationState.pendingFriendRequests = requests.filter(
			(request) => request.status === 'pending'
		).length;

		updateTotal();
		notificationState.ready = true;
	});

	unsubscribers = [
		unsubscribeConversations,
		unsubscribeInvites,
		unsubscribeFriendRequests
	];
}