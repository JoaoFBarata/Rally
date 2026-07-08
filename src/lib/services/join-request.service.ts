// src/lib/services/join-request.service.ts

import {
	addDoc,
	collection,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	query,
	serverTimestamp,
	updateDoc,
	where,
	type Unsubscribe
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { EventJoinRequest, JoinRequestStatus } from '$lib/schema';
import {
	assertCanManageEvent,
	getEffectiveEventStatus,
	getEventById,
	joinEvent
} from '$lib/services/event.service';
import { sendRallySystemMessage } from '$lib/services/chat.service';
import { getUserProfile } from '$lib/services/user.service';

export async function requestToJoinEvent(params: { eventId: string; userId: string }) {
	const event = await getEventById(params.eventId);

	if (!event) {
		throw new Error('Event not found');
	}

	if ((event.joinPolicy ?? 'open') !== 'approval') {
		await joinEvent(params.eventId, params.userId);
		return null;
	}

	const status = getEffectiveEventStatus(event);

	if (status === 'cancelled') {
		throw new Error('This event has been cancelled.');
	}

	if (status === 'finished') {
		throw new Error('This event has already finished.');
	}

	if (event.eventKind === 'tournament') {
		throw new Error('Use tournament registration instead of requesting to join.');
	}

	if (event.creatorId === params.userId || event.participantIds.includes(params.userId)) {
		throw new Error('You are already part of this event.');
	}

	if (event.participantIds.length >= event.maxParticipants || status === 'full') {
		throw new Error('Event is already full');
	}

	const existing = await getJoinRequestForUser(params);

	if (existing && existing.status === 'pending') {
		return existing;
	}

	const requestData = {
		eventId: params.eventId,
		userId: params.userId,
		status: 'pending' satisfies JoinRequestStatus,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	const docRef = await addDoc(collection(db, 'eventJoinRequests'), requestData);

	const requester = await getUserProfile(params.userId);

	void sendRallySystemMessage(
		event.creatorId,
		`${requester?.displayName ?? 'Someone'} wants to join "${event.title}". Review the request on the event page.`
	).catch((err) => console.error('Join request notification error:', err));

	return {
		id: docRef.id,
		...requestData
	};
}

export async function getJoinRequestForUser(params: { eventId: string; userId: string }) {
	const q = query(
		collection(db, 'eventJoinRequests'),
		where('eventId', '==', params.eventId),
		where('userId', '==', params.userId)
	);

	const snap = await getDocs(q);

	if (snap.empty) return null;

	const requests = snap.docs.map((docSnap) => ({
		id: docSnap.id,
		...docSnap.data()
	})) as EventJoinRequest[];

	return requests.find((request) => request.status === 'pending') ?? requests[0];
}

export function listenJoinRequestForUser(
	params: { eventId: string; userId: string },
	callback: (request: EventJoinRequest | null) => void,
	onError?: (error: Error) => void
): Unsubscribe {
	const q = query(
		collection(db, 'eventJoinRequests'),
		where('eventId', '==', params.eventId),
		where('userId', '==', params.userId)
	);

	return onSnapshot(
		q,
		(snap) => {
			const requests = snap.docs.map((docSnap) => ({
				id: docSnap.id,
				...docSnap.data()
			})) as EventJoinRequest[];

			const pending = requests.find((request) => request.status === 'pending');
			callback(pending ?? requests[0] ?? null);
		},
		(error) => {
			console.error('Join request listener error:', error);
			onError?.(error);
		}
	);
}

export function listenJoinRequestsForEvent(
	eventId: string,
	callback: (requests: EventJoinRequest[]) => void,
	onError?: (error: Error) => void
): Unsubscribe {
	const q = query(
		collection(db, 'eventJoinRequests'),
		where('eventId', '==', eventId),
		where('status', '==', 'pending')
	);

	return onSnapshot(
		q,
		(snap) => {
			const requests = snap.docs.map((docSnap) => ({
				id: docSnap.id,
				...docSnap.data()
			})) as EventJoinRequest[];

			callback(requests);
		},
		(error) => {
			console.error('Join requests listener error:', error);
			onError?.(error);
		}
	);
}

export async function respondToJoinRequest(params: {
	requestId: string;
	eventId: string;
	hostId: string;
	status: Extract<JoinRequestStatus, 'accepted' | 'declined'>;
}) {
	const requestRef = doc(db, 'eventJoinRequests', params.requestId);
	const requestSnap = await getDoc(requestRef);

	if (!requestSnap.exists()) {
		throw new Error('Join request not found.');
	}

	const request = {
		id: requestSnap.id,
		...requestSnap.data()
	} as EventJoinRequest;

	if (request.eventId !== params.eventId) {
		throw new Error('Join request does not match this event.');
	}

	if (request.status !== 'pending') {
		throw new Error('This request has already been answered.');
	}

	const event = await getEventById(params.eventId);

	if (!event) {
		throw new Error('Event not found');
	}

	await assertCanManageEvent(event, params.hostId);

	if (params.status === 'accepted') {
		await joinEvent(params.eventId, request.userId);
	}

	await updateDoc(requestRef, {
		status: params.status,
		updatedAt: serverTimestamp()
	});

	void sendRallySystemMessage(
		request.userId,
		params.status === 'accepted'
			? `Your request to join "${event.title}" was approved. You're in!`
			: `Your request to join "${event.title}" was declined.`
	).catch((err) => console.error('Join request response notification error:', err));
}
