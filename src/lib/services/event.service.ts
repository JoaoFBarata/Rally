// src/lib/services/event.service.ts

import {
	addDoc,
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	serverTimestamp,
	setDoc,
	Timestamp,
	updateDoc,
	where
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type {
	EventHostType,
	EventPaymentMode,
	EventStatus,
	EventVisibility,
	Sport,
	SportEvent,
	SportLevel
} from '$lib/schema';
import {
	getOrganizationById,
	isOrganizationAdmin,
	canCreateOfficialPaidEvents
} from '$lib/services/organization.service';

export function getEventGroupConversationId(eventId: string) {
	return `event_${eventId}`;
}

export function getEventStartAtMillis(event: SportEvent) {
	const startAt = event.startAt as unknown as { toMillis?: () => number; toDate?: () => Date };

	if (startAt?.toMillis) return startAt.toMillis();
	if (startAt?.toDate) return startAt.toDate().getTime();

	return 0;
}

export function isEventFinished(event: SportEvent) {
	if (event.status === 'finished') return true;
	if (event.status === 'cancelled') return false;

	const startAtMs = getEventStartAtMillis(event);

	if (!startAtMs) return false;

	return startAtMs < Date.now();
}

export function getEffectiveEventStatus(event: SportEvent): EventStatus {
	if (event.status === 'cancelled') return 'cancelled';
	if (isEventFinished(event)) return 'finished';
	return event.status;
}

export function sortEventsByStartDate(events: SportEvent[]) {
	return [...events].sort((a, b) => getEventStartAtMillis(a) - getEventStartAtMillis(b));
}

export function getUpcomingEvents(events: SportEvent[]) {
	return sortEventsByStartDate(
		events.filter((event) => {
			const status = getEffectiveEventStatus(event);
			return status !== 'cancelled' && status !== 'finished';
		})
	);
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
			createdAt: serverTimestamp(),
		},
		{ merge: true }
	);
}

export async function ensureEventGroupConversation(eventId: string) {
	const event = await getEventById(eventId);

	if (!event) {
		throw new Error('Event not found');
	}

	await syncEventGroupConversation(event);

	return getEventGroupConversationId(eventId);
}

async function assertCanManageEvent(event: SportEvent, userId: string) {
	if (event.creatorId === userId) return;

	if (event.hostType === 'organization' && event.organizationId) {
		const organization = await getOrganizationById(event.organizationId);

		if (organization && isOrganizationAdmin(organization, userId)) return;
	}

	throw new Error('You do not have permission to manage this event.');
}

export async function createSportEvent(params: {
	title: string;
	description?: string;
	sport: Sport;
	level?: SportLevel;
	creatorId: string;
	hostType?: EventHostType;
	organizationId?: string | null;
	locationName: string;
	address?: string;
	lat?: number;
	lng?: number;
	startAt: Date;
	endAt?: Date;
	maxParticipants: number;
	visibility?: EventVisibility;
	priceTotal?: number;
	paymentMode?: EventPaymentMode;
	groupPhotoURL?: string | null;
}) {
	const hostType = params.hostType ?? 'user';
	const paymentMode: EventPaymentMode = params.paymentMode ?? (params.priceTotal ? 'split' : 'none');

	let organizationSnapshot: {
		organizationId: string | null;
		organizationName: string | null;
		organizationLogoURL: string | null;
		organizationVerificationStatus: SportEvent['organizationVerificationStatus'];
	} = {
		organizationId: null,
		organizationName: null,
		organizationLogoURL: null,
		organizationVerificationStatus: null
	};

	if (hostType === 'organization') {
		if (!params.organizationId) {
			throw new Error('Choose an organization to host this event.');
		}

		const organization = await getOrganizationById(params.organizationId);

		if (!organization) {
			throw new Error('Organization not found.');
		}

		if (!isOrganizationAdmin(organization, params.creatorId)) {
			throw new Error('You do not have permission to create events for this organization.');
		}

		if (paymentMode === 'official' && !canCreateOfficialPaidEvents(organization)) {
			throw new Error('Only verified organizations can create official paid events.');
		}

		organizationSnapshot = {
			organizationId: organization.id,
			organizationName: organization.name,
			organizationLogoURL: organization.logoURL ?? null,
			organizationVerificationStatus: organization.verificationStatus
		};
	} else if (paymentMode === 'official') {
		throw new Error('Official paid events can only be created by verified organizations.');
	}

	const participantIds = [params.creatorId];

	const pricePerPerson =
		params.priceTotal && params.maxParticipants > 0
			? params.priceTotal / params.maxParticipants
			: undefined;

	const eventData = {
		title: params.title,
		description: params.description ?? '',
		sport: params.sport,
		level: params.level ?? 'casual',
		creatorId: params.creatorId,
		hostType,
		...organizationSnapshot,
		groupPhotoURL: params.groupPhotoURL ?? null,
		groupPhotoPath: null,

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
		paymentMode,

		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp(),

	};

	const docRef = await addDoc(collection(db, 'events'), eventData);

	const createdEvent = {
		id: docRef.id,
		...eventData
	} as unknown as SportEvent;

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
	const q = query(collection(db, 'events'), where('creatorId', '==', userId));
	const snap = await getDocs(q);

	const events = snap.docs.map((docSnap) => ({
		id: docSnap.id,
		...docSnap.data()
	})) as SportEvent[];

	return sortEventsByStartDate(events);
}

export async function getEventsCreatedByOrganization(organizationId: string) {
	const q = query(collection(db, 'events'), where('organizationId', '==', organizationId));
	const snap = await getDocs(q);

	const events = snap.docs.map((docSnap) => ({
		id: docSnap.id,
		...docSnap.data()
	})) as SportEvent[];

	return sortEventsByStartDate(events);
}

export async function getEventsForUser(userId: string) {
	const q = query(collection(db, 'events'), where('participantIds', 'array-contains', userId));
	const snap = await getDocs(q);

	const events = snap.docs.map((docSnap) => ({
		id: docSnap.id,
		...docSnap.data()
	})) as SportEvent[];

	return sortEventsByStartDate(events);
}

export async function getEventsJoinedByUser(userId: string) {
	const events = await getEventsForUser(userId);

	return events.filter((event) => event.creatorId !== userId);
}

export async function joinEvent(eventId: string, userId: string) {
	const event = await getEventById(eventId);

	if (!event) {
		throw new Error('Event not found');
	}

	const status = getEffectiveEventStatus(event);

	if (status === 'cancelled') {
		throw new Error('This event has been cancelled.');
	}

	if (status === 'finished') {
		throw new Error('This event has already finished.');
	}

	if (event.participantIds.includes(userId)) {
		await syncEventGroupConversation(event);
		return;
	}

	if (event.participantIds.length >= event.maxParticipants || status === 'full') {
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

	await assertCanManageEvent(event, userId);

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

	await assertCanManageEvent(event, params.creatorId);

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
	groupPhotoPath?: string;
}) {
	const event = await getEventById(params.eventId);

	if (!event) {
		throw new Error('Event not found');
	}

	await assertCanManageEvent(event, params.userId);

	await updateDoc(doc(db, 'events', params.eventId), {
		groupPhotoURL: params.groupPhotoURL,
		groupPhotoPath: params.groupPhotoPath ?? null,
		updatedAt: serverTimestamp()
	});

	await syncEventGroupConversation({
		...event,
		groupPhotoURL: params.groupPhotoURL
	});
}
