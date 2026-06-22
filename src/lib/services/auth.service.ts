import { auth } from '$lib/firebase';
import {
	createUserWithEmailAndPassword,
	GoogleAuthProvider,
	signInWithEmailAndPassword,
	signInWithPopup,
	signInWithCredential,
	signOut,
	updateProfile
} from 'firebase/auth';
import {
	createUserProfile,
	ensureUserProfile,
	updateUserActiveOrganization
} from '$lib/services/user.service';
import { Capacitor } from '@capacitor/core';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { env } from '$env/dynamic/public';
import { createOrganization } from '$lib/services/organization.service';
import { sendRallySystemMessage } from '$lib/services/chat.service';
import type { OrganizationType } from '$lib/schema';

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
			photoURL: credential.user.photoURL,
			accountType: 'personal'
		});

		await sendRallySystemMessage(
			credential.user.uid,
			'Welcome to Rally! You will receive event updates and more through this chat.'
		);

		return credential.user;
	},

	async registerOrganization(params: {
		email: string;
		password: string;
		organizationName: string;
		organizationType: OrganizationType;
		description?: string;
		contactEmail?: string;
		phone?: string;
		website?: string;
		address?: string;
		city?: string;
		nif?: string;
	}) {
		const credential = await createUserWithEmailAndPassword(auth, params.email, params.password);

		await updateProfile(credential.user, {
			displayName: params.organizationName
		});

		await createUserProfile({
			id: credential.user.uid,
			email: credential.user.email ?? params.email,
			displayName: params.organizationName,
			photoURL: credential.user.photoURL,
			accountType: 'organization'
		});

		const organization = await createOrganization({
			name: params.organizationName,
			type: params.organizationType,
			description: params.description ?? '',
			ownerId: credential.user.uid,
			contactEmail: params.contactEmail ?? params.email,
			phone: params.phone,
			website: params.website,
			address: params.address,
			city: params.city,
			nif: params.nif,
			logoURL: credential.user.photoURL
		});

		await updateUserActiveOrganization({
			userId: credential.user.uid,
			organizationId: organization.id,
			accountType: 'organization'
		});

		await sendRallySystemMessage(
			credential.user.uid,
			'Welcome to Rally! You will receive organization updates and event activity through this chat.'
		);

		return {
			user: credential.user,
			organization
		};
	},

	async login(email: string, password: string) {
		const credential = await signInWithEmailAndPassword(auth, email, password);

		await ensureUserProfile(credential.user);

		return credential.user;
	},

	async signInWithGoogle() {
		if (Capacitor.isNativePlatform()) {
			const clientId = env.PUBLIC_GOOGLE_CLIENT_ID;
			if (!clientId) {
				throw new Error('Google Sign-In is not configured for the native app.');
			}

			await GoogleSignIn.initialize({
				clientId
			});

			const result = await GoogleSignIn.signIn();
			if (!result.idToken) {
				throw new Error('No idToken returned from Google Sign-In');
			}

			const credential = GoogleAuthProvider.credential(result.idToken);
			const userCredential = await signInWithCredential(auth, credential);

			await ensureUserProfile(userCredential.user);
			return userCredential.user;
		} else {
			const provider = new GoogleAuthProvider();

			provider.setCustomParameters({
				prompt: 'select_account'
			});

			const result = await signInWithPopup(auth, provider);

			await ensureUserProfile(result.user);

			return result.user;
		}
	},

	async logout() {
		await signOut(auth);
	}
};
