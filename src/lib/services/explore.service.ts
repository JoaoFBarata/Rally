import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { SportEvent, UserProfile } from '$lib/schema';
import {
	getEffectiveEventStatus,
	getEventById,
	getEventStartAtMillis,
	isPromotionActive,
	sortEventsByStartDate
} from '$lib/services/event.service';
import { getInvitesForUser } from '$lib/services/invite.service';
import { getFriendsForUser } from '$lib/services/social.service';
import {
	getOrganizationById,
	getOrganizationsFollowedByUser
} from '$lib/services/organization.service';
import { getUserProfile } from '$lib/services/user.service';

function eventFromDoc(docSnap: { id: string; data: () => unknown }) {
	return {
		id: docSnap.id,
		...(docSnap.data() as object)
	} as SportEvent;
}

function isVisibleInExplore(event: SportEvent, windowDays?: number | null) {
	const status = getEffectiveEventStatus(event);

	if (status === 'cancelled') return false;
	if (status === 'finished') return false;

	const startAtMs = getEventStartAtMillis(event);
	const now = Date.now();

	if (startAtMs < now) return false;
	if (windowDays && windowDays > 0) {
		return startAtMs <= now + windowDays * 24 * 60 * 60 * 1000;
	}

	return true;
}

function chunkArray<T>(items: T[], size: number) {
	const chunks: T[][] = [];

	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}

	return chunks;
}

function normalizeTarget(value?: string) {
	return value?.trim().toLocaleLowerCase('pt-PT') ?? '';
}

function isSamePlace(first?: string, second?: string) {
	const a = normalizeTarget(first);
	const b = normalizeTarget(second);
	return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

function promotionWeight(event: SportEvent, profile?: UserProfile | null) {
	if (!isPromotionActive(event)) return 0;

	const targetCountry = event.promotionTargetCountry?.toUpperCase() || 'PT';
	const userCountry = profile?.country?.toUpperCase() || 'PT';

	if (targetCountry !== userCountry) return 0;

	if (event.promotionPlan === 'featured') return 30;

	if (event.promotionPlan === 'sport') {
		const targetSport = event.promotionTargetSport ?? event.sport;
		if (!profile || !profile.sports?.length) return 12;
		return profile.sports.includes(targetSport) ? 24 : 0;
	}

	if (event.promotionPlan === 'local') {
		if (!profile) return 12;
		if (!event.promotionTargetCity) return 12;
		// Older campaigns used the venue name as a city fallback. Treat those as country-wide.
		if (normalizeTarget(event.promotionTargetCity) === normalizeTarget(event.location.name))
			return 12;
		if (!profile.city) return 8;
		return isSamePlace(event.promotionTargetCity, profile.city) ? 18 : 6;
	}

	return 0;
}

function canSeeOwnOrganizationPromotions(profile?: UserProfile | null) {
	return Boolean(profile?.activeOrganizationId || profile?.accountType === 'organization');
}

function canSeeOwnPromotion(event: SportEvent, userId: string, profile?: UserProfile | null) {
	return (
		event.creatorId === userId ||
		(profile?.activeOrganizationId && event.organizationId === profile.activeOrganizationId) ||
		canSeeOwnOrganizationPromotions(profile)
	);
}

function isSamePromotionCountry(event: SportEvent, profile?: UserProfile | null) {
	const targetCountry = event.promotionTargetCountry?.toUpperCase() || 'PT';
	const userCountry = profile?.country?.toUpperCase() || 'PT';

	return targetCountry === userCountry;
}

function promotedFirst(events: SportEvent[], profile?: UserProfile | null) {
	return [...events].sort((a, b) => {
		const aWeight = promotionWeight(a, profile);
		const bWeight = promotionWeight(b, profile);
		if (aWeight !== bWeight) return bWeight - aWeight;

		return getEventStartAtMillis(a) - getEventStartAtMillis(b);
	});
}

async function refreshOrganizationSnapshots(events: SportEvent[]) {
	const organizationIds = [
		...new Set(
			events
				.filter((event) => event.hostType === 'organization')
				.map((event) => event.organizationId)
				.filter((organizationId): organizationId is string => Boolean(organizationId))
		)
	];

	const organizations = await Promise.all(
		organizationIds.map((organizationId) => getOrganizationById(organizationId))
	);
	const organizationsById = new Map(
		organizations
			.filter((organization) => organization !== null)
			.map((organization) => [organization.id, organization])
	);

	return events.map((event) => {
		if (!event.organizationId) return event;

		const organization = organizationsById.get(event.organizationId);
		if (!organization) return event;

		return {
			...event,
			hostType: 'organization' as const,
			organizationName: organization.name,
			organizationLogoURL: organization.logoURL ?? null,
			organizationVerificationStatus: organization.verificationStatus
		};
	});
}

export async function getPublicEvents() {
	const publicEventsQuery = query(collection(db, 'events'), where('visibility', '==', 'public'));
	const publicEventsSnap = await getDocs(publicEventsQuery);

	const events = await refreshOrganizationSnapshots(
		publicEventsSnap.docs.map(eventFromDoc).filter(isVisibleInExplore)
	);

	return promotedFirst(sortEventsByStartDate(events));
}

export async function getPromotedEventsForUser(userId: string, profile: UserProfile, limit = 2) {
	const promotedEventsQuery = query(collection(db, 'events'), where('isPromoted', '==', true));
	const promotedEventsSnap = await getDocs(promotedEventsQuery);

	const candidates = promotedEventsSnap.docs
		.map(eventFromDoc)
		.filter(isVisibleInExplore)
		.filter((event) => isPromotionActive(event))
		.filter((event) => event.visibility === 'public')
		.filter((event) => canSeeOwnPromotion(event, userId, profile) || event.creatorId !== userId)
		.filter(
			(event) =>
				canSeeOwnPromotion(event, userId, profile) ||
				event.organizationId !== profile.activeOrganizationId
		)
		.filter((event) => canSeeOwnPromotion(event, userId, profile) || !event.participantIds.includes(userId))
		.filter((event) => isSamePromotionCountry(event, profile))
		.filter((event) => canSeeOwnPromotion(event, userId, profile) || promotionWeight(event, profile) > 0);

	const events = await refreshOrganizationSnapshots(candidates);

	return promotedFirst(events, profile).slice(0, Math.max(1, limit));
}

export function subscribeToPromotedEventsForUser(
	userId: string,
	profile: UserProfile,
	onEvents: (events: SportEvent[]) => void,
	onError?: (error: Error) => void,
	limit = 10
) {
	const promotedEventsQuery = query(collection(db, 'events'), where('isPromoted', '==', true));
	let requestVersion = 0;
	let previousFingerprint = '';

	return onSnapshot(
		promotedEventsQuery,
		async (snapshot) => {
			const fingerprint = JSON.stringify(
				snapshot.docs.map((eventDoc) => {
					const event = eventFromDoc(eventDoc);
					const limit = event.promotionImpressionLimit ?? 0;
					return {
						id: event.id,
						status: event.status,
						participants: event.participantIds,
						promotionStatus: event.promotionStatus,
						plan: event.promotionPlan,
						country: event.promotionTargetCountry,
						city: event.promotionTargetCity,
						sport: event.promotionTargetSport,
						reachedLimit: limit > 0 && (event.promotionViews ?? 0) >= limit
					};
				})
			);
			if (fingerprint === previousFingerprint) return;
			previousFingerprint = fingerprint;
			const currentVersion = ++requestVersion;
			const candidates = snapshot.docs
				.map(eventFromDoc)
				.filter(isVisibleInExplore)
				.filter((event) => isPromotionActive(event))
				.filter((event) => event.visibility === 'public')
				.filter((event) => canSeeOwnPromotion(event, userId, profile) || event.creatorId !== userId)
				.filter(
					(event) =>
						canSeeOwnPromotion(event, userId, profile) ||
						event.organizationId !== profile.activeOrganizationId
				)
				.filter((event) => canSeeOwnPromotion(event, userId, profile) || !event.participantIds.includes(userId))
				.filter((event) => isSamePromotionCountry(event, profile))
				.filter((event) => canSeeOwnPromotion(event, userId, profile) || promotionWeight(event, profile) > 0);

			const events = await refreshOrganizationSnapshots(candidates);
			if (currentVersion !== requestVersion) return;
			onEvents(promotedFirst(events, profile).slice(0, Math.max(1, limit)));
		},
		(error) => onError?.(error)
	);
}

export async function getVisibleEventsForUser(
	userId: string,
	options: { windowDays?: number | null } = {}
) {
	const profile = await getUserProfile(userId);
	const eventsById = new Map<string, SportEvent>();

	const myEventsQuery = query(collection(db, 'events'), where('creatorId', '==', userId));
	const myEventsSnap = await getDocs(myEventsQuery);

	for (const docSnap of myEventsSnap.docs) {
		const event = eventFromDoc(docSnap);
		eventsById.set(event.id, event);
	}

	const joinedEventsQuery = query(
		collection(db, 'events'),
		where('participantIds', 'array-contains', userId)
	);

	const joinedEventsSnap = await getDocs(joinedEventsQuery);

	for (const docSnap of joinedEventsSnap.docs) {
		const event = eventFromDoc(docSnap);
		eventsById.set(event.id, event);
	}

	const publicEventsQuery = query(collection(db, 'events'), where('visibility', '==', 'public'));
	const publicEventsSnap = await getDocs(publicEventsQuery);

	for (const docSnap of publicEventsSnap.docs) {
		const event = eventFromDoc(docSnap);
		eventsById.set(event.id, event);
	}

	const promotedEventsQuery = query(collection(db, 'events'), where('isPromoted', '==', true));
	const promotedEventsSnap = await getDocs(promotedEventsQuery);

	for (const docSnap of promotedEventsSnap.docs) {
		const event = eventFromDoc(docSnap);
		if (event.visibility === 'public') eventsById.set(event.id, event);
	}

	const invites = await getInvitesForUser(userId);

	for (const invite of invites) {
		if (invite.status === 'declined') continue;

		const invitedEvent = await getEventById(invite.eventId);

		if (invitedEvent) {
			eventsById.set(invitedEvent.id, invitedEvent);
		}
	}

	const friends = await getFriendsForUser(userId);
	const friendIds = friends.map((friend) => friend.id).filter(Boolean);

	for (const chunk of chunkArray(friendIds, 10)) {
		const friendsEventsQuery = query(
			collection(db, 'events'),
			where('creatorId', 'in', chunk),
			where('visibility', '==', 'friends')
		);

		const friendsEventsSnap = await getDocs(friendsEventsQuery);

		for (const docSnap of friendsEventsSnap.docs) {
			const event = eventFromDoc(docSnap);
			eventsById.set(event.id, event);
		}
	}

	const followedOrganizations = await getOrganizationsFollowedByUser(userId);
	const followedOrganizationIds = followedOrganizations.map((organization) => organization.id);

	for (const chunk of chunkArray(followedOrganizationIds, 10)) {
		const followedOrgEventsQuery = query(
			collection(db, 'events'),
			where('organizationId', 'in', chunk)
		);

		const followedOrgEventsSnap = await getDocs(followedOrgEventsQuery);

		for (const docSnap of followedOrgEventsSnap.docs) {
			const event = eventFromDoc(docSnap);
			eventsById.set(event.id, event);
		}
	}

	const events = await refreshOrganizationSnapshots(
		Array.from(eventsById.values()).filter((event) =>
			isVisibleInExplore(event, options.windowDays ?? null)
		)
	);

	const contextualEvents = events.map((event) => {
		const alreadyConnected =
			event.creatorId === userId ||
			event.organizationId === profile?.activeOrganizationId ||
			event.participantIds.includes(userId);

		return {
			...event,
			promotionAudienceMatch:
				!isPromotionActive(event) ||
				((canSeeOwnPromotion(event, userId, profile) || !alreadyConnected) &&
					isSamePromotionCountry(event, profile) &&
					(canSeeOwnPromotion(event, userId, profile) || promotionWeight(event, profile) > 0))
		};
	});

	return promotedFirst(sortEventsByStartDate(contextualEvents), profile);
}
