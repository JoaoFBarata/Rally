// src/lib/services/event.service.ts

import {
	addDoc,
	collection,
	doc,
	getDoc,
	getDocs,
	orderBy,
	query,
	serverTimestamp,
	setDoc,
	Timestamp,
	updateDoc,
	where
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { EventStatus, EventVisibility, Sport, SportEvent } from '$lib/schema';

export function getEventGroupConversationId(eventId: string) {
	return `event_${eventId}`;
}

async function syncEventGroupConversation(event: SportEvent) {
	const conversationId = getEventGroupConversationId(event.id);
	const conversationRef = doc(db, 'conversations', conversationId);

	await setDoc(
		conversationRef,
		{
			id: conversationId,
			type: 'group',
			eventId: event.id,
			title: event.title,
			photoURL: event.groupPhotoURL ?? null,
			memberIds: event.participantIds ?? [],
			updatedAt: serverTimestamp(),
			createdAt: serverTimestamp()
		},
		{ merge: true }
	);
}

export async function createSportEvent(params: {
	title: string;
	description?: string;
	sport: Sport;
	creatorId: string;
	locationName: string;
	address?: string;
	lat?: number;
	lng?: number;
	startAt: Date;
	endAt?: Date;
	maxParticipants: number;
	visibility?: EventVisibility;
	priceTotal?: number;
	groupPhotoURL?: string | null;
}) {
	const participantIds = [params.creatorId];

	const pricePerPerson =
		params.priceTotal && params.maxParticipants > 0
			? params.priceTotal / params.maxParticipants
			: undefined;

	const eventData = {
		title: params.title,
		description: params.description ?? '',
		sport: params.sport,
		creatorId: params.creatorId,
		groupPhotoURL: params.groupPhotoURL ?? null,

		location: {
			name: params.locationName,
			address: params.address ?? '',
			lat: params.lat ?? null,
			lng: params.lng ?? null
		},

		startAt: Timestamp.fromDate(params.startAt),
		endAt: params.endAt ? Timestamp.fromDate(params.endAt) : null,

		maxParticipants: params.maxParticipants,
		participantIds,

		visibility: params.visibility ?? 'private',
		status: 'open' satisfies EventStatus,

		priceTotal: params.priceTotal ?? null,
		pricePerPerson: pricePerPerson ?? null,
		currency: 'EUR',

		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	const docRef = await addDoc(collection(db, 'events'), eventData);

	const createdEvent = {
		id: docRef.id,
		...eventData
	} as SportEvent;

	await syncEventGroupConversation(createdEvent);

	return createdEvent;
}

export async function getEventById(eventId: string) {
	const eventRef = doc(db, 'events', eventId);
	const snap = await getDoc(eventRef);

	if (!snap.exists()) return null;

	return {
		id: snap.id,
		...snap.data()
	} as SportEvent;
}

export async function getEventsCreatedByUser(userId: string) {
	const q = query(
		collection(db, 'events'),
		where('creatorId', '==', userId),
		orderBy('startAt', 'asc')
	);

	const snap = await getDocs(q);

	return snap.docs.map((docSnap) => ({
		id: docSnap.id,
		...docSnap.data()
	})) as SportEvent[];
}

export async function joinEvent(eventId: string, userId: string) {
	const event = await getEventById(eventId);

	if (!event) {
		throw new Error('Event not found');
	}

	if (event.status === 'cancelled') {
		throw new Error('This event has been cancelled.');
	}

	if (event.participantIds.includes(userId)) {
		return;
	}

	if (event.participantIds.length >= event.maxParticipants) {
		throw new Error('Event is already full');
	}

	const newParticipantIds = [...event.participantIds, userId];

	const newStatus: EventStatus =
		newParticipantIds.length >= event.maxParticipants ? 'full' : 'open';

	await updateDoc(doc(db, 'events', eventId), {
		participantIds: newParticipantIds,
		status: newStatus,
		updatedAt: serverTimestamp()
	});

	await syncEventGroupConversation({
		...event,
		participantIds: newParticipantIds,
		status: newStatus
	});
}

export async function leaveEvent(eventId: string, userId: string) {
	const event = await getEventById(eventId);

	if (!event) {
		throw new Error('Event not found');
	}

	if (event.creatorId === userId) {
		throw new Error('The creator cannot leave the event. Cancel the event instead.');
	}

	if (!event.participantIds.includes(userId)) {
		return;
	}

	const newParticipantIds = event.participantIds.filter((id) => id !== userId);

	const newStatus: EventStatus =
		event.status === 'cancelled'
			? 'cancelled'
			: newParticipantIds.length >= event.maxParticipants
				? 'full'
				: 'open';

	await updateDoc(doc(db, 'events', eventId), {
		participantIds: newParticipantIds,
		status: newStatus,
		updatedAt: serverTimestamp()
	});

	await syncEventGroupConversation({
		...event,
		participantIds: newParticipantIds,
		status: newStatus
	});
}

export async function cancelEvent(eventId: string, userId: string) {
	const event = await getEventById(eventId);

	if (!event) {
		throw new Error('Event not found');
	}

	if (event.creatorId !== userId) {
		throw new Error('Only the creator can cancel this event.');
	}

	await updateDoc(doc(db, 'events', eventId), {
		status: 'cancelled',
		updatedAt: serverTimestamp()
	});

	await syncEventGroupConversation({
		...event,
		status: 'cancelled'
	});
}

export async function removeParticipantFromEvent(params: {
	eventId: string;
	creatorId: string;
	participantId: string;
}) {
	const event = await getEventById(params.eventId);

	if (!event) {
		throw new Error('Event not found');
	}

	if (event.creatorId !== params.creatorId) {
		throw new Error('Only the creator can remove people from this event.');
	}

	if (params.participantId === event.creatorId) {
		throw new Error('The creator cannot be removed.');
	}

	const newParticipantIds = event.participantIds.filter((id) => id !== params.participantId);

	const newStatus: EventStatus =
		event.status === 'cancelled'
			? 'cancelled'
			: newParticipantIds.length >= event.maxParticipants
				? 'full'
				: 'open';

	await updateDoc(doc(db, 'events', params.eventId), {
		participantIds: newParticipantIds,
		status: newStatus,
		updatedAt: serverTimestamp()
	});

	await syncEventGroupConversation({
		...event,
		participantIds: newParticipantIds,
		status: newStatus
	});
}

export async function updateEventGroupPhoto(params: {
	eventId: string;
	userId: string;
	groupPhotoURL: string;
}) {
	const event = await getEventById(params.eventId);

	if (!event) {
		throw new Error('Event not found');
	}

	if (event.creatorId !== params.userId) {
		throw new Error('Only the creator can update the group photo.');
	}

	await updateDoc(doc(db, 'events', params.eventId), {
		groupPhotoURL: params.groupPhotoURL,
		updatedAt: serverTimestamp()
	});

	await syncEventGroupConversation({
		...event,
		groupPhotoURL: params.groupPhotoURL
	});
}