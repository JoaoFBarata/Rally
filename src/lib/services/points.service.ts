import {
	collection,
	doc,
	getDocs,
	increment,
	limit,
	orderBy,
	query,
	runTransaction,
	serverTimestamp,
	where
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { RallyPointTransaction } from '$lib/schema';

// ─── Formula constants ────────────────────────────────────────────────────────

export const RALLY_POINTS_CONFIG = {
	/** Base reward for participating in any verified-venue event. */
	BASE_PARTICIPATION: 50,
	/** Bonus for the first time a user attends a specific venue. */
	FIRST_VENUE_BONUS: 25,
	/** Bonus per other participant in the event. */
	PER_PARTICIPANT: 2,
	/** Maximum bonus earned from other participants. */
	PER_PARTICIPANT_CAP: 20,
	/** Bonus for being the event organizer. */
	ORGANIZER_BONUS: 15,
	/** Bonus when the event reached full capacity. */
	FULL_EVENT_BONUS: 10
} as const;

// ─── Calculation ──────────────────────────────────────────────────────────────

export function calculateEventPoints(params: {
	participantCount: number;
	maxParticipants: number;
	isOrganizer: boolean;
	isFirstVenueVisit: boolean;
}): { breakdown: RallyPointTransaction['breakdown']; total: number } {
	const base = RALLY_POINTS_CONFIG.BASE_PARTICIPATION;

	const firstVenueBonus = params.isFirstVenueVisit ? RALLY_POINTS_CONFIG.FIRST_VENUE_BONUS : 0;

	const otherParticipants = Math.max(0, params.participantCount - 1);
	const participantBonus = Math.min(
		otherParticipants * RALLY_POINTS_CONFIG.PER_PARTICIPANT,
		RALLY_POINTS_CONFIG.PER_PARTICIPANT_CAP
	);

	const organizerBonus = params.isOrganizer ? RALLY_POINTS_CONFIG.ORGANIZER_BONUS : 0;

	const fullEventBonus =
		params.participantCount >= params.maxParticipants ? RALLY_POINTS_CONFIG.FULL_EVENT_BONUS : 0;

	const breakdown = { base, firstVenueBonus, participantBonus, organizerBonus, fullEventBonus };
	const total = base + firstVenueBonus + participantBonus + organizerBonus + fullEventBonus;

	return { breakdown, total };
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

/** Returns true if the user has previously earned points at the given venue. */
export async function hasVisitedVenueBefore(
	userId: string,
	venueOrganizationId: string
): Promise<boolean> {
	const q = query(
		collection(db, 'users', userId, 'pointTransactions'),
		where('venueOrganizationId', '==', venueOrganizationId),
		limit(1)
	);
	const snap = await getDocs(q);
	return !snap.empty;
}

/** Returns true if points have already been awarded for this event to this user. */
export async function hasPointsForEvent(userId: string, eventId: string): Promise<boolean> {
	const q = query(
		collection(db, 'users', userId, 'pointTransactions'),
		where('eventId', '==', eventId),
		limit(1)
	);
	const snap = await getDocs(q);
	return !snap.empty;
}

/**
 * Awards Rally Points to a user for a completed verified-venue event.
 * Idempotent — calling it twice for the same event is a no-op.
 */
export async function awardPointsForEvent(params: {
	userId: string;
	eventId: string;
	venueOrganizationId: string;
	venueName: string;
	eventTitle: string;
	participantCount: number;
	maxParticipants: number;
	isOrganizer: boolean;
}): Promise<{ awarded: boolean; points: number }> {
	const alreadyAwarded = await hasPointsForEvent(params.userId, params.eventId);
	if (alreadyAwarded) return { awarded: false, points: 0 };

	const isFirstVisit = !(await hasVisitedVenueBefore(params.userId, params.venueOrganizationId));

	const { breakdown, total } = calculateEventPoints({
		participantCount: params.participantCount,
		maxParticipants: params.maxParticipants,
		isOrganizer: params.isOrganizer,
		isFirstVenueVisit: isFirstVisit
	});

	const userRef = doc(db, 'users', params.userId);
	const txCollectionRef = collection(db, 'users', params.userId, 'pointTransactions');

	await runTransaction(db, async (tx) => {
		tx.update(userRef, {
			rallyPointsTotal: increment(total),
			updatedAt: serverTimestamp()
		});

		// addDoc inside a runTransaction isn't supported — write with a generated ref instead
		const newTxRef = doc(txCollectionRef);
		tx.set(newTxRef, {
			userId: params.userId,
			eventId: params.eventId,
			venueOrganizationId: params.venueOrganizationId,
			venueName: params.venueName,
			eventTitle: params.eventTitle,
			amount: total,
			breakdown,
			createdAt: serverTimestamp()
		});
	});

	return { awarded: true, points: total };
}

/** Fetches the most recent point transactions for a user (up to `n`). */
export async function getUserPointTransactions(
	userId: string,
	n = 10
): Promise<RallyPointTransaction[]> {
	const q = query(
		collection(db, 'users', userId, 'pointTransactions'),
		orderBy('createdAt', 'desc'),
		limit(n)
	);
	const snap = await getDocs(q);
	return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RallyPointTransaction);
}
