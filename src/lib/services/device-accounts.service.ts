import { browser } from '$app/environment';
import type { User } from 'firebase/auth';
import type { UserProfile } from '$lib/schema';

const DEVICE_ACCOUNTS_KEY = 'rally:device-accounts:v1';

export type DeviceAccount = {
	id: string;
	email: string;
	displayName: string;
	photoURL?: string | null;
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
