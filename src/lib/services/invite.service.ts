// src/lib/services/invite.service.ts
import {
	addDoc,
	collection,
	doc,
	getDocs,
	onSnapshot,
	query,
	serverTimestamp,
	updateDoc,
	where,
	type Unsubscribe
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { EventInvite, InviteStatus } from '$lib/schema';
import { joinEvent } from '$lib/services/event.service';

export async function inviteUserToEvent(params: {
	eventId: string;
	fromUserId: string;
	toUserId: string;
}) {
	const inviteData = {
		eventId: params.eventId,
		fromUserId: params.fromUserId,
		toUserId: params.toUserId,
		status: 'pending' satisfies InviteStatus,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	const docRef = await addDoc(collection(db, 'eventInvites'), inviteData);

	return {
		id: docRef.id,
		...inviteData
	};
}

export async function inviteUsersToEvent(params: {
	eventId: string;
	fromUserId: string;
	toUserIds: string[];
}) {
	const uniqueUserIds = [...new Set(params.toUserIds)].filter(
		(userId) => userId && userId !== params.fromUserId
	);

	await Promise.all(
		uniqueUserIds.map((toUserId) =>
			inviteUserToEvent({
				eventId: params.eventId,
				fromUserId: params.fromUserId,
				toUserId
			})
		)
	);

	return uniqueUserIds.length;
}

export async function getInvitesForUser(userId: string) {
	const q = query(collection(db, 'eventInvites'), where('toUserId', '==', userId));

	const snap = await getDocs(q);

	return snap.docs.map((docSnap) => ({
		id: docSnap.id,
		...docSnap.data()
	})) as EventInvite[];
}

export async function respondToInvite(params: {
	inviteId: string;
	eventId: string;
	userId: string;
	status: InviteStatus;
}) {
	const inviteRef = doc(db, 'eventInvites', params.inviteId);

	if (params.status === 'accepted') {
		await joinEvent(params.eventId, params.userId);
	}

	await updateDoc(inviteRef, {
		status: params.status,
		updatedAt: serverTimestamp()
	});
}
export function listenInvitesForUser(
	userId: string,
	callback: (invites: EventInvite[]) => void,
	onError?: (error: Error) => void
): Unsubscribe {
	const q = query(
		collection(db, 'eventInvites'),
		where('toUserId', '==', userId)
	);

	return onSnapshot(
		q,
		(snap) => {
			const invites = snap.docs.map((docSnap) => ({
				id: docSnap.id,
				...docSnap.data()
			})) as EventInvite[];

			callback(invites);
		},
		(error) => {
			console.error('Invites listener error:', error);
			onError?.(error);
		}
	);
}