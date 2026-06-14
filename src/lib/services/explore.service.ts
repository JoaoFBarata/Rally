import {
	collection,
	getDocs,
	query,
	where
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { SportEvent } from '$lib/schema';
import { getEventById } from '$lib/services/event.service';
import { getInvitesForUser } from '$lib/services/invite.service';
import { getFriendsForUser } from '$lib/services/social.service';

function eventFromDoc(docSnap: { id: string; data: () => unknown }) {
	return {
		id: docSnap.id,
		...(docSnap.data() as object)
	} as SportEvent;
}

function getStartAtMillis(event: SportEvent) {
	const startAt = event.startAt as unknown as { toMillis?: () => number; toDate?: () => Date };

	if (startAt?.toMillis) return startAt.toMillis();
	if (startAt?.toDate) return startAt.toDate().getTime();

	return 0;
}

function chunkArray<T>(items: T[], size: number) {
	const chunks: T[][] = [];

	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}

	return chunks;
}

export async function getVisibleEventsForUser(userId: string) {
	const eventsById = new Map<string, SportEvent>();

	// 1. Eventos criados por mim
	const myEventsQuery = query(
		collection(db, 'events'),
		where('creatorId', '==', userId)
	);

	const myEventsSnap = await getDocs(myEventsQuery);

	for (const docSnap of myEventsSnap.docs) {
		const event = eventFromDoc(docSnap);
		eventsById.set(event.id, event);
	}

	// 2. Eventos onde já sou participante
	const joinedEventsQuery = query(
		collection(db, 'events'),
		where('participantIds', 'array-contains', userId)
	);

	const joinedEventsSnap = await getDocs(joinedEventsQuery);

	for (const docSnap of joinedEventsSnap.docs) {
		const event = eventFromDoc(docSnap);
		eventsById.set(event.id, event);
	}

	// 3. Eventos públicos
	const publicEventsQuery = query(
		collection(db, 'events'),
		where('visibility', '==', 'public')
	);

	const publicEventsSnap = await getDocs(publicEventsQuery);

	for (const docSnap of publicEventsSnap.docs) {
		const event = eventFromDoc(docSnap);
		eventsById.set(event.id, event);
	}

	// 4. Eventos para os quais fui convidado
	const invites = await getInvitesForUser(userId);

	for (const invite of invites) {
		if (invite.status === 'declined') continue;

		const invitedEvent = await getEventById(invite.eventId);

		if (invitedEvent) {
			eventsById.set(invitedEvent.id, invitedEvent);
		}
	}

	// 5. Eventos "friends" criados por amigos
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

	return Array.from(eventsById.values()).sort(
		(a, b) => getStartAtMillis(a) - getStartAtMillis(b)
	);
}