//C:\Users\henri\Fct3Ano\ADC\Rally\src\lib\services\invite.service.ts

import {
	addDoc,
	collection,
	doc,
	getDocs,
	query,
	serverTimestamp,
	updateDoc,
	where
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

	await updateDoc(inviteRef, {
		status: params.status,
		updatedAt: serverTimestamp()
	});

	if (params.status === 'accepted') {
		await joinEvent(params.eventId, params.userId);
	}
}