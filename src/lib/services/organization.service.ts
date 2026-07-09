import {
	addDoc,
	arrayUnion,
	collection,
	deleteDoc,
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
	Organization,
	OrganizationPublicLocation,
	OrganizationReview,
	OrganizationReviewReply,
	OrganizationType,
	OrganizationVerificationRequest,
	Sport,
	VerificationLevel,
	VerificationStatus
} from '$lib/schema';

function slugify(value: string) {
	return value
		.toLowerCase()
		.trim()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function followerIdFor(organizationId: string, userId: string) {
	return `${organizationId}_${userId}`;
}

function reviewIdFor(organizationId: string, userId: string) {
	return `${organizationId}_${userId}`;
}

export function organizationHandleFromName(name: string) {
	return slugify(name || 'organization');
}

export function isOrganizationAdmin(organization: Organization, userId: string) {
	return organization.ownerId === userId || organization.adminIds.includes(userId);
}

export function canCreateOfficialPaidEvents(organization: Organization) {
	return organization.verificationStatus === 'verified';
}

export async function createOrganization(params: {
	name: string;
	type: OrganizationType;
	description?: string;
	ownerId: string;
	contactEmail: string;
	phone?: string;
	website?: string;
	address?: string;
	city?: string;
	nif?: string;
	logoURL?: string | null;
}) {
	const organizationData = {
		name: params.name.trim(),
		handle: organizationHandleFromName(params.name),
		type: params.type,
		description: params.description?.trim() ?? '',
		logoURL: params.logoURL ?? null,
		logoPath: null,
		coverPhotoURL: null,
		coverPhotoPath: null,
		galleryPhotoURLs: [],
		galleryPhotoPaths: [],
		sports: [],
		website: params.website?.trim() ?? '',
		phone: params.phone?.trim() ?? '',
		contactEmail: params.contactEmail.trim().toLowerCase(),
		address: params.address?.trim() ?? '',
		city: params.city?.trim() ?? '',
		nif: params.nif?.trim() ?? '',
		verificationStatus: 'unverified' satisfies VerificationStatus,
		verificationLevel: 'none' satisfies VerificationLevel,
		verificationNote: '',
		verifiedAt: null,
		verifiedBy: null,
		ownerId: params.ownerId,
		adminIds: [params.ownerId],
		memberIds: [params.ownerId],
		followersCount: 0,
		hasPublicVenue: false,
		publicLocation: null,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	const docRef = await addDoc(collection(db, 'organizations'), organizationData);
	const snap = await getDoc(docRef);

	return {
		...snap.data(),
		id: snap.id
	} as Organization;
}

export async function getOrganizationById(organizationId: string) {
	const organizationRef = doc(db, 'organizations', organizationId);
	const snap = await getDoc(organizationRef);

	if (!snap.exists()) return null;

	return {
		...snap.data(),
		id: snap.id
	} as Organization;
}

export async function getOrganizationsForAdmin(userId: string) {
	const q = query(collection(db, 'organizations'), where('adminIds', 'array-contains', userId));
	const snap = await getDocs(q);

	return snap.docs.map((docSnap) => ({
		...docSnap.data(),
		id: docSnap.id
	})) as Organization[];
}

export async function getOrganizationsFollowedByUser(userId: string) {
	const q = query(collection(db, 'organizationFollowers'), where('userId', '==', userId));
	const snap = await getDocs(q);

	const organizationIds = snap.docs
		.map((docSnap) => (docSnap.data() as { organizationId?: string }).organizationId)
		.filter((id): id is string => Boolean(id));

	const organizations = await Promise.all(organizationIds.map((id) => getOrganizationById(id)));

	return organizations.filter(
		(organization): organization is Organization => organization !== null
	);
}

export async function getOrganizationFollowerIds(organizationId: string) {
	const q = query(
		collection(db, 'organizationFollowers'),
		where('organizationId', '==', organizationId)
	);
	const snap = await getDocs(q);

	return snap.docs
		.map((docSnap) => (docSnap.data() as { userId?: string }).userId)
		.filter((id): id is string => Boolean(id));
}

export async function assertCanManageOrganization(params: {
	organizationId: string;
	userId: string;
}) {
	const organization = await getOrganizationById(params.organizationId);

	if (!organization) throw new Error('Organization not found.');
	if (!isOrganizationAdmin(organization, params.userId)) {
		throw new Error('You do not have permission to manage this organization.');
	}

	return organization;
}

export async function updateOrganizationProfile(params: {
	organizationId: string;
	userId: string;
	name: string;
	type: OrganizationType;
	description: string;
	contactEmail: string;
	phone?: string;
	website?: string;
	address?: string;
	city?: string;
	nif?: string;
	logoURL?: string | null;
	logoPath?: string | null;
	coverPhotoURL?: string | null;
	coverPhotoPath?: string | null;
	galleryPhotoURLs?: string[];
	galleryPhotoPaths?: string[];
	sports?: Sport[];
	hasPublicVenue?: boolean;
	publicLocation?: OrganizationPublicLocation | null;
}) {
	await assertCanManageOrganization({
		organizationId: params.organizationId,
		userId: params.userId
	});

	await updateDoc(doc(db, 'organizations', params.organizationId), {
		name: params.name.trim(),
		handle: organizationHandleFromName(params.name),
		type: params.type,
		description: params.description.trim(),
		contactEmail: params.contactEmail.trim().toLowerCase(),
		phone: params.phone?.trim() ?? '',
		website: params.website?.trim() ?? '',
		address: params.address?.trim() ?? '',
		city: params.city?.trim() ?? '',
		nif: params.nif?.trim() ?? '',
		logoURL: params.logoURL ?? null,
		logoPath: params.logoPath ?? null,
		...(params.coverPhotoURL !== undefined ? { coverPhotoURL: params.coverPhotoURL } : {}),
		...(params.coverPhotoPath !== undefined ? { coverPhotoPath: params.coverPhotoPath } : {}),
		...(params.galleryPhotoURLs !== undefined ? { galleryPhotoURLs: params.galleryPhotoURLs } : {}),
		...(params.galleryPhotoPaths !== undefined ? { galleryPhotoPaths: params.galleryPhotoPaths } : {}),
		...(params.sports !== undefined ? { sports: params.sports } : {}),
		...(params.hasPublicVenue !== undefined
			? {
					hasPublicVenue: params.hasPublicVenue,
					publicLocation: params.hasPublicVenue ? (params.publicLocation ?? null) : null
				}
			: {}),
		updatedAt: serverTimestamp()
	});
}

export async function requestOrganizationVerification(params: {
	organizationId: string;
	userId: string;
	legalName: string;
	nif?: string;
	website?: string;
	address?: string;
	note?: string;
	requestedLevel?: VerificationLevel;
	hasPublicVenue?: boolean;
	publicLocation?: OrganizationPublicLocation | null;
}) {
	const organization = await assertCanManageOrganization({
		organizationId: params.organizationId,
		userId: params.userId
	});

	if (organization.verificationStatus === 'verified') {
		throw new Error('This organization is already verified.');
	}
	if (!params.legalName.trim() || !(params.nif?.trim() || organization.nif?.trim())) {
		throw new Error('Legal name and NIF are required for verification.');
	}
	if (
		params.hasPublicVenue &&
		(!params.publicLocation?.address ||
			!Number.isFinite(params.publicLocation.lat) ||
			!Number.isFinite(params.publicLocation.lng))
	) {
		throw new Error('Select a valid public venue location on the map.');
	}

	const requestData = {
		organizationId: params.organizationId,
		submittedBy: params.userId,
		legalName: params.legalName.trim(),
		nif: params.nif?.trim() ?? organization.nif ?? '',
		website: params.website?.trim() ?? organization.website ?? '',
		address: params.address?.trim() ?? organization.address ?? '',
		hasPublicVenue: params.hasPublicVenue ?? false,
		publicLocation:
			params.hasPublicVenue && params.publicLocation
				? { ...params.publicLocation, verificationStatus: 'pending' as const }
				: null,
		note: params.note?.trim() ?? '',
		requestedLevel: params.requestedLevel ?? 'legal',
		status: 'pending' as const,
		adminNote: '',
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp(),
		reviewedAt: null,
		reviewedBy: null
	};

	const requestRef = await addDoc(collection(db, 'organizationVerificationRequests'), requestData);

	await updateDoc(doc(db, 'organizations', params.organizationId), {
		verificationStatus: 'pending',
		verificationLevel: 'legal',
		hasPublicVenue: params.hasPublicVenue ?? false,
		publicLocation:
			params.hasPublicVenue && params.publicLocation
				? { ...params.publicLocation, verificationStatus: 'pending' }
				: null,
		updatedAt: serverTimestamp()
	});

	const snap = await getDoc(requestRef);

	return {
		...snap.data(),
		id: snap.id
	} as OrganizationVerificationRequest;
}

export async function approveOrganizationVerification(params: {
	organizationId: string;
	requestId?: string;
	adminUserId: string;
	level?: VerificationLevel;
	adminNote?: string;
}) {
	let verifiedLocation: OrganizationPublicLocation | null | undefined;
	if (params.requestId) {
		const requestSnap = await getDoc(doc(db, 'organizationVerificationRequests', params.requestId));
		const request = requestSnap.data() as OrganizationVerificationRequest | undefined;
		if (request?.hasPublicVenue && request.publicLocation) {
			verifiedLocation = { ...request.publicLocation, verificationStatus: 'verified' };
		}
	}
	await updateDoc(doc(db, 'organizations', params.organizationId), {
		verificationStatus: 'verified',
		verificationLevel: params.level ?? 'legal',
		verificationNote: params.adminNote ?? '',
		verifiedAt: serverTimestamp(),
		verifiedBy: params.adminUserId,
		...(verifiedLocation ? { hasPublicVenue: true, publicLocation: verifiedLocation } : {}),
		updatedAt: serverTimestamp()
	});

	if (params.requestId) {
		await updateDoc(doc(db, 'organizationVerificationRequests', params.requestId), {
			status: 'approved',
			adminNote: params.adminNote ?? '',
			reviewedAt: serverTimestamp(),
			reviewedBy: params.adminUserId,
			updatedAt: serverTimestamp()
		});
	}
}

export async function rejectOrganizationVerification(params: {
	organizationId: string;
	requestId?: string;
	adminUserId: string;
	adminNote?: string;
}) {
	let rejectedLocation: OrganizationPublicLocation | null | undefined;
	if (params.requestId) {
		const requestSnap = await getDoc(doc(db, 'organizationVerificationRequests', params.requestId));
		const request = requestSnap.data() as OrganizationVerificationRequest | undefined;
		if (request?.hasPublicVenue && request.publicLocation) {
			rejectedLocation = { ...request.publicLocation, verificationStatus: 'rejected' };
		}
	}
	await updateDoc(doc(db, 'organizations', params.organizationId), {
		verificationStatus: 'rejected',
		verificationNote: params.adminNote ?? '',
		...(rejectedLocation ? { publicLocation: rejectedLocation } : {}),
		updatedAt: serverTimestamp()
	});

	if (params.requestId) {
		await updateDoc(doc(db, 'organizationVerificationRequests', params.requestId), {
			status: 'rejected',
			adminNote: params.adminNote ?? '',
			reviewedAt: serverTimestamp(),
			reviewedBy: params.adminUserId,
			updatedAt: serverTimestamp()
		});
	}
}

export async function getPendingVerificationRequests() {
	const q = query(
		collection(db, 'organizationVerificationRequests'),
		where('status', '==', 'pending')
	);
	const snap = await getDocs(q);
	const docs = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as OrganizationVerificationRequest);
	return docs.sort((a, b) => {
		const aMs = (a.createdAt as unknown as { toMillis?: () => number })?.toMillis?.() ?? 0;
		const bMs = (b.createdAt as unknown as { toMillis?: () => number })?.toMillis?.() ?? 0;
		return aMs - bMs;
	});
}

export async function isFollowingOrganization(params: { organizationId: string; userId: string }) {
	const followerRef = doc(
		db,
		'organizationFollowers',
		followerIdFor(params.organizationId, params.userId)
	);
	const snap = await getDoc(followerRef);

	return snap.exists();
}

export async function followOrganization(params: { organizationId: string; userId: string }) {
	const followerRef = doc(
		db,
		'organizationFollowers',
		followerIdFor(params.organizationId, params.userId)
	);
	const snap = await getDoc(followerRef);

	if (snap.exists()) return;

	await setDoc(followerRef, {
		id: followerRef.id,
		organizationId: params.organizationId,
		userId: params.userId,
		createdAt: serverTimestamp()
	});

	try {
		await updateDoc(doc(db, 'organizations', params.organizationId), {
			followersCount: increment(1),
			updatedAt: serverTimestamp()
		});
	} catch (err) {
		console.warn('Could not update organization followers count:', err);
	}
}

export async function unfollowOrganization(params: { organizationId: string; userId: string }) {
	const followerRef = doc(
		db,
		'organizationFollowers',
		followerIdFor(params.organizationId, params.userId)
	);
	const snap = await getDoc(followerRef);

	if (!snap.exists()) return;

	await deleteDoc(followerRef);
	try {
		await updateDoc(doc(db, 'organizations', params.organizationId), {
			followersCount: increment(-1),
			updatedAt: serverTimestamp()
		});
	} catch (err) {
		console.warn('Could not update organization followers count:', err);
	}
}

export async function getOrganizationReviews(organizationId: string) {
	const q = query(
		collection(db, 'organizationReviews'),
		where('organizationId', '==', organizationId)
	);
	const snap = await getDocs(q);

	return snap.docs
		.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }) as OrganizationReview)
		.sort((a, b) => {
			const aMs = (a.updatedAt as unknown as { toMillis?: () => number })?.toMillis?.() ?? 0;
			const bMs = (b.updatedAt as unknown as { toMillis?: () => number })?.toMillis?.() ?? 0;
			return bMs - aMs;
		});
}

export async function getUserOrganizationReview(params: { organizationId: string; userId: string }) {
	const reviewRef = doc(
		db,
		'organizationReviews',
		reviewIdFor(params.organizationId, params.userId)
	);
	const snap = await getDoc(reviewRef);
	if (!snap.exists()) return null;
	return { ...snap.data(), id: snap.id } as OrganizationReview;
}

export async function submitOrganizationReview(params: {
	organizationId: string;
	userId: string;
	rating: number;
	comment: string;
	authorName?: string;
	authorPhotoURL?: string | null;
}) {
	const rating = Math.max(1, Math.min(5, Math.round(params.rating)));
	const reviewRef = doc(
		db,
		'organizationReviews',
		reviewIdFor(params.organizationId, params.userId)
	);
	const existing = await getDoc(reviewRef);

	await setDoc(
		reviewRef,
		{
			id: reviewRef.id,
			organizationId: params.organizationId,
			userId: params.userId,
			authorName: params.authorName ?? 'Rally user',
			authorPhotoURL: params.authorPhotoURL ?? null,
			rating,
			comment: params.comment.trim(),
			createdAt: existing.exists()
				? ((existing.data() as OrganizationReview).createdAt ?? serverTimestamp())
				: serverTimestamp(),
			updatedAt: serverTimestamp()
		},
		{ merge: true }
	);
}

export async function replyToOrganizationReview(params: {
	reviewId: string;
	userId: string;
	authorName?: string;
	authorPhotoURL?: string | null;
	authorRole: 'user' | 'organization';
	comment: string;
}) {
	const reply: OrganizationReviewReply = {
		id: `${params.userId}_${Date.now()}`,
		userId: params.userId,
		authorName: params.authorName ?? (params.authorRole === 'organization' ? 'Organization' : 'Rally user'),
		authorPhotoURL: params.authorPhotoURL ?? null,
		authorRole: params.authorRole,
		comment: params.comment.trim(),
		createdAt: Timestamp.now()
	};

	if (!reply.comment) {
		throw new Error('Write a reply before sending.');
	}

	await updateDoc(doc(db, 'organizationReviews', params.reviewId), {
		replies: arrayUnion(reply),
		updatedAt: serverTimestamp()
	});
}
