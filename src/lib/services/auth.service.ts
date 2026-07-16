import { auth } from '$lib/firebase';
import {
	createUserWithEmailAndPassword,
	GoogleAuthProvider,
	sendPasswordResetEmail,
	signInWithEmailAndPassword,
	signInWithPopup,
	signInWithCredential,
	signOut,
	updateProfile
} from 'firebase/auth';
import {
	createUserProfile,
	ensureUserProfile,
	removeUserFcmToken,
	updateUserActiveOrganization
} from '$lib/services/user.service';
import { Capacitor } from '@capacitor/core';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { env } from '$env/dynamic/public';
import { createOrganization } from '$lib/services/organization.service';
import { sendRallySystemMessage } from '$lib/services/chat.service';
import type { OrganizationType } from '$lib/schema';
import { createAppUrl } from '$lib/utils/app-url';

export const authService = {
	async register(email: string, password: string, displayName: string, language?: string) {
		const credential = await createUserWithEmailAndPassword(auth, email, password);

		await updateProfile(credential.user, {
			displayName
		});

		await createUserProfile({
			id: credential.user.uid,
			email: credential.user.email ?? email,
			displayName,
			photoURL: credential.user.photoURL,
			accountType: 'personal',
			language
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
		language?: string;
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
			accountType: 'organization',
			language: params.language
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

		const profile = await ensureUserProfile(credential.user);

		return {
			user: credential.user,
			profile
		};
	},

	async sendPasswordReset(email: string) {
		await sendPasswordResetEmail(auth, email, {
			url: createAppUrl('/login'),
			handleCodeInApp: false
		});
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

			try {
				await GoogleSignIn.signOut();
			} catch {
				// No native Google session to clear.
			}

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
		const user = auth.currentUser;
		if (user) {
			const token = localStorage.getItem('rally_fcm_token');
			if (token) {
				try {
					await removeUserFcmToken(user.uid, token);
				} catch (err) {
					console.error('Error removing FCM token during logout:', err);
				}
				localStorage.removeItem('rally_fcm_token');
			}
		}
		await signOut(auth);
	}
};
