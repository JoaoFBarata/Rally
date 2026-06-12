import { auth } from '$lib/firebase';
import {
	createUserWithEmailAndPassword,
	signInWithEmailAndPassword,
	signOut,
	updateProfile
} from 'firebase/auth';
import { createUserProfile } from '$lib/services/user.service';

export const authService = {
	async register(email: string, password: string, displayName: string) {
		const credential = await createUserWithEmailAndPassword(auth, email, password);

		await updateProfile(credential.user, {
			displayName
		});

		await createUserProfile({
			id: credential.user.uid,
			email: credential.user.email ?? email,
			displayName,
			photoURL: credential.user.photoURL
		});

		return credential;
	},

	login: (email: string, password: string) => {
		return signInWithEmailAndPassword(auth, email, password);
	},

	logout: () => {
		return signOut(auth);
	}
};