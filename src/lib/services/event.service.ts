// src/lib/services/event.service.ts

import {
	addDoc,
	collection,
	doc,
	getDoc,
	getDocs,
	increment,
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
	EventPromotionPlan,
	EventStatus,
	EventVisibility,
	Sport,
	SportEvent,
	SportLevel
} from '$lib/schema';
import {
	canCreateOfficialPaidEvents,
	getOrganizationById,
	isOrganizationAdmin
} from '$lib/services/organization.service';

export const PROMOTION_PLANS: Record<
	EventPromotionPlan,
	{
		label: string;
		description: string;
		cpm: number;
	}
> = {
	local: {
		label: 'Local Boost',
		description: 'Best for reaching people near the event city.',
		cpm: 3
	},
	sport: {
		label: 'Sport Boost',
		description: 'Best for reaching people interested in this sport.',
		cpm: 5
	},
	featured: {
		label: 'Featured Boost',
		description: 'Best for top placement in Explore and promoted sections.',
		cpm: 8
	}
};

export function getPromotionPlanConfig(plan: EventPromotionPlan) {
	return PROMOTION_PLANS[plan];
}

export function calculatePromotionImpressionLimit(params: {
	budget: number;
	cpm: number;
}) {
	if (!params.budget || !params.cpm) return 0;

	return Math.floor((params.budget / params.cpm) * 1000);
}

export function calculatePromotionStats(event: SportEvent) {
	const views = event.promotionViews ?? 0;
	const clicks = event.promotionClicks ?? 0;
	const cpm = event.promotionCpm ?? 0;
	const impressionLimit = event.promotionImpressionLimit ?? 0;

	const ctr = views > 0 ? (clicks / views) * 100 : 0;
	const estimatedSpend = cpm > 0 ? (views / 1000) * cpm : 0;
	const remainingImpressions =
		impressionLimit > 0 ? Math.max(impressionLimit - views, 0) : null;

	return {
		views,
		clicks,
		ctr,
		estimatedSpend,
		remainingImpressions
	};
}

export function isPromotionActive(event: SportEvent) {
	if (!event.isPromoted) return false;
	if (event.promotionStatus !== 'active') return false;

	const endsAt = event.promotionEndsAt as unknown as {
		toMillis?: () => number;
		toDate?: () => Date;
	} | null;

	if (endsAt?.toMillis && endsAt.toMillis() < Date.now()) return false;
	if (endsAt?.toDate && endsAt.toDate().getTime() < Date.now()) return false;

	const views = event.promotionViews ?? 0;
	const limit = event.promotionImpressionLimit ?? 0;

	if (limit > 0 && views >= limit) return false;

	return true;
}

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

function getEventGroupMemberIds(event: SportEvent) {
	const memberIds = new Set<string>(event.participantIds ?? []);
	memberIds.add(event.creatorId);

	return Array.from(memberIds);
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
			photoURL: event.groupPhotoURL ?? event.organizationLogoURL ?? null,
			memberIds: getEventGroupMemberIds(event),
			updatedAt: serverTimestamp(),
			createdAt: serverTimestamp()
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

	const participantIds = hostType === 'organization' ? [] : [params.creatorId];

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
		paymentProtected: paymentMode === 'official',
		payoutStatus: paymentMode === 'official' ? 'held' : 'not_applicable',

		promotionStatus: 'none',
		isPromoted: false,
		promotionPlan: null,
		promotionBudget: null,
		promotionCpm: null,
		promotionImpressionLimit: null,
		promotionTargetCity: '',
		promotionTargetSport: null,
		promotionStartedAt: null,
		promotionEndsAt: null,
		promotionViews: 0,
		promotionClicks: 0,

		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
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

	const event = {
		id: snap.id,
		...snap.data()
	} as SportEvent;

	return enrichEventWithOrganization(event);
}

async function enrichEventWithOrganization(event: SportEvent): Promise<SportEvent> {
	if (event.hostType !== 'organization' || !event.organizationId) {
		return event;
	}

	const organization = await getOrganizationById(event.organizationId);

	if (!organization) {
		return event;
	}

	return {
		...event,
		hostType: 'organization',
		organizationId: organization.id,
		organizationName: organization.name,
		organizationLogoURL: organization.logoURL ?? null,
		organizationVerificationStatus: organization.verificationStatus
	};
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

function chunkArray<T>(items: T[], size: number) {
	const chunks: T[][] = [];

	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}

	return chunks;
}

export async function getEventsCreatedByOrganization(organizationId: string) {
	const organization = await getOrganizationById(organizationId);

	if (!organization) {
		return [];
	}

	const eventsById = new Map<string, SportEvent>();

	const organizationEventsQuery = query(
		collection(db, 'events'),
		where('organizationId', '==', organizationId)
	);

	const organizationEventsSnap = await getDocs(organizationEventsQuery);

	for (const docSnap of organizationEventsSnap.docs) {
		const event = {
			id: docSnap.id,
			...docSnap.data()
		} as SportEvent;

		const enrichedEvent = await enrichEventWithOrganization(event);
		eventsById.set(enrichedEvent.id, enrichedEvent);
	}

	const adminIds = organization.adminIds ?? [];

	for (const chunk of chunkArray(adminIds, 10)) {
		if (chunk.length === 0) continue;

		const adminEventsQuery = query(
			collection(db, 'events'),
			where('creatorId', 'in', chunk)
		);

		const adminEventsSnap = await getDocs(adminEventsQuery);

		for (const docSnap of adminEventsSnap.docs) {
			const event = {
				id: docSnap.id,
				...docSnap.data()
			} as SportEvent;

			if (event.organizationId && event.organizationId !== organizationId) {
				continue;
			}

			const normalizedEvent: SportEvent = {
				...event,
				hostType: 'organization',
				organizationId,
				organizationName: organization.name,
				organizationLogoURL: organization.logoURL ?? null,
				organizationVerificationStatus: organization.verificationStatus
			};

			eventsById.set(normalizedEvent.id, normalizedEvent);
		}
	}

	return sortEventsByStartDate(Array.from(eventsById.values()));
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

export async function promoteEvent(params: {
	eventId: string;
	userId: string;
	budget: number;
	durationDays: number;
	plan: EventPromotionPlan;
	targetCity?: string;
	targetSport?: Sport | null;
}) {
	const event = await getEventById(params.eventId);

	if (!event) {
		throw new Error('Event not found');
	}

	await assertCanManageEvent(event, params.userId);

	if (event.hostType !== 'organization' || !event.organizationId) {
		throw new Error('Only organization events can be promoted.');
	}

	const organization = await getOrganizationById(event.organizationId);

	if (!organization) {
		throw new Error('Organization not found.');
	}

	if (!canCreateOfficialPaidEvents(organization)) {
		throw new Error('Only verified organizations can promote events.');
	}

	const budget = Math.max(1, params.budget);
	const durationDays = Math.max(1, Math.min(params.durationDays, 30));
	const planConfig = getPromotionPlanConfig(params.plan);
	const impressionLimit = calculatePromotionImpressionLimit({
		budget,
		cpm: planConfig.cpm
	});

	const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

	await updateDoc(doc(db, 'events', params.eventId), {
		isPromoted: true,
		promotionStatus: 'active',
		promotionPlan: params.plan,
		promotionBudget: budget,
		promotionCpm: planConfig.cpm,
		promotionImpressionLimit: impressionLimit,
		promotionTargetCity: params.targetCity?.trim() ?? '',
		promotionTargetSport: params.targetSport ?? null,
		promotionStartedAt: serverTimestamp(),
		promotionEndsAt: Timestamp.fromDate(endsAt),
		promotionViews: 0,
		promotionClicks: 0,
		updatedAt: serverTimestamp()
	});
}

export async function stopEventPromotion(params: {
	eventId: string;
	userId: string;
}) {
	const event = await getEventById(params.eventId);

	if (!event) {
		throw new Error('Event not found');
	}

	await assertCanManageEvent(event, params.userId);

	await updateDoc(doc(db, 'events', params.eventId), {
		isPromoted: false,
		promotionStatus: 'ended',
		updatedAt: serverTimestamp()
	});
}

export async function trackEventPromotionView(eventId: string) {
	const event = await getEventById(eventId);

	if (!event || !isPromotionActive(event)) return;

	await updateDoc(doc(db, 'events', eventId), {
		promotionViews: increment(1),
		updatedAt: serverTimestamp()
	});
}

export async function trackEventPromotionClick(eventId: string) {
	const event = await getEventById(eventId);

	if (!event || !isPromotionActive(event)) return;

	await updateDoc(doc(db, 'events', eventId), {
		promotionClicks: increment(1),
		updatedAt: serverTimestamp()
	});
}
