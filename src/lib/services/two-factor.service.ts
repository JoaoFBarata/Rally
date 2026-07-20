import { auth } from '$lib/firebase';
import {
	isSignInWithEmailLink,
	sendSignInLinkToEmail,
	signInWithEmailLink,
	signOut
} from 'firebase/auth';
import { createAppUrl } from '$lib/utils/app-url';
import { ensureUserProfile } from '$lib/services/user.service';
import type { TwoFactorMethod, UserProfile } from '$lib/schema';

const PENDING_2FA_KEY = 'rally:pending-two-factor';
const CHALLENGE_MAX_AGE_MS = 15 * 60 * 1000;

export interface PendingTwoFactorChallenge {
	email: string;
	method: TwoFactorMethod;
	returnTo: string;
	createdAt: number;
}

function isBrowser() {
	return typeof window !== 'undefined';
}

export function getEnabledTwoFactorMethods(profile: UserProfile | null | undefined) {
	if (!profile?.twoFactorEnabled) return [];

	return (profile.twoFactorMethods ?? []).filter((method) => method === 'email');
}

export function shouldRequireTwoFactor(profile: UserProfile | null | undefined) {
	return getEnabledTwoFactorMethods(profile).length > 0;
}

export function getPendingTwoFactorChallenge() {
	if (!isBrowser()) return null;

	const raw = localStorage.getItem(PENDING_2FA_KEY);
	if (!raw) return null;

	try {
		const pending = JSON.parse(raw) as PendingTwoFactorChallenge;

		if (!pending.email || Date.now() - pending.createdAt > CHALLENGE_MAX_AGE_MS) {
			localStorage.removeItem(PENDING_2FA_KEY);
			return null;
		}

		return pending;
	} catch {
		localStorage.removeItem(PENDING_2FA_KEY);
		return null;
	}
}

export function clearPendingTwoFactorChallenge() {
	if (isBrowser()) {
		localStorage.removeItem(PENDING_2FA_KEY);
	}
}

export async function startEmailTwoFactorChallenge(params: {
	email: string;
	returnTo?: string | null;
}) {
	if (!isBrowser()) return;

	const email = params.email.trim();
	const returnTo = params.returnTo?.startsWith('/') ? params.returnTo : '/dashboard';
	const verifyPath = `/verify-2fa?returnTo=${encodeURIComponent(returnTo)}`;

	try {
		await sendSignInLinkToEmail(auth, email, {
			url: createAppUrl(verifyPath),
			handleCodeInApp: true
		});

		const pending: PendingTwoFactorChallenge = {
			email,
			returnTo,
			method: 'email',
			createdAt: Date.now()
		};

		localStorage.setItem(PENDING_2FA_KEY, JSON.stringify(pending));
	} finally {
		// Always sign out of the freshly-created session, whether or not the
		// verification email was sent — an authenticated session must never
		// survive a failed 2FA challenge.
		await signOut(auth);
	}
}

export function currentUrlIsEmailTwoFactorLink() {
	return isBrowser() && isSignInWithEmailLink(auth, window.location.href);
}

export async function completeEmailTwoFactorChallenge() {
	if (!isBrowser()) {
		throw new Error('Two-factor verification can only be completed in the browser.');
	}

	const pending = getPendingTwoFactorChallenge();
	if (!pending) {
		throw new Error('This verification link expired. Log in again to receive a new one.');
	}

	if (!isSignInWithEmailLink(auth, window.location.href)) {
		throw new Error('This is not a valid verification link.');
	}

	const credential = await signInWithEmailLink(auth, pending.email, window.location.href);
	await ensureUserProfile(credential.user);
	clearPendingTwoFactorChallenge();

	return {
		user: credential.user,
		returnTo: pending.returnTo
	};
}
