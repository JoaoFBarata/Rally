import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { SportEvent } from '$lib/schema';
import {
	getEffectiveEventStatus,
	getEventById,
	getEventStartAtMillis,
	isPromotionActive,
	sortEventsByStartDate
} from '$lib/services/event.service';
import { getInvitesForUser } from '$lib/services/invite.service';
import { getFriendsForUser } from '$lib/services/social.service';
import { getOrganizationsFollowedByUser } from '$lib/services/organization.service';

function eventFromDoc(docSnap: { id: string; data: () => unknown }) {
	return {
		id: docSnap.id,
		...(docSnap.data() as object)
	} as SportEvent;
}

function isVisibleInExplore(event: SportEvent) {
	const status = getEffectiveEventStatus(event);

	if (status === 'cancelled') return false;
	if (status === 'finished') return false;

	const startAtMs = getEventStartAtMillis(event);

	return startAtMs >= Date.now();
}

function chunkArray<T>(items: T[], size: number) {
	const chunks: T[][] = [];

	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}

	return chunks;
}

function promotedFirst(events: SportEvent[]) {
	return [...events].sort((a, b) => {
		const aPromoted = isPromotionActive(a);
		const bPromoted = isPromotionActive(b);

		if (aPromoted !== bPromoted) return aPromoted ? -1 : 1;

		if (aPromoted && bPromoted) {
			const planWeight = {
				featured: 3,
				sport: 2,
				local: 1
			};

			const aWeight = a.promotionPlan ? planWeight[a.promotionPlan] : 0;
			const bWeight = b.promotionPlan ? planWeight[b.promotionPlan] : 0;

			if (aWeight !== bWeight) return bWeight - aWeight;
		}

		return getEventStartAtMillis(a) - getEventStartAtMillis(b);
	});
}

export async function getPublicEvents() {
	const eventsById = new Map<string, SportEvent>();

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
		eventsById.set(event.id, event);
	}

	return promotedFirst(sortEventsByStartDate(Array.from(eventsById.values()).filter(isVisibleInExplore)));
}

export async function getVisibleEventsForUser(userId: string) {
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
		eventsById.set(event.id, event);
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

	return promotedFirst(sortEventsByStartDate(Array.from(eventsById.values()).filter(isVisibleInExplore)));
}
