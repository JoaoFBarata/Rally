import { auth } from '$lib/firebase';
import {
	createUserWithEmailAndPassword,
	deleteUser,
	GoogleAuthProvider,
	sendEmailVerification,
	sendPasswordResetEmail,
	signInWithEmailAndPassword,
	signInWithPopup,
	signInWithCredential,
	signOut,
	updateProfile,
	type User
} from 'firebase/auth';
import {
	createUserProfile,
	ensureUserProfile,
	removeUserFcmToken,
	updateUserActiveOrganization,
	updateUserTwoFactorSettings
} from '$lib/services/user.service';
import { Capacitor } from '@capacitor/core';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { env } from '$env/dynamic/public';
import { createOrganization } from '$lib/services/organization.service';
import { sendRallySystemMessage } from '$lib/services/chat.service';
import type { OrganizationType, UserProfile } from '$lib/schema';
import { createAppUrl } from '$lib/utils/app-url';

function isPasswordUser(user = auth.currentUser) {
	return Boolean(user?.providerData.some((provider) => provider.providerId === 'password'));
}

async function sendAccountVerificationEmail() {
	const user = auth.currentUser;
	if (!user || !isPasswordUser(user) || user.emailVerified) return;

	await sendEmailVerification(user, {
		url: createAppUrl('/verify-email'),
		handleCodeInApp: false
	});
}

async function sendInitialVerificationEmail() {
	try {
		await sendAccountVerificationEmail();
		sessionStorage.removeItem('rally:verification-email-send-failed');
	} catch (err) {
		sessionStorage.setItem('rally:verification-email-send-failed', '1');
		console.error('Verification email send error:', err);
	}
}

async function disableTwoFactorForGoogleOnlyAccount(user: User, profile: UserProfile) {
	const hasPasswordProvider = user.providerData.some(
		(provider) => provider.providerId === 'password'
	);
	if (hasPasswordProvider || !profile.twoFactorEnabled) return profile;

	await updateUserTwoFactorSettings(user.uid, {
		enabled: false,
		methods: [],
		preferredMethod: 'email'
	});

	return {
		...profile,
		twoFactorEnabled: false,
		twoFactorMethods: [],
		twoFactorPreferredMethod: 'email' as const
	};
}

async function removeCurrentFcmToken() {
	const user = auth.currentUser;
	if (!user) return;

	const token = localStorage.getItem('rally_fcm_token');
	if (!token) return;

	try {
		await removeUserFcmToken(user.uid, token);
	} catch (err) {
		console.error('Error removing FCM token during account change:', err);
	} finally {
		localStorage.removeItem('rally_fcm_token');
		localStorage.removeItem('rally_fcm_token_user_id');
	}
}

export const authService = {
	async register(email: string, password: string, displayName: string, language?: string) {
		const credential = await createUserWithEmailAndPassword(auth, email, password);

		try {
			await updateProfile(credential.user, {
				displayName
			});

			await createUserProfile({
				id: credential.user.uid,
				email: credential.user.email ?? email,
				displayName,
				photoURL: credential.user.photoURL,
				accountType: 'personal',
				language,
				requiresEmailVerification: true
			});
		} catch (err) {
			// Roll back the Auth account so a retry doesn't hit
			// auth/email-already-in-use on an unusable half-created account.
			await deleteUser(credential.user).catch((cleanupErr) =>
				console.error('Failed to roll back partially created account:', cleanupErr)
			);
			throw err;
		}

		void sendRallySystemMessage(
			credential.user.uid,
			'Welcome to Rally! You will receive event updates and more through this chat.'
		).catch((err) => console.error('Welcome message error:', err));

		await sendInitialVerificationEmail();

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

		let organization;
		try {
			await updateProfile(credential.user, {
				displayName: params.organizationName
			});

			await createUserProfile({
				id: credential.user.uid,
				email: credential.user.email ?? params.email,
				displayName: params.organizationName,
				photoURL: credential.user.photoURL,
				accountType: 'organization',
				language: params.language,
				requiresEmailVerification: true
			});

			organization = await createOrganization({
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
				logoURL: '/default-org-logo.png'
			});

			await updateUserActiveOrganization({
				userId: credential.user.uid,
				organizationId: organization.id,
				accountType: 'organization'
			});
		} catch (err) {
			// Roll back the Auth account so a retry doesn't hit
			// auth/email-already-in-use on an unusable half-created account.
			await deleteUser(credential.user).catch((cleanupErr) =>
				console.error('Failed to roll back partially created account:', cleanupErr)
			);
			throw err;
		}

		void sendRallySystemMessage(
			credential.user.uid,
			'Welcome to Rally! You will receive organization updates and event activity through this chat.'
		).catch((err) => console.error('Welcome message error:', err));

		await sendInitialVerificationEmail();

		return {
			user: credential.user,
			organization
		};
	},

	async login(email: string, password: string) {
		const credential = await signInWithEmailAndPassword(auth, email, password);
		const profile = await ensureUserProfile(credential.user);

		if (
			profile.requiresEmailVerification &&
			isPasswordUser(credential.user) &&
			!credential.user.emailVerified
		) {
			throw new Error('auth/email-not-verified');
		}

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

	async sendVerificationEmail() {
		await sendAccountVerificationEmail();
		sessionStorage.removeItem('rally:verification-email-send-failed');
	},

	async signInWithGoogle() {
		await removeCurrentFcmToken();

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

			const profile = await disableTwoFactorForGoogleOnlyAccount(
				userCredential.user,
				await ensureUserProfile(userCredential.user)
			);
			return { user: userCredential.user, profile };
		} else {
			const provider = new GoogleAuthProvider();

			provider.setCustomParameters({
				prompt: 'select_account'
			});

			const result = await signInWithPopup(auth, provider);

			const profile = await disableTwoFactorForGoogleOnlyAccount(
				result.user,
				await ensureUserProfile(result.user)
			);

			return { user: result.user, profile };
		}
	},

	async logout() {
		await removeCurrentFcmToken();
		await signOut(auth);
	}
};
