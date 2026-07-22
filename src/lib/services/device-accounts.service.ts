import { browser } from '$app/environment';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { UserProfile } from '$lib/schema';
import { getOrganizationLogo } from '$lib/services/organization.service';

const DEVICE_ACCOUNTS_KEY = 'rally:device-accounts:v1';

export type DeviceAccount = {
	id: string;
	email: string;
	displayName: string;
	photoURL?: string | null;
	organizationLogoURL?: string | null;
	rallyTag?: string;
	accountType?: UserProfile['accountType'];
	activeOrganizationId?: string | null;
	lastUsedAt: number;
	providerIds?: string[];
};

function readRawAccounts(): DeviceAccount[] {
	if (!browser) return [];

	try {
		const raw = localStorage.getItem(DEVICE_ACCOUNTS_KEY);
		if (!raw) return [];

		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];

		return parsed.filter((account): account is DeviceAccount => {
			return Boolean(account?.id && account?.email && account?.displayName);
		});
	} catch (err) {
		console.warn('Could not read Rally device accounts:', err);
		return [];
	}
}

function writeRawAccounts(accounts: DeviceAccount[]) {
	if (!browser) return;
	localStorage.setItem(DEVICE_ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function getDeviceAccounts() {
	return readRawAccounts().sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export function getDeviceAccountPhotoURL(account: DeviceAccount) {
	if (account.accountType === 'organization') {
		return getOrganizationLogo(account.organizationLogoURL ?? account.photoURL);
	}

	return account.photoURL ?? null;
}

/** Refreshes the local switcher cache so avatars and organization logos do not go stale. */
export async function refreshDeviceAccounts() {
	if (!browser) return [];

	const accounts = readRawAccounts();
	const refreshedAccounts = await Promise.all(
		accounts.map(async (account): Promise<DeviceAccount> => {
			try {
				const profileSnapshot = await getDoc(doc(db, 'users', account.id));
				if (!profileSnapshot.exists()) return account;

				const freshProfile = profileSnapshot.data() as UserProfile;
				const accountType = freshProfile.accountType ?? account.accountType;
				const activeOrganizationId =
					freshProfile.activeOrganizationId ?? account.activeOrganizationId ?? null;
				let organizationLogoURL = account.organizationLogoURL ?? null;

				if (accountType === 'organization') {
					organizationLogoURL = getOrganizationLogo(organizationLogoURL);
					if (activeOrganizationId) {
						const organizationSnapshot = await getDoc(
							doc(db, 'organizations', activeOrganizationId)
						);
						if (organizationSnapshot.exists()) {
							const organization = organizationSnapshot.data() as {
								name?: string;
								handle?: string;
								logoURL?: string | null;
							};
							organizationLogoURL = getOrganizationLogo(organization.logoURL);
							return {
								...account,
								email: freshProfile.email ?? account.email,
								displayName: organization.name ?? freshProfile.displayName ?? account.displayName,
								photoURL: freshProfile.photoURL ?? account.photoURL ?? null,
								organizationLogoURL,
								rallyTag: organization.handle ?? freshProfile.rallyTag ?? account.rallyTag,
								accountType,
								activeOrganizationId
							};
						}
					}
				}

				return {
					...account,
					email: freshProfile.email ?? account.email,
					displayName: freshProfile.displayName ?? account.displayName,
					photoURL: freshProfile.photoURL ?? account.photoURL ?? null,
					organizationLogoURL,
					rallyTag: freshProfile.rallyTag ?? account.rallyTag,
					accountType,
					activeOrganizationId
				};
			} catch (err) {
				console.warn(`Could not refresh device account ${account.id}:`, err);
				return account;
			}
		})
	);

	writeRawAccounts(refreshedAccounts);
	return refreshedAccounts.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export function rememberDeviceAccount(profile: UserProfile, user?: User | null) {
	if (!browser) return [];

	const previousAccount = readRawAccounts().find((item) => item.id === profile.id);
	const providerIds =
		user?.providerData.map((provider) => provider.providerId).filter(Boolean) ??
		previousAccount?.providerIds ??
		[];

	const account: DeviceAccount = {
		id: profile.id,
		email: profile.email,
		displayName: profile.displayName,
		photoURL: profile.photoURL ?? null,
		organizationLogoURL:
			profile.accountType === 'organization'
				? getOrganizationLogo(profile.photoURL ?? previousAccount?.organizationLogoURL)
				: null,
		rallyTag: profile.rallyTag,
		accountType: profile.accountType,
		activeOrganizationId: profile.activeOrganizationId ?? null,
		lastUsedAt: Date.now(),
		providerIds: Array.from(new Set(providerIds))
	};

	const accounts = readRawAccounts().filter((item) => item.id !== account.id);
	const nextAccounts = [account, ...accounts].slice(0, 8);
	writeRawAccounts(nextAccounts);
	return nextAccounts;
}

export function canFastSwitchDeviceAccount(account: DeviceAccount) {
	return account.providerIds?.includes('google.com') ?? false;
}

export function removeDeviceAccount(accountId: string) {
	const nextAccounts = readRawAccounts().filter((account) => account.id !== accountId);
	writeRawAccounts(nextAccounts);
	return nextAccounts;
}
