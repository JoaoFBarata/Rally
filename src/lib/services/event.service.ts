// src/lib/services/event.service.ts

import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	increment,
	query,
	setDoc,
	Timestamp,
	serverTimestamp,
	updateDoc,
	where
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type {
	EventHostType,
	EventJoinPolicy,
	EventPaymentMode,
	EventPromotionPlan,
	EventStatus,
	EventVisibility,
	PaymentStatus,
	RecurringFrequency,
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
import { calculateRouteDistanceKm } from '$lib/utils/route.utils';
import {
	canCreateOfficialPaidEvents,
	getOrganizationById,
	getOrganizationFollowerIds,
	isOrganizationAdmin
} from '$lib/services/organization.service';
import { sendRallySystemMessage } from '$lib/services/chat.service';
import { getUserProfile } from '$lib/services/user.service';
import { getCurrentLocale } from '$lib/utils/format.utils';

export const PROMOTION_PLANS: Record<
	EventPromotionPlan,
	{
		label: string;
		description: string;
		cpm: number;
		placement: string;
	}
> = {
	local: {
		label: 'Regional Boost',
		description: 'Shows the event in promoted areas for the selected country or city.',
		cpm: 7,
		placement: 'Dashboard and Explore in the selected area'
	},
	sport: {
		label: 'Sport Targeting',
		description: 'Regional boost plus priority for people who like or filter this sport.',
		cpm: 11,
		placement: 'Top of sport-matched discovery'
	},
	featured: {
		label: 'Legacy Featured',
		description: 'Older broad campaign type. New campaigns should use Regional or Sport Targeting.',
		cpm: 7,
		placement: 'Legacy promoted placement'
	}
};

export const PROMOTION_COUNTRIES = [
	{ code: 'PT', label: 'Portugal' },
	{ code: 'ES', label: 'Spain' },
	{ code: 'FR', label: 'France' },
	{ code: 'GB', label: 'United Kingdom' },
	{ code: 'DE', label: 'Germany' },
	{ code: 'IT', label: 'Italy' },
	{ code: 'BR', label: 'Brazil' }
] as const;

export function getPromotionPlanConfig(plan: EventPromotionPlan) {
	return PROMOTION_PLANS[plan];
}

export function getAvailablePromotionPlanOptions() {
	return (Object.entries(PROMOTION_PLANS) as [
		EventPromotionPlan,
		(typeof PROMOTION_PLANS)[EventPromotionPlan]
	][]).filter(([plan]) => plan !== 'featured');
}

function getEventPaymentAttendeeIds(event: SportEvent) {
	return [...new Set([event.creatorId, ...(event.participantIds ?? [])])];
}

function getEventPaymentPayerIds(event: SportEvent) {
	return (event.participantIds ?? []).filter((participantId) => participantId !== event.creatorId);
}

function buildPendingPaymentStatuses(event: SportEvent) {
	return Object.fromEntries(
		getEventPaymentPayerIds(event).map((participantId) => [participantId, 'pending' as const])
	);
}

export function getEventPaymentSplitAmount(event: SportEvent) {
	if (event.paymentSplitAmount != null) return event.paymentSplitAmount;

	const attendeeCount = getEventPaymentAttendeeIds(event).length;
	if (attendeeCount <= 0) return null;

	if (event.priceTotal != null) {
		return Number((event.priceTotal / attendeeCount).toFixed(2));
	}

	if (event.pricePerPerson != null) return event.pricePerPerson;

	return null;
}

export function getEventPaymentSummary(event: SportEvent) {
	const payerIds = getEventPaymentPayerIds(event);
	const statuses = event.paymentStatuses ?? {};
	const splitAmount = getEventPaymentSplitAmount(event);
	const paidCount = payerIds.filter((participantId) => (statuses[participantId] ?? 'pending') === 'paid').length;

	return {
		payerIds,
		statuses,
		splitAmount,
		paidCount,
		pendingCount: payerIds.length - paidCount
	};
}

export async function updateEventParticipantPaymentStatus(params: {
	eventId: string;
	userId: string;
	participantId: string;
	status: Exclude<PaymentStatus, 'not_required' | 'refunded'>;
}) {
	const event = await getEventById(params.eventId);

	if (!event) throw new Error('Event not found.');

	await assertCanManageEvent(event, params.userId);

	if (getEffectiveEventStatus(event) !== 'finished') {
		throw new Error('Payments can only be updated after the event is finished.');
	}

	if (params.participantId === event.creatorId) {
		throw new Error('The host does not need to pay.');
	}

	if (!event.participantIds.includes(params.participantId)) {
		throw new Error('Participant not found.');
	}

	const splitAmount = getEventPaymentSplitAmount(event);

	if (splitAmount == null) {
		throw new Error('This event does not have a split payment amount.');
	}

	const paymentStatuses = {
		...(event.paymentStatuses ?? buildPendingPaymentStatuses(event)),
		[params.participantId]: params.status
	};

	await updateDoc(doc(db, 'events', params.eventId), {
		paymentSplitAmount: splitAmount,
		paymentStatuses,
		updatedAt: serverTimestamp()
	});
}

export function calculatePromotionImpressionLimit(params: { budget: number; cpm: number }) {
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
	const remainingImpressions = impressionLimit > 0 ? Math.max(impressionLimit - views, 0) : null;
	const progress = impressionLimit > 0 ? Math.min((views / impressionLimit) * 100, 100) : 0;

	return {
		views,
		clicks,
		ctr,
		estimatedSpend,
		remainingImpressions,
		progress
	};
}

export function isPromotionActive(event: SportEvent) {
	if (!event.isPromoted) return false;
	if (event.promotionStatus !== 'active') return false;
	if (getEffectiveEventStatus(event) === 'finished' || getEffectiveEventStatus(event) === 'cancelled') {
		return false;
	}

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

export function getTournamentTeamConversationId(teamId: string) {
	return `tournament_team_${teamId}`;
}

export function getEventStartAtMillis(event: SportEvent) {
	const startAt = event.startAt as unknown as { toMillis?: () => number; toDate?: () => Date };

	if (startAt?.toMillis) return startAt.toMillis();
	if (startAt?.toDate) return startAt.toDate().getTime();

	return 0;
}

function formatEventDate(startAt: unknown): string {
	try {
		const ts = startAt as { toDate?: () => Date };
		if (ts?.toDate) {
			return ts.toDate().toLocaleString(getCurrentLocale(), {
				weekday: 'short',
				day: '2-digit',
				month: 'short',
				hour: '2-digit',
				minute: '2-digit'
			});
		}
	} catch {
		// fall through
	}
	return '';
}

export function isEventFinished(event: SportEvent) {
	if (event.status === 'finished') return true;
	if (event.status === 'cancelled') return false;

	const endAt = event.endAt as unknown as { toMillis?: () => number; toDate?: () => Date } | null;
	const endAtMs = endAt?.toMillis?.() ?? endAt?.toDate?.()?.getTime?.() ?? 0;

	if (event.eventKind === 'tournament' || event.tournamentStatus) {
		if (event.tournamentStatus === 'finished') return true;
		if (endAtMs) return endAtMs < Date.now();
		return false;
	}

	const finishAtMs = endAtMs || getEventStartAtMillis(event);

	if (!finishAtMs) return false;

	return finishAtMs < Date.now();
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
			memberIds: [...new Set([event.creatorId, ...(event.participantIds ?? [])])],
			updatedAt: serverTimestamp(),
			createdAt: serverTimestamp()
		},
		{ merge: true }
	);
}

async function notifyOrganizationFollowers(
	event: SportEvent,
	message: string,
	options: { includeParticipants?: boolean } = {}
) {
	if (event.hostType !== 'organization' || !event.organizationId || event.visibility !== 'public') {
		return;
	}

	const followerIds = await getOrganizationFollowerIds(event.organizationId);
	const excludedIds = new Set<string>([
		event.creatorId,
		...(options.includeParticipants ? [] : (event.participantIds ?? []))
	]);
	const recipients = followerIds.filter((userId) => !excludedIds.has(userId));

	await Promise.allSettled(
		recipients.map((userId) => sendRallySystemMessage(userId, message))
	);
}

async function syncTournamentTeamConversation(
	event: SportEvent,
	entry: TournamentEntry,
	createIfMissing = true
) {
	if (entry.type !== 'team') return;

	const conversationId = getTournamentTeamConversationId(entry.id);
	const conversationRef = doc(db, 'conversations', conversationId);
	const conversationData = {
		id: conversationId,
		type: 'tournament_team',
		eventId: event.id,
		teamId: entry.id,
		title: entry.name,
		photoURL: event.organizationLogoURL ?? event.groupPhotoURL ?? null,
		memberIds: [...new Set(entry.memberIds)],
		updatedAt: serverTimestamp()
	};

	if (createIfMissing) {
		await setDoc(
			conversationRef,
			{ ...conversationData, createdAt: serverTimestamp() },
			{ merge: true }
		);
		return;
	}

	try {
		await updateDoc(conversationRef, conversationData);
	} catch (error) {
		const code = (error as { code?: string }).code;
		if (code === 'not-found') return;
		throw error;
	}
}

export async function ensureEventGroupConversation(eventId: string) {
	const event = await getEventById(eventId);

	if (!event) {
		throw new Error('Event not found');
	}

	await syncEventGroupConversation(event);

	return getEventGroupConversationId(eventId);
}

export async function ensureTournamentTeamConversation(params: {
	eventId: string;
	teamId: string;
	userId: string;
}) {
	const event = await assertTournamentEvent(params.eventId);
	const entries = await getTournamentEntries(params.eventId);
	const entry = entries.find((item) => item.id === params.teamId && item.type === 'team');

	if (!entry) {
		throw new Error('Team not found.');
	}

	if (!entry.memberIds.includes(params.userId)) {
		throw new Error('Only team members can access this chat.');
	}

	await syncTournamentTeamConversation(event, entry);

	return getTournamentTeamConversationId(entry.id);
}

export async function assertCanManageEvent(event: SportEvent, userId: string) {
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
	pricePerPerson?: number | null;
	currency?: SportEvent['currency'];
	paymentMode?: EventPaymentMode;
	groupPhotoURL?: string | null;
	groupPhotoPath?: string | null;
	route?: SportEvent['route'];
	whatToBring?: string;
	joinPolicy?: EventJoinPolicy;
	recurringGroupId?: string | null;
	recurringIndex?: number | null;
	recurringTotal?: number | null;
	recurringFrequency?: RecurringFrequency | null;
}) {
	const hostType = params.hostType ?? 'user';
	const paymentMode: EventPaymentMode =
		params.paymentMode ?? (params.priceTotal || params.pricePerPerson ? 'split' : 'none');

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
		params.pricePerPerson !== undefined && params.pricePerPerson !== null
			? params.pricePerPerson
			: (params.priceTotal && params.maxParticipants > 0
				? params.priceTotal / params.maxParticipants
				: undefined);

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
		groupPhotoPath: params.groupPhotoPath ?? null,
		route: params.route ?? null,
		routeDistanceKm: calculateRouteDistanceKm(params.route),

		whatToBring: params.whatToBring ?? '',
		joinPolicy: params.joinPolicy ?? 'open',

		recurringGroupId: params.recurringGroupId ?? null,
		recurringIndex: params.recurringIndex ?? null,
		recurringTotal: params.recurringTotal ?? null,
		recurringFrequency: params.recurringFrequency ?? null,

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
		currency: params.currency ?? 'EUR',
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

	if (hostType === 'organization' && !params.recurringGroupId) {
		const dateLabel = formatEventDate(createdEvent.startAt);
		const organizationName = createdEvent.organizationName ?? 'An organization you follow';
		void notifyOrganizationFollowers(
			createdEvent,
			`${organizationName} created "${createdEvent.title}"${dateLabel ? ` on ${dateLabel}` : ''}.`
		).catch((error) => console.error('Follower event notification error:', error));
	}

	return createdEvent;
}

const MAX_RECURRING_OCCURRENCES = 12;
const MIN_RECURRING_OCCURRENCES = 2;

function addRecurringOffset(date: Date, frequency: RecurringFrequency, occurrenceIndex: number) {
	const next = new Date(date.getTime());

	if (frequency === 'weekly') {
		next.setDate(next.getDate() + 7 * occurrenceIndex);
	} else if (frequency === 'biweekly') {
		next.setDate(next.getDate() + 14 * occurrenceIndex);
	} else {
		next.setMonth(next.getMonth() + occurrenceIndex);
	}

	return next;
}

export async function createRecurringSportEvents(
	params: Parameters<typeof createSportEvent>[0] & {
		frequency: RecurringFrequency;
		occurrences: number;
	}
) {
	const occurrences = Math.min(
		Math.max(Math.round(params.occurrences), MIN_RECURRING_OCCURRENCES),
		MAX_RECURRING_OCCURRENCES
	);

	const recurringGroupId = crypto.randomUUID();

	const promises = Array.from({ length: occurrences }).map((_, index) => {
		const occurrenceStartAt = addRecurringOffset(params.startAt, params.frequency, index);
		const occurrenceEndAt = params.endAt
			? addRecurringOffset(params.endAt, params.frequency, index)
			: undefined;

		return createSportEvent({
			...params,
			startAt: occurrenceStartAt,
			endAt: occurrenceEndAt,
			recurringGroupId,
			recurringIndex: index + 1,
			recurringTotal: occurrences,
			recurringFrequency: params.frequency
		});
	});

	return Promise.all(promises);
}

export async function updateSportEvent(params: {
	eventId: string;
	userId: string;
	title: string;
	description?: string;
	sport: Sport;
	customSport?: string;
	level?: SportLevel;
	locationName: string;
	address?: string;
	lat?: number | null;
	lng?: number | null;
	startAt: Date;
	endAt?: Date | null;
	maxParticipants: number;
	visibility: EventVisibility;
	priceTotal?: number | null;
	pricePerPerson?: number | null;
	currency?: SportEvent['currency'];
	groupPhotoURL?: string | null;
	groupPhotoPath?: string | null;
	route?: SportEvent['route'];
	whatToBring?: string;
	joinPolicy?: EventJoinPolicy;
}): Promise<void> {
	const event = await getEventById(params.eventId);

	if (!event) throw new Error('Event not found.');
	if (event.creatorId !== params.userId) throw new Error('Only the creator can edit this event.');

	const status = getEffectiveEventStatus(event);
	if (status === 'cancelled') throw new Error('Cancelled events cannot be edited.');
	if (status === 'finished') throw new Error('Finished events cannot be edited.');

	if (params.maxParticipants < event.participantIds.length) {
		throw new Error(
			`Max participants cannot be less than the current number of participants (${event.participantIds.length}).`
		);
	}

	const pricePerPerson =
		params.pricePerPerson !== undefined && params.pricePerPerson !== null
			? params.pricePerPerson
			: (params.priceTotal && params.maxParticipants > 0
				? params.priceTotal / params.maxParticipants
			: null);
	const route = params.route ?? event.route ?? null;

	await updateDoc(doc(db, 'events', params.eventId), {
		title: params.title,
		description: params.description ?? '',
		sport: params.sport,
		customSport: params.sport === 'other' ? (params.customSport ?? '') : null,
		level: params.level ?? 'casual',
		location: {
			name: params.locationName,
			address: params.address ?? '',
			lat: params.lat ?? null,
			lng: params.lng ?? null
		},
		startAt: Timestamp.fromDate(params.startAt),
		endAt: params.endAt ? Timestamp.fromDate(params.endAt) : null,
		maxParticipants: params.maxParticipants,
		visibility: params.visibility,
		priceTotal: params.priceTotal ?? null,
		pricePerPerson,
		currency: params.currency ?? event.currency ?? 'EUR',
		paymentMode: (params.priceTotal || pricePerPerson) ? 'split' : ('none' satisfies EventPaymentMode),
		groupPhotoURL: params.groupPhotoURL ?? event.groupPhotoURL ?? null,
		groupPhotoPath: params.groupPhotoPath ?? event.groupPhotoPath ?? null,
		route,
		routeDistanceKm: calculateRouteDistanceKm(route),
		whatToBring: params.whatToBring ?? '',
		joinPolicy: params.joinPolicy ?? event.joinPolicy ?? 'open',
		updatedAt: serverTimestamp()
	});

	await syncEventGroupConversation({
		...event,
		title: params.title,
		groupPhotoURL: params.groupPhotoURL ?? event.groupPhotoURL ?? null,
		groupPhotoPath: params.groupPhotoPath ?? event.groupPhotoPath ?? null
	});
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

		const enrichedEvent: SportEvent = {
			...event,
			hostType: 'organization',
			organizationId: organization.id,
			organizationName: organization.name,
			organizationLogoURL: organization.logoURL ?? null,
			organizationVerificationStatus: organization.verificationStatus
		};
		eventsById.set(enrichedEvent.id, enrichedEvent);
	}

	const adminIds = [
		...new Set([
			...(organization.adminIds ?? []),
			...(organization.memberIds ?? []),
			organization.ownerId
		].filter(Boolean))
	];

	const chunks = chunkArray(adminIds, 10).filter(chunk => chunk.length > 0);
	const chunkPromises = chunks.map(async (chunk) => {
		const adminEventsQuery = query(collection(db, 'events'), where('creatorId', 'in', chunk));
		const adminEventsSnap = await getDocs(adminEventsQuery);
		return adminEventsSnap.docs.map(docSnap => ({
			id: docSnap.id,
			...docSnap.data()
		} as SportEvent));
	});

	const chunkResults = await Promise.all(chunkPromises);
	for (const chunkEvents of chunkResults) {
		for (const event of chunkEvents) {
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
	const profile = await getUserProfile(userId);
	if (profile?.accountType === 'organization') {
		throw new Error('Organizations cannot join events.');
	}

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

	if (event.eventKind === 'tournament') {
		throw new Error('Use tournament registration instead of joining the event directly.');
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

	void sendRallySystemMessage(
		userId,
		`You joined "${event.title}" on ${formatEventDate(event.startAt)} at ${event.location.name}.`
	).catch((err) => console.error('Join notification error:', err));
}

export async function leaveEvent(eventId: string, userId: string) {
	const event = await getEventById(eventId);

	if (!event) {
		throw new Error('Event not found');
	}

	if (getEffectiveEventStatus(event) === 'finished' || event.status === 'cancelled') {
		throw new Error('Finished or cancelled events cannot be changed.');
	}

	if (event.creatorId === userId) {
		throw new Error('The creator cannot leave the event. Cancel the event instead.');
	}

	if (!event.participantIds.includes(userId)) {
		return;
	}

	const newParticipantIds = event.participantIds.filter((id) => id !== userId);

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

	void sendRallySystemMessage(userId, `You left "${event.title}".`).catch((err) =>
		console.error('Leave notification error:', err)
	);
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

export async function finishEvent(eventId: string, userId: string) {
	const event = await getEventById(eventId);

	if (!event) {
		throw new Error('Event not found');
	}

	await assertCanManageEvent(event, userId);

	if (event.status === 'cancelled') {
		throw new Error('Cancelled events cannot be finished.');
	}

	await updateDoc(doc(db, 'events', eventId), {
		status: 'finished',
		...(getEventPaymentSplitAmount(event) != null
			? {
					paymentSplitAmount: getEventPaymentSplitAmount(event),
					paymentStatuses: buildPendingPaymentStatuses(event)
				}
			: {}),
		paymentLockedAt: serverTimestamp(),
		...(event.isPromoted
			? {
					isPromoted: false,
					promotionStatus: 'ended'
				}
			: {}),
		updatedAt: serverTimestamp()
	});

	await syncEventGroupConversation({
		...event,
		status: 'finished'
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

	if (getEffectiveEventStatus(event) === 'finished' || event.status === 'cancelled') {
		throw new Error('Finished or cancelled events cannot be changed.');
	}

	await assertCanManageEvent(event, params.creatorId);

	if (params.participantId === event.creatorId) {
		throw new Error('The creator cannot be removed.');
	}

	const newParticipantIds = event.participantIds.filter((id) => id !== params.participantId);

	const newStatus: EventStatus =
		newParticipantIds.length >= event.maxParticipants ? 'full' : 'open';

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

	void sendRallySystemMessage(
		params.participantId,
		`You were removed from "${event.title}" by the host.`
	).catch((err) => console.error('Remove participant notification error:', err));
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
	targetCountry?: string;
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
	if (event.visibility !== 'public') {
		throw new Error('Only public events can be promoted.');
	}

	const organization = await getOrganizationById(event.organizationId);

	if (!organization) {
		throw new Error('Organization not found.');
	}

	if (!canCreateOfficialPaidEvents(organization)) {
		throw new Error('Only verified organizations can promote events.');
	}

	const budget = Math.max(1, params.budget);
	const targetCountry = params.targetCountry?.trim().toUpperCase() || 'PT';
	if (!PROMOTION_COUNTRIES.some((country) => country.code === targetCountry)) {
		throw new Error('Choose a supported target country.');
	}
	const durationDays = Math.max(1, Math.min(params.durationDays, 30));
	const planConfig = getPromotionPlanConfig(params.plan);
	const targetSport = params.targetSport ?? (params.plan === 'sport' ? event.sport : null);
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
		promotionTargetCountry: targetCountry,
		promotionTargetSport: targetSport,
		promotionStartedAt: serverTimestamp(),
		promotionEndsAt: Timestamp.fromDate(endsAt),
		promotionViews: 0,
		promotionClicks: 0,
		updatedAt: serverTimestamp()
	});

	void sendRallySystemMessage(
		params.userId,
		`Promotion started for "${event.title}". You can follow its views, clicks and spend in the organization dashboard.`
	).catch((error) => console.error('Promotion notification error:', error));

	void notifyOrganizationFollowers(
		event,
		`${event.organizationName ?? 'An organization you follow'} is promoting "${event.title}" in Rally.`
	).catch((error) => console.error('Follower promotion notification error:', error));
}

export async function stopEventPromotion(params: { eventId: string; userId: string }) {
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

	void sendRallySystemMessage(
		params.userId,
		`Promotion ended for "${event.title}". Its final results remain available in the organization dashboard.`
	).catch((error) => console.error('Promotion notification error:', error));
}

async function isOwnOrganizationPromotion(event: SportEvent, viewerId?: string | null) {
	if (!viewerId) return false;
	if (event.creatorId === viewerId) return true;
	if (!event.organizationId) return false;
	const organization = await getOrganizationById(event.organizationId);
	return organization ? isOrganizationAdmin(organization, viewerId) : false;
}

export async function trackEventPromotionView(eventId: string, viewerId?: string | null) {
	const event = await getEventById(eventId);

	if (!event || !isPromotionActive(event)) return;
	if (await isOwnOrganizationPromotion(event, viewerId)) return;

	await updateDoc(doc(db, 'events', eventId), {
		promotionViews: increment(1),
		updatedAt: serverTimestamp()
	});
}

export async function trackEventPromotionClick(eventId: string, viewerId?: string | null) {
	const event = await getEventById(eventId);

	if (!event || !isPromotionActive(event)) return;
	if (await isOwnOrganizationPromotion(event, viewerId)) return;

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

async function assertPersonalTournamentUser(userId: string) {
	const profile = await getUserProfile(userId);

	if (!profile) {
		throw new Error('User profile not found.');
	}

	if (profile.accountType === 'organization') {
		throw new Error('Organization accounts cannot register as players.');
	}
}

async function syncTournamentParticipantIds(event: SportEvent, participantIds: string[]) {
	const newStatus: EventStatus =
		event.status === 'cancelled'
			? 'cancelled'
			: participantIds.length >= event.maxParticipants
				? 'full'
				: 'open';

	await updateDoc(doc(db, 'events', event.id), {
		participantIds,
		status: newStatus,
		updatedAt: serverTimestamp()
	});

	await syncEventGroupConversation({
		...event,
		participantIds,
		status: newStatus
	});
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
	currency?: SportEvent['currency'];

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
			params.entryFeeType === 'free' ? undefined : (params.entryFeeAmount ?? 0) * params.maxEntries,
		currency: params.currency ?? 'EUR',
		paymentMode
	});

	const groupCount =
		params.format === 'groups_playoff' ? Math.max(2, params.groupCount ?? 2) : null;

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
		playoffSpots: params.format === 'groups_playoff' ? Math.max(2, params.playoffSpots ?? 4) : null,

		teamSize: params.teamSize ?? null,
		minTeamSize: params.minTeamSize ?? params.teamSize ?? null,
		maxTeamSize: params.maxTeamSize ?? params.teamSize ?? null,
		allowOpenTeams: params.allowOpenTeams ?? false,

		registrationDeadline: params.registrationDeadline
			? Timestamp.fromDate(params.registrationDeadline)
			: null,

		entryFeeType: params.entryFeeType,
		entryFeeAmount: params.entryFeeAmount ?? null,
		currency: params.currency ?? 'EUR',

		prizeType: params.prizeType,
		prizeDescription: params.prizeDescription ?? '',
		prizeValue: params.prizeValue ?? null,

		tournamentRules: params.rules ?? '',
		updatedAt: serverTimestamp()
	});

	const refreshedEvent = await getEventById(createdEvent.id);

	return refreshedEvent ?? createdEvent;
}

export async function updateTournamentEvent(params: {
	eventId: string;
	userId: string;
	title: string;
	description?: string;
	sport: Sport;
	level?: SportLevel;
	locationName: string;
	address?: string;
	lat?: number | null;
	lng?: number | null;
	startAt: Date;
	endAt?: Date | null;
	format: TournamentFormat;
	registrationType: TournamentRegistrationType;
	maxEntries: number;
	groupCount?: number | null;
	playoffSpots?: number | null;
	teamSize?: number | null;
	minTeamSize?: number | null;
	maxTeamSize?: number | null;
	allowOpenTeams?: boolean;
	registrationDeadline?: Date | null;
	entryFeeType: EntryFeeType;
	entryFeeAmount?: number | null;
	currency?: SportEvent['currency'];
	prizeType: PrizeType;
	prizeDescription?: string;
	prizeValue?: number | null;
	rules?: string;
}) {
	const event = await getEventById(params.eventId);

	if (!event) throw new Error('Tournament not found.');
	if (event.eventKind !== 'tournament') throw new Error('This event is not a tournament.');

	await assertCanManageEvent(event, params.userId);

	const status = getEffectiveEventStatus(event);
	if (status === 'cancelled') throw new Error('Cancelled tournaments cannot be edited.');
	if (status === 'finished') throw new Error('Finished tournaments cannot be edited.');

	if (
		(params.entryFeeType === 'paid' || params.prizeType === 'cash') &&
		event.organizationId
	) {
		const organization = await getOrganizationById(event.organizationId);
		if (!organization || !canCreateOfficialPaidEvents(organization)) {
			throw new Error('Paid tournaments and cash prizes require a verified organization.');
		}
	}

	const maxParticipants =
		params.registrationType === 'team'
			? params.maxEntries * Math.max(params.maxTeamSize ?? params.teamSize ?? 1, 1)
			: params.maxEntries;

	if (maxParticipants < event.participantIds.length) {
		throw new Error(
			`Max participants cannot be less than the current number of participants (${event.participantIds.length}).`
		);
	}

	const groupCount =
		params.format === 'groups_playoff' ? Math.max(2, params.groupCount ?? 2) : null;
	const paymentMode = paymentModeFromEntryFee(params.entryFeeType);

	await updateDoc(doc(db, 'events', params.eventId), {
		title: params.title,
		description: params.description ?? '',
		sport: params.sport,
		level: params.level ?? 'casual',
		location: {
			name: params.locationName,
			address: params.address ?? '',
			lat: params.lat ?? null,
			lng: params.lng ?? null
		},
		startAt: Timestamp.fromDate(params.startAt),
		endAt: params.endAt ? Timestamp.fromDate(params.endAt) : null,
		maxParticipants,
		priceTotal:
			params.entryFeeType === 'free' ? null : (params.entryFeeAmount ?? 0) * params.maxEntries,
		pricePerPerson: null,
		currency: params.currency ?? event.currency ?? 'EUR',
		paymentMode,
		tournamentFormat: params.format,
		tournamentRegistrationType: params.registrationType,
		maxTournamentEntries: params.maxEntries,
		groupCount,
		teamsPerGroup:
			params.format === 'groups_playoff' && groupCount
				? Math.ceil(params.maxEntries / groupCount)
				: null,
		playoffSpots: params.format === 'groups_playoff' ? Math.max(2, params.playoffSpots ?? 4) : null,
		teamSize: params.teamSize ?? null,
		minTeamSize: params.minTeamSize ?? params.teamSize ?? null,
		maxTeamSize: params.maxTeamSize ?? params.teamSize ?? null,
		allowOpenTeams: params.registrationType === 'team' ? (params.allowOpenTeams ?? false) : false,
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

	await syncEventGroupConversation({
		...event,
		title: params.title
	});
}

export async function joinTournamentTeam(params: {
	eventId: string;
	teamId: string;
	userId: string;
	fromInvite?: boolean;
}) {
	await assertPersonalTournamentUser(params.userId);

	const event = await assertTournamentEvent(params.eventId);

	if (event.creatorId === params.userId) {
		throw new Error('The tournament host cannot register as a player.');
	}

	if (event.tournamentStatus !== 'registration_open') {
		throw new Error('Tournament registration is closed.');
	}

	if (event.tournamentRegistrationType !== 'team') {
		throw new Error('This tournament uses individual registration.');
	}

	const entries = await getTournamentEntries(params.eventId);
	const team = entries.find((entry) => entry.id === params.teamId);

	if (!team) {
		throw new Error('Team not found.');
	}

	if (!team.isOpen && !params.fromInvite) {
		throw new Error('This team is not open to public players.');
	}

	const existingEntry = entries.find((entry) => entry.memberIds.includes(params.userId));

	if (existingEntry) {
		throw new Error('You are already registered in this tournament.');
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

	await syncTournamentTeamConversation(event, {
		...team,
		memberIds: [...team.memberIds, params.userId]
	});

	if (!event.participantIds.includes(params.userId)) {
		await syncTournamentParticipantIds(event, [...event.participantIds, params.userId]);
	}
}

export async function closeTournamentRegistration(params: { eventId: string; userId: string }) {
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
	nextMatchId?: string | null;
	nextMatchSlot?: 'home' | 'away' | null;
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
		nextMatchId: params.nextMatchId ?? null,
		nextMatchSlot: params.nextMatchSlot ?? null,
		status: 'scheduled',
		scheduledAt: params.scheduledAt ? Timestamp.fromDate(params.scheduledAt) : null,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	});
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
		const groupOrder = (a.groupName ?? '').localeCompare(b.groupName ?? '');
		if (groupOrder !== 0) return groupOrder;
		const aCreatedAt = (a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
		const bCreatedAt = (b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
		if (aCreatedAt !== bCreatedAt) return aCreatedAt - bCreatedAt;
		return a.id.localeCompare(b.id);
	});
}

export async function joinTournamentAsIndividual(params: {
	eventId: string;
	userId: string;
	displayName: string;
}) {
	await assertPersonalTournamentUser(params.userId);

	const event = await assertTournamentEvent(params.eventId);

	if (event.creatorId === params.userId) {
		throw new Error('The tournament host cannot register as a player.');
	}

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

	await addDoc(getTournamentEntryCollection(), {
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
		await syncTournamentParticipantIds(event, [...event.participantIds, params.userId]);
	}
}

export async function createTournamentTeam(params: {
	eventId: string;
	captainId: string;
	teamName: string;
	isOpen: boolean;
}) {
	await assertPersonalTournamentUser(params.captainId);

	const event = await assertTournamentEvent(params.eventId);

	if (event.creatorId === params.captainId) {
		throw new Error('The tournament host cannot register as a player.');
	}

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

	await syncTournamentTeamConversation(event, {
		id: entryRef.id,
		eventId: params.eventId,
		type: 'team',
		name: params.teamName.trim(),
		captainId: params.captainId,
		memberIds: [params.captainId],
		isOpen: params.isOpen,
		maxMembers: event.maxTeamSize ?? event.teamSize ?? null,
		status: 'confirmed',
		createdAt: Timestamp.now(),
		updatedAt: Timestamp.now()
	});

	if (!event.participantIds.includes(params.captainId)) {
		await syncTournamentParticipantIds(event, [...event.participantIds, params.captainId]);
	}

	return entryRef.id;
}

export async function leaveTournament(params: { eventId: string; userId: string }) {
	const event = await assertTournamentEvent(params.eventId);

	if (event.creatorId === params.userId) {
		throw new Error('The host cannot leave the tournament. Cancel it instead.');
	}

	const entries = await getTournamentEntries(params.eventId);
	const entry = entries.find((item) => item.memberIds.includes(params.userId));

	if (!entry) return;

	if (entry.captainId === params.userId && entry.memberIds.length > 1) {
		throw new Error('The team captain cannot leave while other players are still in the team.');
	}

	if (entry.type === 'individual' || entry.memberIds.length === 1) {
		await deleteDoc(doc(db, 'tournamentEntries', entry.id));
		await syncTournamentTeamConversation(event, { ...entry, memberIds: [] }, false);
	} else {
		const memberIds = entry.memberIds.filter((id) => id !== params.userId);

		await updateDoc(doc(db, 'tournamentEntries', entry.id), {
			memberIds,
			updatedAt: serverTimestamp()
		});

		await syncTournamentTeamConversation(event, { ...entry, memberIds }, false);
	}

	if (event.participantIds.includes(params.userId)) {
		await syncTournamentParticipantIds(
			event,
			event.participantIds.filter((id) => id !== params.userId)
		);
	}
}

export async function removeTournamentPlayer(params: {
	eventId: string;
	entryId: string;
	playerId: string;
	userId: string;
}) {
	const event = await assertTournamentEvent(params.eventId);
	await assertCanManageEvent(event, params.userId);

	if (event.tournamentStatus === 'in_progress' || event.tournamentStatus === 'finished') {
		throw new Error('Players cannot be removed after the tournament has started.');
	}

	const entries = await getTournamentEntries(params.eventId);
	const entry = entries.find((item) => item.id === params.entryId);

	if (!entry || !entry.memberIds.includes(params.playerId)) {
		throw new Error('Player registration not found.');
	}

	const memberIds = entry.memberIds.filter((id) => id !== params.playerId);

	if (entry.type === 'individual' || memberIds.length === 0) {
		await deleteDoc(doc(db, 'tournamentEntries', entry.id));
		await syncTournamentTeamConversation(event, { ...entry, memberIds: [] }, false);
	} else {
		const captainId = entry.captainId === params.playerId ? memberIds[0] : entry.captainId;

		await updateDoc(doc(db, 'tournamentEntries', entry.id), {
			memberIds,
			captainId: captainId ?? null,
			updatedAt: serverTimestamp()
		});

		await syncTournamentTeamConversation(event, { ...entry, memberIds, captainId }, false);
	}

	if (event.participantIds.includes(params.playerId)) {
		await syncTournamentParticipantIds(
			event,
			event.participantIds.filter((id) => id !== params.playerId)
		);
	}
}

export async function removeTournamentEntry(params: {
	eventId: string;
	entryId: string;
	userId: string;
}) {
	const event = await assertTournamentEvent(params.eventId);
	await assertCanManageEvent(event, params.userId);

	if (event.tournamentStatus === 'in_progress' || event.tournamentStatus === 'finished') {
		throw new Error('Entries cannot be removed after the tournament has started.');
	}

	const entries = await getTournamentEntries(params.eventId);
	const entry = entries.find((item) => item.id === params.entryId);

	if (!entry) {
		throw new Error('Tournament entry not found.');
	}

	await deleteDoc(doc(db, 'tournamentEntries', entry.id));
	await syncTournamentTeamConversation(event, { ...entry, memberIds: [] }, false);

	const removedMemberIds = new Set(entry.memberIds);
	await syncTournamentParticipantIds(
		event,
		event.participantIds.filter((id) => !removedMemberIds.has(id))
	);
}

export async function generateTournamentMatches(params: { eventId: string; userId: string }) {
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
		const bracketSize = 2 ** Math.ceil(Math.log2(entries.length));
		const roundCount = Math.log2(bracketSize);
		const rounds: Array<
			Array<{ id: string; homeEntryId: string | null; awayEntryId: string | null }>
		> = [];
		let nextRound: Array<{ id: string }> = [];
		let entryIndex = 0;
		const firstRoundMatchCount = bracketSize / 2;
		const pairedMatches = entries.length - firstRoundMatchCount;

		for (let roundNumber = roundCount; roundNumber >= 1; roundNumber -= 1) {
			const matchCount = 2 ** (roundCount - roundNumber);
			const currentRound: Array<{
				id: string;
				homeEntryId: string | null;
				awayEntryId: string | null;
			}> = [];

			for (let index = 0; index < matchCount; index += 1) {
				const isFirstRound = roundNumber === 1;
				const homeEntry = isFirstRound ? (entries[entryIndex++] ?? null) : null;
				const awayEntry =
					isFirstRound && index < pairedMatches ? (entries[entryIndex++] ?? null) : null;
				const stage: TournamentMatch['stage'] =
					roundNumber === roundCount
						? 'final'
						: roundNumber === roundCount - 1
							? 'semi_final'
							: 'knockout';
				const nextMatch = nextRound[Math.floor(index / 2)] ?? null;
				const matchRef = await createTournamentMatch({
					eventId: params.eventId,
					stage,
					roundNumber,
					homeEntryId: homeEntry?.id ?? null,
					awayEntryId: awayEntry?.id ?? null,
					homeName: homeEntry?.name ?? `Winner match ${index * 2 + 1}`,
					awayName: awayEntry?.name ?? (isFirstRound ? 'BYE' : `Winner match ${index * 2 + 2}`),
					nextMatchId: nextMatch?.id ?? null,
					nextMatchSlot: nextMatch ? (index % 2 === 0 ? 'home' : 'away') : null
				});

				currentRound.push({
					id: matchRef.id,
					homeEntryId: homeEntry?.id ?? null,
					awayEntryId: awayEntry?.id ?? null
				});
			}

			rounds[roundNumber - 1] = currentRound;
			nextRound = currentRound;
		}

		for (let index = 0; index < rounds[0].length; index += 1) {
			const firstRoundMatch = rounds[0][index];
			if (!firstRoundMatch.homeEntryId || firstRoundMatch.awayEntryId) continue;

			const entry = entries.find((item) => item.id === firstRoundMatch.homeEntryId);
			const nextMatch = rounds[1]?.[Math.floor(index / 2)];
			await updateDoc(doc(db, 'tournamentMatches', firstRoundMatch.id), {
				winnerEntryId: entry?.id ?? null,
				winnerName: entry?.name ?? null,
				status: 'finished',
				updatedAt: serverTimestamp()
			});
			if (entry && nextMatch) {
				const slot = index % 2 === 0 ? 'home' : 'away';
				await updateDoc(doc(db, 'tournamentMatches', nextMatch.id), {
					[`${slot}EntryId`]: entry.id,
					[`${slot}Name`]: entry.name,
					updatedAt: serverTimestamp()
				});
			}
		}
	}

	await updateDoc(doc(db, 'events', params.eventId), {
		tournamentStatus: 'in_progress',
		updatedAt: serverTimestamp()
	});
}

function isEliminationStage(stage: TournamentMatch['stage']) {
	return stage === 'knockout' || stage === 'semi_final' || stage === 'final';
}

async function finishTournament(eventId: string, winnerEntryId: string | null) {
	await updateDoc(doc(db, 'events', eventId), {
		status: 'finished',
		tournamentStatus: 'finished',
		isPromoted: false,
		promotionStatus: 'ended',
		updatedAt: serverTimestamp()
	});

	if (!winnerEntryId) return;

	const entries = await getTournamentEntries(eventId);
	await Promise.all(
		entries.map((entry) =>
			updateDoc(doc(db, 'tournamentEntries', entry.id), {
				status: entry.id === winnerEntryId ? 'winner' : 'eliminated',
				updatedAt: serverTimestamp()
			})
		)
	);
}

async function syncGroupPlayoffQualifiers(eventId: string) {
	const matches = await getTournamentMatches(eventId);
	const groupMatches = matches.filter((match) => match.stage === 'group');
	if (groupMatches.length === 0 || groupMatches.some((match) => match.status !== 'finished'))
		return;

	const entries = await getTournamentEntries(eventId);
	const groupNames = [
		...new Set(groupMatches.map((match) => match.groupName).filter(Boolean))
	] as string[];
	if (groupNames.length < 2) return;

	function rankGroup(groupName: string) {
		const rows = entries
			.filter((entry) => entry.groupName === groupName)
			.map((entry) => ({ entry, points: 0, difference: 0, scored: 0 }));
		const byId = new Map(rows.map((row) => [row.entry.id, row]));

		for (const match of groupMatches.filter((item) => item.groupName === groupName)) {
			const home = match.homeEntryId ? byId.get(match.homeEntryId) : null;
			const away = match.awayEntryId ? byId.get(match.awayEntryId) : null;
			if (!home || !away) continue;
			const homeScore = match.homeScore ?? 0;
			const awayScore = match.awayScore ?? 0;
			home.difference += homeScore - awayScore;
			away.difference += awayScore - homeScore;
			home.scored += homeScore;
			away.scored += awayScore;
			if (homeScore > awayScore) home.points += 3;
			else if (awayScore > homeScore) away.points += 3;
			else {
				home.points += 1;
				away.points += 1;
			}
		}

		return rows.sort(
			(a, b) => b.points - a.points || b.difference - a.difference || b.scored - a.scored
		);
	}

	const groupA = rankGroup(groupNames[0]);
	const groupB = rankGroup(groupNames[1]);
	const semiFinals = matches.filter((match) => match.stage === 'semi_final');
	const pairings = [
		[groupA[0]?.entry, groupB[1]?.entry],
		[groupB[0]?.entry, groupA[1]?.entry]
	];

	await Promise.all(
		semiFinals.slice(0, 2).map((match, index) => {
			const [home, away] = pairings[index];
			if (!home || !away) return Promise.resolve();
			return updateDoc(doc(db, 'tournamentMatches', match.id), {
				homeEntryId: home.id,
				homeName: home.name,
				awayEntryId: away.id,
				awayName: away.name,
				updatedAt: serverTimestamp()
			});
		})
	);
}

async function findOrCreateNextEliminationMatch(match: TournamentMatch) {
	let matches = await getTournamentMatches(match.eventId);
	const currentRound = matches.filter(
		(item) => item.roundNumber === match.roundNumber && isEliminationStage(item.stage)
	);
	const currentIndex = currentRound.findIndex((item) => item.id === match.id);

	if (match.nextMatchId) {
		const linked = matches.find((item) => item.id === match.nextMatchId);
		if (linked) return { match: linked, slot: match.nextMatchSlot ?? 'home', terminal: false };
	}

	let nextRound = matches.filter(
		(item) => item.roundNumber === match.roundNumber + 1 && isEliminationStage(item.stage)
	);

	if (nextRound.length === 0 && currentRound.length > 1) {
		const nextCount = Math.ceil(currentRound.length / 2);
		const nextStage: TournamentMatch['stage'] =
			nextCount === 1 ? 'final' : nextCount === 2 ? 'semi_final' : 'knockout';
		for (let index = 0; index < nextCount; index += 1) {
			await createTournamentMatch({
				eventId: match.eventId,
				stage: nextStage,
				roundNumber: match.roundNumber + 1,
				homeName: `Winner match ${index * 2 + 1}`,
				awayName: `Winner match ${index * 2 + 2}`
			});
		}
		matches = await getTournamentMatches(match.eventId);
		nextRound = matches.filter(
			(item) => item.roundNumber === match.roundNumber + 1 && isEliminationStage(item.stage)
		);
	}

	if (nextRound.length === 0) return { match: null, slot: null, terminal: true };

	return {
		match: nextRound[Math.floor(Math.max(0, currentIndex) / 2)] ?? null,
		slot: currentIndex % 2 === 0 ? ('home' as const) : ('away' as const),
		terminal: false
	};
}

export async function syncTournamentBracketProgress(params: { eventId: string; userId: string }) {
	const event = await assertTournamentEvent(params.eventId);
	await assertCanManageEvent(event, params.userId);

	const initialMatches = await getTournamentMatches(params.eventId);
	const eliminationMatches = initialMatches.filter((match) => isEliminationStage(match.stage));
	let tournamentFinished = event.tournamentStatus === 'finished';

	for (const originalMatch of eliminationMatches) {
		let match = originalMatch;
		const hasHome = Boolean(match.homeEntryId);
		const hasAway = Boolean(match.awayEntryId);

		if (match.status !== 'finished' && hasHome !== hasAway) {
			const winnerEntryId = hasHome ? (match.homeEntryId ?? null) : (match.awayEntryId ?? null);
			const winnerName = hasHome ? match.homeName : match.awayName;
			await updateDoc(doc(db, 'tournamentMatches', match.id), {
				winnerEntryId,
				winnerName,
				status: 'finished',
				updatedAt: serverTimestamp()
			});
			match = { ...match, winnerEntryId, winnerName, status: 'finished' };
		}

		if (match.status !== 'finished' || !match.winnerEntryId || !match.winnerName) continue;

		const progression = await findOrCreateNextEliminationMatch(match);
		if (progression.terminal || !progression.match) {
			if (!tournamentFinished) {
				await finishTournament(match.eventId, match.winnerEntryId);
				tournamentFinished = true;
			}
			continue;
		}

		const slot = progression.slot ?? 'home';
		const currentEntryId =
			slot === 'home' ? progression.match.homeEntryId : progression.match.awayEntryId;
		if (currentEntryId !== match.winnerEntryId) {
			await updateDoc(doc(db, 'tournamentMatches', progression.match.id), {
				[`${slot}EntryId`]: match.winnerEntryId,
				[`${slot}Name`]: match.winnerName,
				homeScore: null,
				awayScore: null,
				winnerEntryId: null,
				winnerName: null,
				status: 'scheduled',
				updatedAt: serverTimestamp()
			});
		}

		if (match.nextMatchId !== progression.match.id || match.nextMatchSlot !== slot) {
			await updateDoc(doc(db, 'tournamentMatches', match.id), {
				nextMatchId: progression.match.id,
				nextMatchSlot: slot,
				updatedAt: serverTimestamp()
			});
		}
	}
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

	if (isEliminationStage(match.stage) && params.homeScore === params.awayScore) {
		throw new Error('Elimination matches need a winner. Add the tie-break result to the score.');
	}
	if (
		isEliminationStage(match.stage) &&
		(!match.homeEntryId ||
			!match.awayEntryId ||
			match.homeName === 'BYE' ||
			match.awayName === 'BYE')
	) {
		throw new Error('Both participants must be known before saving this result.');
	}

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
		scheduledAt: params.scheduledAt
			? Timestamp.fromDate(params.scheduledAt)
			: (match.scheduledAt ?? null),
		updatedAt: serverTimestamp()
	});

	if (match.stage === 'group') {
		await syncGroupPlayoffQualifiers(match.eventId);
		return;
	}

	if (match.stage === 'league') {
		const leagueMatches = await getTournamentMatches(match.eventId);
		const allFinished = leagueMatches
			.filter((item) => item.stage === 'league')
			.every((item) => item.id === match.id || item.status === 'finished');
		if (allFinished) {
			const entries = await getTournamentEntries(match.eventId);
			const points = new Map(entries.map((entry) => [entry.id, 0]));
			for (const item of leagueMatches.filter((candidate) => candidate.stage === 'league')) {
				const homeScore = item.id === match.id ? params.homeScore : (item.homeScore ?? 0);
				const awayScore = item.id === match.id ? params.awayScore : (item.awayScore ?? 0);
				if (!item.homeEntryId || !item.awayEntryId) continue;
				if (homeScore > awayScore)
					points.set(item.homeEntryId, (points.get(item.homeEntryId) ?? 0) + 3);
				else if (awayScore > homeScore)
					points.set(item.awayEntryId, (points.get(item.awayEntryId) ?? 0) + 3);
				else {
					points.set(item.homeEntryId, (points.get(item.homeEntryId) ?? 0) + 1);
					points.set(item.awayEntryId, (points.get(item.awayEntryId) ?? 0) + 1);
				}
			}
			const winner = [...points.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
			await finishTournament(match.eventId, winner);
		}
		return;
	}

	const progression = await findOrCreateNextEliminationMatch({
		...match,
		winnerEntryId,
		winnerName,
		status: 'finished'
	});
	if (progression.terminal || !progression.match) {
		await finishTournament(match.eventId, winnerEntryId);
		return;
	}
	if (event.tournamentStatus === 'finished') {
		const entries = await getTournamentEntries(match.eventId);
		await Promise.all([
			updateDoc(doc(db, 'events', match.eventId), {
				status:
					event.participantIds.length >= event.maxParticipants || event.status === 'full'
						? 'full'
						: 'open',
				tournamentStatus: 'in_progress',
				updatedAt: serverTimestamp()
			}),
			...entries.map((entry) =>
				updateDoc(doc(db, 'tournamentEntries', entry.id), {
					status: 'confirmed',
					updatedAt: serverTimestamp()
				})
			)
		]);
	}

	const slot = progression.slot ?? 'home';
	await updateDoc(doc(db, 'tournamentMatches', progression.match.id), {
		[`${slot}EntryId`]: winnerEntryId,
		[`${slot}Name`]: winnerName,
		homeScore: null,
		awayScore: null,
		winnerEntryId: null,
		winnerName: null,
		status: 'scheduled',
		updatedAt: serverTimestamp()
	});
	await updateDoc(matchRef, {
		nextMatchId: progression.match.id,
		nextMatchSlot: slot,
		updatedAt: serverTimestamp()
	});
}

export async function notifyEventFinished(event: SportEvent): Promise<void> {
	if (event.status === 'finished' || event.status === 'cancelled') return;
	if (!isEventFinished(event)) return;

	await updateDoc(doc(db, 'events', event.id), {
		status: 'finished',
		...(event.isPromoted
			? {
					isPromoted: false,
					promotionStatus: 'ended'
				}
			: {}),
		updatedAt: serverTimestamp()
	});
}

export interface WeatherForecast {
	temp: number;
	icon: string;
	description: string;
}

export async function getWeatherForEvent(
	lat: number | null | undefined,
	lng: number | null | undefined,
	startAt: any
): Promise<WeatherForecast | null> {
	if (lat === null || lat === undefined || lng === null || lng === undefined || !startAt) {
		return null;
	}

	try {
		let date: Date;
		if (startAt && typeof startAt.toDate === 'function') {
			date = startAt.toDate();
		} else if (startAt instanceof Date) {
			date = startAt;
		} else if (typeof startAt === 'string' || typeof startAt === 'number') {
			date = new Date(startAt);
		} else {
			return null;
		}

		const dateStr = date.toISOString().split('T')[0];
		const eventHour = date.getHours();

		const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,weather_code&start_date=${dateStr}&end_date=${dateStr}&timezone=auto`;

		const response = await fetch(url);
		if (!response.ok) return null;

		const data = await response.json();
		if (!data.hourly || !data.hourly.temperature_2m || !data.hourly.weather_code) {
			return null;
		}

		const temp = data.hourly.temperature_2m[eventHour];
		const code = data.hourly.weather_code[eventHour];

		if (temp === undefined || code === undefined) return null;

		let icon = '☀️';
		let description = 'weather_clear_sky';

		if (code >= 1 && code <= 3) {
			icon = '🌤️';
			description = 'weather_partly_cloudy';
		} else if (code === 45 || code === 48) {
			icon = '🌫️';
			description = 'weather_foggy';
		} else if ((code >= 51 && code <= 55) || (code >= 61 && code <= 65)) {
			icon = '🌧️';
			description = 'weather_rainy';
		} else if (code >= 71 && code <= 77) {
			icon = '❄️';
			description = 'weather_snowy';
		} else if (code >= 95) {
			icon = '⚡';
			description = 'weather_thunderstorm';
		}

		return { temp, icon, description };
	} catch (error) {
		console.error('Error fetching weather:', error);
		return null;
	}
}
