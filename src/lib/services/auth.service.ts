import { auth } from '$lib/firebase';
import {
	createUserWithEmailAndPassword,
	GoogleAuthProvider,
	signInWithEmailAndPassword,
	signInWithPopup,
	signOut,
	updateProfile
} from 'firebase/auth';
import {
	createUserProfile,
	ensureUserProfile,
	updateUserActiveOrganization
} from '$lib/services/user.service';
import { createOrganization } from '$lib/services/organization.service';
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
		const provider = new GoogleAuthProvider();

		provider.setCustomParameters({
			prompt: 'select_account'
		});

		const result = await signInWithPopup(auth, provider);

		await ensureUserProfile(result.user);

		return result.user;
	},

	async logout() {
		await signOut(auth);
	}
};
