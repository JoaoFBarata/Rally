import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '$lib/firebase';

type Unsubscribe = () => void;

function timestampValue(value: unknown) {
	const timestamp = value as { toMillis?: () => number } | null;
	return timestamp?.toMillis?.() ?? null;
}

export function subscribeToEventCatalogChanges(onChange: () => void): Unsubscribe {
	let previousFingerprint = '';
	let initialized = false;

	return onSnapshot(collection(db, 'events'), (snapshot) => {
		const fingerprint = JSON.stringify(
			snapshot.docs
				.map((eventDoc) => {
					const event = eventDoc.data();
					return {
						id: eventDoc.id,
						title: event.title,
						status: event.status,
						visibility: event.visibility,
						participantIds: event.participantIds,
						startAt: timestampValue(event.startAt),
						isPromoted: event.isPromoted,
						promotionStatus: event.promotionStatus,
						promotionPlan: event.promotionPlan,
						promotionTargetCountry: event.promotionTargetCountry,
						promotionTargetCity: event.promotionTargetCity,
						promotionTargetSport: event.promotionTargetSport,
						promotionEndsAt: timestampValue(event.promotionEndsAt)
					};
				})
				.sort((a, b) => a.id.localeCompare(b.id))
		);

		if (!initialized) {
			initialized = true;
			previousFingerprint = fingerprint;
			return;
		}

		if (fingerprint !== previousFingerprint) {
			previousFingerprint = fingerprint;
			onChange();
		}
	});
}

export function subscribeToOrganizationChanges(
	organizationId: string,
	onChange: () => void
): Unsubscribe {
	let initialized = false;
	return onSnapshot(doc(db, 'organizations', organizationId), () => {
		if (!initialized) {
			initialized = true;
			return;
		}
		onChange();
	});
}

export function subscribeToEventChanges(eventId: string, onChange: () => void): Unsubscribe {
	let initialized = false;
	let previousFingerprint = '';

	return onSnapshot(doc(db, 'events', eventId), (snapshot) => {
		const event = snapshot.data();
		const {
			promotionViews: _views,
			promotionClicks: _clicks,
			updatedAt: _updatedAt,
			...data
		} = event ?? {};
		const fingerprint = JSON.stringify(data);

		if (!initialized) {
			initialized = true;
			previousFingerprint = fingerprint;
			return;
		}
		if (fingerprint !== previousFingerprint) {
			previousFingerprint = fingerprint;
			onChange();
		}
	});
}

export function subscribeToUserChanges(userId: string, onChange: () => void): Unsubscribe {
	let initialized = false;
	return onSnapshot(doc(db, 'users', userId), () => {
		if (!initialized) {
			initialized = true;
			return;
		}
		onChange();
	});
}

export function subscribeToTournamentChanges(eventId: string, onChange: () => void): Unsubscribe {
	let initializedEntries = false;
	let initializedMatches = false;
	const unsubscribeEntries = onSnapshot(
		query(collection(db, 'tournamentEntries'), where('eventId', '==', eventId)),
		() => {
			if (!initializedEntries) {
				initializedEntries = true;
				return;
			}
			onChange();
		}
	);
	const unsubscribeMatches = onSnapshot(
		query(collection(db, 'tournamentMatches'), where('eventId', '==', eventId)),
		() => {
			if (!initializedMatches) {
				initializedMatches = true;
				return;
			}
			onChange();
		}
	);
	return () => {
		unsubscribeEntries();
		unsubscribeMatches();
	};
}

export function subscribeToUserActivityChanges(userId: string, onChange: () => void): Unsubscribe {
	const subscriptions: Unsubscribe[] = [];
	const queries = [
		query(collection(db, 'eventInvites'), where('toUserId', '==', userId)),
		query(collection(db, 'friendRequests'), where('toUserId', '==', userId)),
		query(collection(db, 'friendRequests'), where('fromUserId', '==', userId)),
		query(collection(db, 'friendships'), where('memberIds', 'array-contains', userId))
	];

	for (const activityQuery of queries) {
		let initialized = false;
		subscriptions.push(
			onSnapshot(activityQuery, () => {
				if (!initialized) {
					initialized = true;
					return;
				}
				onChange();
			})
		);
	}

	return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}
