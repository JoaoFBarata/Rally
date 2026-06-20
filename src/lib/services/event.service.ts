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
	SportLevel,
	EntryFeeType,
	PrizeType,
	TournamentEntry,
	TournamentFormat,
	TournamentMatch,
	TournamentRegistrationType
} from '$lib/schema';
import {
	canCreateOfficialPaidEvents,
	getOrganizationById,
	isOrganizationAdmin
} from '$lib/services/organization.service';
import { sendRallySystemMessage } from '$lib/services/chat.service';

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
	customSport?: string;
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
		...(params.sport === 'other' ? { customSport: params.customSport ?? '' } : {}),
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

	await Promise.all(
		event.participantIds.map((participantId) =>
			sendRallySystemMessage(
				participantId,
				`The event "${event.title}" has been cancelled.`
			)
		)
	);
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

function getTournamentEntryCollection() {
	return collection(db, 'tournamentEntries');
}

function getTournamentMatchCollection() {
	return collection(db, 'tournamentMatches');
}

function groupNameForIndex(index: number) {
	return String.fromCharCode(65 + index);
}

function shuffleItems<T>(items: T[]) {
	return [...items].sort(() => Math.random() - 0.5);
}

function paymentModeFromEntryFee(entryFeeType: EntryFeeType): EventPaymentMode {
	if (entryFeeType === 'paid') return 'official';
	if (entryFeeType === 'split') return 'split';
	return 'none';
}

async function assertTournamentEvent(eventId: string) {
	const event = await getEventById(eventId);

	if (!event) {
		throw new Error('Tournament not found.');
	}

	if (event.eventKind !== 'tournament') {
		throw new Error('This event is not a tournament.');
	}

	return event;
}

export async function createTournamentEvent(params: {
	title: string;
	description?: string;

	sport: Sport;
	level?: SportLevel;

	creatorId: string;
	organizationId: string;

	locationName: string;
	address?: string;
	lat?: number;
	lng?: number;

	startAt: Date;
	endAt?: Date;

	format: TournamentFormat;
	registrationType: TournamentRegistrationType;

	maxEntries: number;
	groupCount?: number;
	playoffSpots?: number;

	teamSize?: number | null;
	minTeamSize?: number | null;
	maxTeamSize?: number | null;
	allowOpenTeams?: boolean;

	registrationDeadline?: Date | null;

	entryFeeType: EntryFeeType;
	entryFeeAmount?: number | null;

	prizeType: PrizeType;
	prizeDescription?: string;
	prizeValue?: number | null;

	rules?: string;
}) {
	const organization = await getOrganizationById(params.organizationId);

	if (!organization) {
		throw new Error('Organization not found.');
	}

	if (!isOrganizationAdmin(organization, params.creatorId)) {
		throw new Error('You do not have permission to create tournaments for this organization.');
	}

	if (
		(params.entryFeeType === 'paid' || params.prizeType === 'cash') &&
		!canCreateOfficialPaidEvents(organization)
	) {
		throw new Error('Paid tournaments and cash prizes require a verified organization.');
	}

	const paymentMode = paymentModeFromEntryFee(params.entryFeeType);

	const createdEvent = await createSportEvent({
		title: params.title,
		description: params.description,
		sport: params.sport,
		level: params.level,
		creatorId: params.creatorId,
		hostType: 'organization',
		organizationId: params.organizationId,
		locationName: params.locationName,
		address: params.address,
		lat: params.lat,
		lng: params.lng,
		startAt: params.startAt,
		endAt: params.endAt,
		maxParticipants:
			params.registrationType === 'team'
				? params.maxEntries * Math.max(params.maxTeamSize ?? params.teamSize ?? 1, 1)
				: params.maxEntries,
		visibility: 'public',
		priceTotal:
			params.entryFeeType === 'free'
				? undefined
				: (params.entryFeeAmount ?? 0) * params.maxEntries,
		paymentMode
	});

	const groupCount =
		params.format === 'groups_playoff'
			? Math.max(2, params.groupCount ?? 2)
			: null;

	await updateDoc(doc(db, 'events', createdEvent.id), {
		eventKind: 'tournament',

		tournamentFormat: params.format,
		tournamentRegistrationType: params.registrationType,
		tournamentStatus: 'registration_open',

		maxTournamentEntries: params.maxEntries,
		groupCount,
		teamsPerGroup:
			params.format === 'groups_playoff' && groupCount
				? Math.ceil(params.maxEntries / groupCount)
				: null,
		playoffSpots:
			params.format === 'groups_playoff'
				? Math.max(2, params.playoffSpots ?? 4)
				: null,

		teamSize: params.teamSize ?? null,
		minTeamSize: params.minTeamSize ?? params.teamSize ?? null,
		maxTeamSize: params.maxTeamSize ?? params.teamSize ?? null,
		allowOpenTeams: params.allowOpenTeams ?? false,

		registrationDeadline: params.registrationDeadline
			? Timestamp.fromDate(params.registrationDeadline)
			: null,

		entryFeeType: params.entryFeeType,
		entryFeeAmount: params.entryFeeAmount ?? null,

		prizeType: params.prizeType,
		prizeDescription: params.prizeDescription ?? '',
		prizeValue: params.prizeValue ?? null,

		tournamentRules: params.rules ?? '',
		updatedAt: serverTimestamp()
	});

	const refreshedEvent = await getEventById(createdEvent.id);

	return refreshedEvent ?? createdEvent;
}

export async function getTournamentEntries(eventId: string) {
	const q = query(getTournamentEntryCollection(), where('eventId', '==', eventId));
	const snap = await getDocs(q);

	return snap.docs.map((docSnap) => ({
		id: docSnap.id,
		...docSnap.data()
	})) as TournamentEntry[];
}

export async function getTournamentMatches(eventId: string) {
	const q = query(getTournamentMatchCollection(), where('eventId', '==', eventId));
	const snap = await getDocs(q);

	const matches = snap.docs.map((docSnap) => ({
		id: docSnap.id,
		...docSnap.data()
	})) as TournamentMatch[];

	return matches.sort((a, b) => {
		if (a.roundNumber !== b.roundNumber) return a.roundNumber - b.roundNumber;
		return (a.groupName ?? '').localeCompare(b.groupName ?? '');
	});
}

export async function joinTournamentAsIndividual(params: {
	eventId: string;
	userId: string;
	displayName: string;
}) {
	const event = await assertTournamentEvent(params.eventId);

	if (event.tournamentRegistrationType !== 'individual') {
		throw new Error('This tournament requires team registration.');
	}

	if (event.tournamentStatus !== 'registration_open') {
		throw new Error('Tournament registration is not open.');
	}

	const entries = await getTournamentEntries(params.eventId);

	if (entries.some((entry) => entry.memberIds.includes(params.userId))) {
		throw new Error('You are already registered.');
	}

	if ((event.maxTournamentEntries ?? event.maxParticipants) <= entries.length) {
		throw new Error('Tournament is full.');
	}

	const entryRef = await addDoc(getTournamentEntryCollection(), {
		eventId: params.eventId,
		type: 'individual',
		name: params.displayName,
		captainId: params.userId,
		memberIds: [params.userId],
		isOpen: false,
		maxMembers: 1,
		groupName: null,
		seed: entries.length + 1,
		status: 'confirmed',
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	});

	if (!event.participantIds.includes(params.userId)) {
		await updateDoc(doc(db, 'events', params.eventId), {
			participantIds: [...event.participantIds, params.userId],
			updatedAt: serverTimestamp()
		});
	}

	return entryRef.id;
}

export async function createTournamentTeam(params: {
	eventId: string;
	captainId: string;
	teamName: string;
	isOpen: boolean;
}) {
	const event = await assertTournamentEvent(params.eventId);

	if (event.tournamentRegistrationType !== 'team') {
		throw new Error('This tournament uses individual registration.');
	}

	if (event.tournamentStatus !== 'registration_open') {
		throw new Error('Tournament registration is not open.');
	}

	const entries = await getTournamentEntries(params.eventId);

	if ((event.maxTournamentEntries ?? 0) <= entries.length) {
		throw new Error('Tournament is full.');
	}

	if (entries.some((entry) => entry.memberIds.includes(params.captainId))) {
		throw new Error('You are already registered in this tournament.');
	}

	const entryRef = await addDoc(getTournamentEntryCollection(), {
		eventId: params.eventId,
		type: 'team',
		name: params.teamName.trim(),
		captainId: params.captainId,
		memberIds: [params.captainId],
		isOpen: params.isOpen,
		maxMembers: event.maxTeamSize ?? event.teamSize ?? null,
		groupName: null,
		seed: entries.length + 1,
		status: 'confirmed',
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	});

	if (!event.participantIds.includes(params.captainId)) {
		await updateDoc(doc(db, 'events', params.eventId), {
			participantIds: [...event.participantIds, params.captainId],
			updatedAt: serverTimestamp()
		});
	}

	return entryRef.id;
}

export async function joinTournamentTeam(params: {
	eventId: string;
	teamId: string;
	userId: string;
}) {
	const event = await assertTournamentEvent(params.eventId);

	if (event.tournamentRegistrationType !== 'team') {
		throw new Error('This tournament uses individual registration.');
	}

	const entries = await getTournamentEntries(params.eventId);
	const team = entries.find((entry) => entry.id === params.teamId);

	if (!team) {
		throw new Error('Team not found.');
	}

	if (!team.isOpen) {
		throw new Error('This team is not open to public players.');
	}

	if (team.memberIds.includes(params.userId)) {
		throw new Error('You are already in this team.');
	}

	const maxMembers = team.maxMembers ?? event.maxTeamSize ?? event.teamSize ?? 1;

	if (team.memberIds.length >= maxMembers) {
		throw new Error('This team is full.');
	}

	await updateDoc(doc(db, 'tournamentEntries', params.teamId), {
		memberIds: [...team.memberIds, params.userId],
		updatedAt: serverTimestamp()
	});

	if (!event.participantIds.includes(params.userId)) {
		await updateDoc(doc(db, 'events', params.eventId), {
			participantIds: [...event.participantIds, params.userId],
			updatedAt: serverTimestamp()
		});
	}
}

export async function closeTournamentRegistration(params: {
	eventId: string;
	userId: string;
}) {
	const event = await assertTournamentEvent(params.eventId);

	await assertCanManageEvent(event, params.userId);

	await updateDoc(doc(db, 'events', params.eventId), {
		tournamentStatus: 'registration_closed',
		updatedAt: serverTimestamp()
	});
}

async function createTournamentMatch(params: {
	eventId: string;
	stage: TournamentMatch['stage'];
	roundNumber: number;
	groupName?: string | null;
	homeEntryId?: string | null;
	awayEntryId?: string | null;
	homeName: string;
	awayName: string;
	scheduledAt?: Date | null;
}) {
	return addDoc(getTournamentMatchCollection(), {
		eventId: params.eventId,
		stage: params.stage,
		roundNumber: params.roundNumber,
		groupName: params.groupName ?? null,
		homeEntryId: params.homeEntryId ?? null,
		awayEntryId: params.awayEntryId ?? null,
		homeName: params.homeName,
		awayName: params.awayName,
		homeScore: null,
		awayScore: null,
		winnerEntryId: null,
		winnerName: null,
		status: 'scheduled',
		scheduledAt: params.scheduledAt ? Timestamp.fromDate(params.scheduledAt) : null,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	});
}

export async function generateTournamentMatches(params: {
	eventId: string;
	userId: string;
}) {
	const event = await assertTournamentEvent(params.eventId);

	await assertCanManageEvent(event, params.userId);

	const existingMatches = await getTournamentMatches(params.eventId);

	if (existingMatches.length > 0) {
		throw new Error('Tournament matches have already been generated.');
	}

	const entries = shuffleItems(await getTournamentEntries(params.eventId));

	if (entries.length < 2) {
		throw new Error('At least 2 entries are required.');
	}

	if (event.tournamentFormat === 'league') {
		for (let i = 0; i < entries.length; i++) {
			for (let j = i + 1; j < entries.length; j++) {
				await createTournamentMatch({
					eventId: params.eventId,
					stage: 'league',
					roundNumber: 1,
					homeEntryId: entries[i].id,
					awayEntryId: entries[j].id,
					homeName: entries[i].name,
					awayName: entries[j].name
				});
			}
		}
	} else if (event.tournamentFormat === 'groups_playoff') {
		const groupCount = Math.max(2, event.groupCount ?? 2);
		const groups = Array.from({ length: groupCount }, (_, index) => ({
			name: groupNameForIndex(index),
			entries: [] as TournamentEntry[]
		}));

		entries.forEach((entry, index) => {
			groups[index % groupCount].entries.push(entry);
		});

		for (const group of groups) {
			for (const entry of group.entries) {
				await updateDoc(doc(db, 'tournamentEntries', entry.id), {
					groupName: group.name,
					updatedAt: serverTimestamp()
				});
			}

			for (let i = 0; i < group.entries.length; i++) {
				for (let j = i + 1; j < group.entries.length; j++) {
					await createTournamentMatch({
						eventId: params.eventId,
						stage: 'group',
						roundNumber: 1,
						groupName: group.name,
						homeEntryId: group.entries[i].id,
						awayEntryId: group.entries[j].id,
						homeName: group.entries[i].name,
						awayName: group.entries[j].name
					});
				}
			}
		}

		await createTournamentMatch({
			eventId: params.eventId,
			stage: 'semi_final',
			roundNumber: 2,
			homeName: 'Winner Group A',
			awayName: 'Runner-up Group B'
		});

		await createTournamentMatch({
			eventId: params.eventId,
			stage: 'semi_final',
			roundNumber: 2,
			homeName: 'Winner Group B',
			awayName: 'Runner-up Group A'
		});

		await createTournamentMatch({
			eventId: params.eventId,
			stage: 'final',
			roundNumber: 3,
			homeName: 'Winner semi-final 1',
			awayName: 'Winner semi-final 2'
		});
	} else {
		for (let i = 0; i < entries.length; i += 2) {
			await createTournamentMatch({
				eventId: params.eventId,
				stage: entries.length <= 4 ? 'semi_final' : 'knockout',
				roundNumber: 1,
				homeEntryId: entries[i].id,
				awayEntryId: entries[i + 1]?.id ?? null,
				homeName: entries[i].name,
				awayName: entries[i + 1]?.name ?? 'BYE'
			});
		}
	}

	await updateDoc(doc(db, 'events', params.eventId), {
		tournamentStatus: 'in_progress',
		updatedAt: serverTimestamp()
	});
}

export async function updateTournamentMatchResult(params: {
	matchId: string;
	userId: string;
	homeScore: number;
	awayScore: number;
	scheduledAt?: Date | null;
	winnerEntryId?: string | null;
	winnerName?: string | null;
}) {
	const matchRef = doc(db, 'tournamentMatches', params.matchId);
	const matchSnap = await getDoc(matchRef);

	if (!matchSnap.exists()) {
		throw new Error('Match not found.');
	}

	const match = {
		id: matchSnap.id,
		...matchSnap.data()
	} as TournamentMatch;

	const event = await assertTournamentEvent(match.eventId);

	await assertCanManageEvent(event, params.userId);

	let winnerName = params.winnerName ?? null;
	let winnerEntryId = params.winnerEntryId ?? null;

	if (!winnerName) {
		if (params.homeScore > params.awayScore) {
			winnerName = match.homeName;
			winnerEntryId = match.homeEntryId ?? null;
		} else if (params.awayScore > params.homeScore) {
			winnerName = match.awayName;
			winnerEntryId = match.awayEntryId ?? null;
		}
	}

	await updateDoc(matchRef, {
		homeScore: params.homeScore,
		awayScore: params.awayScore,
		winnerEntryId,
		winnerName,
		status: 'finished',
		scheduledAt: params.scheduledAt ? Timestamp.fromDate(params.scheduledAt) : (match.scheduledAt ?? null),
		updatedAt: serverTimestamp()
	});
}

export async function notifyEventFinished(event: SportEvent): Promise<void> {
	if (event.status === 'finished' || event.status === 'cancelled') return;
	if (!isEventFinished(event)) return;

	await updateDoc(doc(db, 'events', event.id), {
		status: 'finished',
		updatedAt: serverTimestamp()
	});

	await Promise.all(
		event.participantIds.map((participantId) =>
			sendRallySystemMessage(
				participantId,
				`Your event "${event.title}" has finished. Hope it was a great game!`
			)
		)
	);
}
