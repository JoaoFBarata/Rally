import {
	addDoc,
	collection,
	doc,
	getDoc,
	getDocs,
	orderBy,
	query,
	serverTimestamp,
	Timestamp,
	updateDoc,
	where
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { EventStatus, EventVisibility, Sport, SportEvent } from '$lib/schema';

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

	return {
		id: docRef.id,
		...eventData
	};
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
}