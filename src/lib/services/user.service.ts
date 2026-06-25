import {
	arrayRemove,
	arrayUnion,
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	serverTimestamp,
	setDoc,
	updateDoc,
	where
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '$lib/firebase';
import type { AccountType, Sport, UserProfile } from '$lib/schema';

function slugify(value: string) {
	return value
		.toLowerCase()
		.trim()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function generateRallyTag(displayName: string, email: string, uid: string) {
	const base = slugify(displayName || email.split('@')[0] || 'rally-user');
	const suffix = uid.slice(0, 5).toLowerCase();

	return `${base}-${suffix}`;
}

export async function createUserProfile(params: {
	id: string;
	email: string;
	displayName: string;
	photoURL?: string | null;
	sports?: Sport[];
	accountType?: AccountType;
	activeOrganizationId?: string | null;
}) {
	const userRef = doc(db, 'users', params.id);
	const rallyTag = generateRallyTag(params.displayName, params.email, params.id);

	const profile = {
		id: params.id,
		email: params.email,
		displayName: params.displayName,
		photoURL: params.photoURL ?? null,
		profilePhotoPath: null,
		accountType: params.accountType ?? 'personal',
		activeOrganizationId: params.activeOrganizationId ?? null,
		rallyTag,
		bio: '',
		city: '',
		country: 'PT',
		age: null,
		sports: params.sports ?? [],
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	await setDoc(userRef, profile);

	const snap = await getDoc(userRef);

	return {
		...snap.data(),
		id: snap.id
	} as UserProfile;
}

export async function ensureUserProfile(user: User) {
	const userRef = doc(db, 'users', user.uid);
	const snap = await getDoc(userRef);

	const displayName = user.displayName ?? user.email?.split('@')[0] ?? 'Rally user';
	const email = user.email ?? '';

	if (!snap.exists()) {
		return createUserProfile({
			id: user.uid,
			email,
			displayName,
			photoURL: user.photoURL,
			accountType: 'personal'
		});
	}

	const data = {
		...snap.data(),
		id: snap.id
	} as UserProfile;

	const nextPhotoURL = data.photoURL ?? user.photoURL ?? null;

	const needsUpdate =
		!data.rallyTag ||
		data.bio === undefined ||
		data.city === undefined ||
		data.country === undefined ||
		data.age === undefined ||
		data.sports === undefined ||
		data.photoURL === undefined ||
		data.profilePhotoPath === undefined ||
		data.accountType === undefined ||
		data.activeOrganizationId === undefined ||
		(!data.photoURL && user.photoURL);

	if (needsUpdate) {
		const rallyTag =
			data.rallyTag ??
			generateRallyTag(data.displayName ?? displayName, data.email ?? email, user.uid);

		await updateDoc(userRef, {
			rallyTag,
			bio: data.bio ?? '',
			city: data.city ?? '',
			country: data.country ?? 'PT',
			age: data.age ?? null,
			sports: data.sports ?? [],
			photoURL: nextPhotoURL,
			profilePhotoPath: data.profilePhotoPath ?? null,
			accountType: data.accountType ?? 'personal',
			activeOrganizationId: data.activeOrganizationId ?? null,
			updatedAt: serverTimestamp()
		});

		const updatedSnap = await getDoc(userRef);

		return {
			...updatedSnap.data(),
			id: updatedSnap.id
		} as UserProfile;
	}

	return data;
}

export async function getUserProfile(userId: string) {
	const userRef = doc(db, 'users', userId);
	const snap = await getDoc(userRef);

	if (!snap.exists()) return null;

	return {
		...snap.data(),
		id: snap.id
	} as UserProfile;
}

export async function getUserProfilesByIds(userIds: string[]) {
	const uniqueIds = [...new Set(userIds)].filter(Boolean);
	const profiles = await Promise.all(uniqueIds.map((userId) => getUserProfile(userId)));

	return profiles.filter((profile): profile is UserProfile => profile !== null);
}

export async function searchUsersByRallyTag(rallyTag: string) {
	const cleanTag = rallyTag.trim().toLowerCase();
	const q = query(collection(db, 'users'), where('rallyTag', '==', cleanTag));
	const snap = await getDocs(q);

	return snap.docs.map((docSnap) => ({
		...docSnap.data(),
		id: docSnap.id
	})) as UserProfile[];
}

export async function updateUserSports(userId: string, sports: Sport[]) {
	await updateDoc(doc(db, 'users', userId), {
		sports,
		updatedAt: serverTimestamp()
	});
}

export async function updateUserProfileDetails(
	userId: string,
	params: {
		displayName: string;
		bio: string;
		city: string;
		country: string;
		age: number | null;
		sports: Sport[];
	}
) {
	await updateDoc(doc(db, 'users', userId), {
		displayName: params.displayName,
		bio: params.bio,
		city: params.city,
		country: params.country,
		age: params.age,
		sports: params.sports,
		updatedAt: serverTimestamp()
	});
}

export async function updateUserProfilePhoto(params: {
	userId: string;
	photoURL: string;
	profilePhotoPath: string | null;
}) {
	await updateDoc(doc(db, 'users', params.userId), {
		photoURL: params.photoURL,
		profilePhotoPath: params.profilePhotoPath,
		updatedAt: serverTimestamp()
	});
}

export async function updateUserActiveOrganization(params: {
	userId: string;
	organizationId: string | null;
	accountType?: AccountType;
}) {
	await updateDoc(doc(db, 'users', params.userId), {
		activeOrganizationId: params.organizationId,
		accountType: params.accountType ?? (params.organizationId ? 'organization' : 'personal'),
		updatedAt: serverTimestamp()
	});
}

export async function saveUserFcmToken(userId: string, token: string) {
	await setDoc(
		doc(db, 'users', userId),
		{
			fcmTokens: arrayUnion(token),
			updatedAt: serverTimestamp()
		},
		{ merge: true }
	);
}

export async function removeUserFcmToken(userId: string, token: string) {
	await updateDoc(doc(db, 'users', userId), {
		fcmTokens: arrayRemove(token),
		updatedAt: serverTimestamp()
	});
}
