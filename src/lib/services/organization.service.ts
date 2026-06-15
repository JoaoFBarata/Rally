import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	increment,
	query,
	serverTimestamp,
	setDoc,
	updateDoc,
	where
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type {
	Organization,
	OrganizationType,
	OrganizationVerificationRequest,
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
}) {
	const organization = await assertCanManageOrganization({
		organizationId: params.organizationId,
		userId: params.userId
	});

	if (organization.verificationStatus === 'verified') {
		throw new Error('This organization is already verified.');
	}

	const requestData = {
		organizationId: params.organizationId,
		submittedBy: params.userId,
		legalName: params.legalName.trim(),
		nif: params.nif?.trim() ?? organization.nif ?? '',
		website: params.website?.trim() ?? organization.website ?? '',
		address: params.address?.trim() ?? organization.address ?? '',
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
		verificationLevel: params.requestedLevel ?? 'legal',
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
	await updateDoc(doc(db, 'organizations', params.organizationId), {
		verificationStatus: 'verified',
		verificationLevel: params.level ?? 'legal',
		verificationNote: params.adminNote ?? '',
		verifiedAt: serverTimestamp(),
		verifiedBy: params.adminUserId,
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
	await updateDoc(doc(db, 'organizations', params.organizationId), {
		verificationStatus: 'rejected',
		verificationNote: params.adminNote ?? '',
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

export async function isFollowingOrganization(params: {
	organizationId: string;
	userId: string;
}) {
	const followerRef = doc(
		db,
		'organizationFollowers',
		followerIdFor(params.organizationId, params.userId)
	);
	const snap = await getDoc(followerRef);

	return snap.exists();
}

export async function followOrganization(params: {
	organizationId: string;
	userId: string;
}) {
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

	await updateDoc(doc(db, 'organizations', params.organizationId), {
		followersCount: increment(1),
		updatedAt: serverTimestamp()
	});
}

export async function unfollowOrganization(params: {
	organizationId: string;
	userId: string;
}) {
	const followerRef = doc(
		db,
		'organizationFollowers',
		followerIdFor(params.organizationId, params.userId)
	);
	const snap = await getDoc(followerRef);

	if (!snap.exists()) return;

	await deleteDoc(followerRef);
	await updateDoc(doc(db, 'organizations', params.organizationId), {
		followersCount: increment(-1),
		updatedAt: serverTimestamp()
	});
}
