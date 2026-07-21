import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	orderBy,
	query,
	serverTimestamp,
	setDoc,
	updateDoc,
	where
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { Sport, SportEvent, Venue, VenueReview, VenueReviewSource, VerificationStatus } from '$lib/schema';
import { getEffectiveEventStatus } from '$lib/services/event.service';
import { calculateRouteDistanceKm } from '$lib/utils/route.utils';
import type { VenueSeed } from '$lib/data/venues.seed';

function slugify(value: string) {
	return value
		.toLowerCase()
		.trim()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

// Events within this radius of a venue's coordinates are considered to have
// been played there. Firestore has no native geo-radius query, and the event
// catalog is small enough that a client-side distance filter over all public
// events is fine for now.
const NEARBY_EVENT_RADIUS_KM = 0.3;

function venueReviewIdFor(venueId: string, userId: string) {
	return `${venueId}_${userId}`;
}

export function venueIdFor(name: string) {
	return slugify(name);
}

/**
 * One-time/idempotent import of the curated venue directory (see
 * src/lib/data/venues.seed.ts). Requires platform-admin write access per
 * firestore.rules. Safe to re-run — venue and official-review ids are
 * deterministic slugs, so re-seeding just overwrites the same documents
 * rather than duplicating them.
 */
export async function seedVenues(seeds: VenueSeed[]) {
	let count = 0;

	for (const seed of seeds) {
		const venueId = venueIdFor(seed.name);
		const venueRef = doc(db, 'venues', venueId);
		const existing = await getDoc(venueRef);

		await setDoc(
			venueRef,
			{
				id: venueId,
				name: seed.name,
				sports: seed.sports,
				description: seed.description,
				address: seed.address,
				city: seed.city,
				country: 'Portugal',
				lat: seed.lat,
				lng: seed.lng,
				photoURL: null,
				website: seed.website ?? null,
				verificationStatus: 'unverified',
				createdAt: existing.exists()
					? ((existing.data() as Venue).createdAt ?? serverTimestamp())
					: serverTimestamp(),
				updatedAt: serverTimestamp()
			},
			{ merge: true }
		);

		const reviewRef = doc(db, 'venueReviews', `${venueId}_official`);
		const existingReview = await getDoc(reviewRef);

		await setDoc(
			reviewRef,
			{
				id: reviewRef.id,
				venueId,
				source: 'official',
				userId: null,
				authorName: 'Rally Team',
				authorPhotoURL: null,
				rating: seed.officialRating,
				comment: seed.officialNote,
				createdAt: existingReview.exists()
					? ((existingReview.data() as VenueReview).createdAt ?? serverTimestamp())
					: serverTimestamp(),
				updatedAt: serverTimestamp()
			},
			{ merge: true }
		);

		count += 1;
	}

	return count;
}

export async function getVenues(filters?: { sport?: Sport | null; city?: string | null }) {
	const q = query(collection(db, 'venues'), orderBy('name'));
	const snap = await getDocs(q);

	let venues = snap.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }) as Venue);

	if (filters?.sport) {
		venues = venues.filter((venue) => venue.sports.includes(filters.sport as Sport));
	}
	if (filters?.city) {
		venues = venues.filter((venue) => venue.city === filters.city);
	}

	return venues;
}

export async function getVenueById(venueId: string) {
	const snap = await getDoc(doc(db, 'venues', venueId));
	if (!snap.exists()) return null;
	return { ...snap.data(), id: snap.id } as Venue;
}

/** Platform-admin-only per firestore.rules — flips a venue's Rally Verified status. */
export async function setVenueVerification(venueId: string, status: VerificationStatus) {
	await updateDoc(doc(db, 'venues', venueId), {
		verificationStatus: status,
		updatedAt: serverTimestamp()
	});
}

export async function getVenueReviews(venueId: string, source?: VenueReviewSource) {
	const q = query(collection(db, 'venueReviews'), where('venueId', '==', venueId));
	const snap = await getDocs(q);

	let reviews = snap.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }) as VenueReview);

	if (source) {
		reviews = reviews.filter((review) => review.source === source);
	}

	return reviews.sort((a, b) => {
		const aMs = (a.createdAt as unknown as { toMillis?: () => number })?.toMillis?.() ?? 0;
		const bMs = (b.createdAt as unknown as { toMillis?: () => number })?.toMillis?.() ?? 0;
		return bMs - aMs;
	});
}

export function getRatingSummary(reviews: VenueReview[]) {
	if (reviews.length === 0) return { average: 0, count: 0 };
	const total = reviews.reduce((sum, review) => sum + review.rating, 0);
	return { average: total / reviews.length, count: reviews.length };
}

export async function submitVenueReview(params: {
	venueId: string;
	userId: string;
	rating: number;
	comment: string;
	authorName: string;
	authorPhotoURL?: string | null;
}) {
	const rating = Math.max(1, Math.min(5, Math.round(params.rating)));
	const reviewRef = doc(db, 'venueReviews', venueReviewIdFor(params.venueId, params.userId));
	const existing = await getDoc(reviewRef);

	await setDoc(
		reviewRef,
		{
			id: reviewRef.id,
			venueId: params.venueId,
			source: 'rally_user',
			userId: params.userId,
			authorName: params.authorName,
			authorPhotoURL: params.authorPhotoURL ?? null,
			rating,
			comment: params.comment.trim(),
			createdAt: existing.exists()
				? ((existing.data() as VenueReview).createdAt ?? serverTimestamp())
				: serverTimestamp(),
			updatedAt: serverTimestamp()
		},
		{ merge: true }
	);
}

export async function deleteVenueReview(reviewId: string) {
	await deleteDoc(doc(db, 'venueReviews', reviewId));
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
	return calculateRouteDistanceKm([a, b]) ?? Infinity;
}

/**
 * Public events whose location sits within NEARBY_EVENT_RADIUS_KM of the
 * venue — a proximity match rather than an explicit venueId link, since
 * existing events don't reference venues directly.
 */
export async function getEventsNearVenue(venue: Venue) {
	const q = query(collection(db, 'events'), where('visibility', '==', 'public'));
	const snap = await getDocs(q);

	const events = snap.docs
		.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }) as SportEvent)
		.filter((event) => {
			const lat = event.location?.lat;
			const lng = event.location?.lng;
			if (typeof lat !== 'number' || typeof lng !== 'number') return false;
			return distanceKm({ lat: venue.lat, lng: venue.lng }, { lat, lng }) <= NEARBY_EVENT_RADIUS_KM;
		});

	const past = events
		.filter((event) => getEffectiveEventStatus(event) === 'finished')
		.sort((a, b) => getEventStartMs(b) - getEventStartMs(a));

	const upcoming = events
		.filter((event) => {
			const status = getEffectiveEventStatus(event);
			return status === 'open' || status === 'full';
		})
		.sort((a, b) => getEventStartMs(a) - getEventStartMs(b));

	return { past, upcoming };
}

function getEventStartMs(event: SportEvent): number {
	const ts = event.startAt as unknown as { toMillis?: () => number; toDate?: () => Date };
	return ts?.toMillis?.() ?? ts?.toDate?.()?.getTime() ?? 0;
}
