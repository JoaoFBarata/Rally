import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { UserProfile, Sport } from '$lib/schema';

export async function createUserProfile(params: {
	id: string;
	email: string;
	displayName: string;
	photoURL?: string | null;
	sports?: Sport[];
}) {
	const userRef = doc(db, 'users', params.id);

	const profile = {
		id: params.id,
		email: params.email,
		displayName: params.displayName,
		photoURL: params.photoURL ?? null,
		sports: params.sports ?? [],
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	await setDoc(userRef, profile);

	return profile;
}

export async function getUserProfile(userId: string) {
	const userRef = doc(db, 'users', userId);
	const snap = await getDoc(userRef);

	if (!snap.exists()) return null;

	return snap.data() as UserProfile;
}

export async function updateUserSports(userId: string, sports: Sport[]) {
	const userRef = doc(db, 'users', userId);

	await updateDoc(userRef, {
		sports,
		updatedAt: serverTimestamp()
	});
}