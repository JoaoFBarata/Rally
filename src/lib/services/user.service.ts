import {
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
import type { Sport, SportLevel, UserProfile } from '$lib/schema';

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
}) {
	const userRef = doc(db, 'users', params.id);
	const rallyTag = generateRallyTag(params.displayName, params.email, params.id);

	const profile = {
		id: params.id,
		email: params.email,
		displayName: params.displayName,
		photoURL: params.photoURL ?? null,
		rallyTag,
		bio: '',
		city: '',
		level: 'casual',
		sports: params.sports ?? [],
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	await setDoc(userRef, profile);

	return profile;
}

export async function ensureUserProfile(user: User) {
	const userRef = doc(db, 'users', user.uid);
	const snap = await getDoc(userRef);

	const displayName = user.displayName ?? user.email?.split('@')[0] ?? 'Rally user';
	const email = user.email ?? '';

	if (!snap.exists()) {
		await createUserProfile({
			id: user.uid,
			email,
			displayName,
			photoURL: user.photoURL
		});

		const newSnap = await getDoc(userRef);

		return {
			...newSnap.data(),
			id: newSnap.id
		} as UserProfile;
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
		data.level === undefined ||
		data.sports === undefined ||
		data.photoURL === undefined ||
		(!data.photoURL && user.photoURL);

	if (needsUpdate) {
		const rallyTag =
			data.rallyTag ?? generateRallyTag(data.displayName ?? displayName, data.email ?? email, user.uid);

		const normalizedProfile = {
			rallyTag,
			bio: data.bio ?? '',
			city: data.city ?? '',
			level: data.level ?? 'casual',
			sports: data.sports ?? [],
			photoURL: nextPhotoURL,
			updatedAt: serverTimestamp()
		};

		await updateDoc(userRef, normalizedProfile);

		return {
			...data,
			...normalizedProfile
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
	const userRef = doc(db, 'users', userId);

	await updateDoc(userRef, {
		sports,
		updatedAt: serverTimestamp()
	});
}

export async function getUserProfilesByIds(userIds: string[]) {
	const uniqueIds = [...new Set(userIds)].filter(Boolean);

	const profiles = await Promise.all(
		uniqueIds.map((userId) => getUserProfile(userId))
	);

	return profiles.filter((profile): profile is UserProfile => profile !== null);
}

export async function updateUserProfileDetails(
	userId: string,
	params: {
		displayName: string;
		bio: string;
		city: string;
		level: SportLevel;
		sports: Sport[];
	}
) {
	const userRef = doc(db, 'users', userId);

	await updateDoc(userRef, {
		displayName: params.displayName,
		bio: params.bio,
		city: params.city,
		level: params.level,
		sports: params.sports,
		updatedAt: serverTimestamp()
	});
}