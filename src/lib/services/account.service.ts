import { httpsCallable } from 'firebase/functions';
import { functions } from '$lib/firebase';

export async function deleteCurrentAccount() {
	const callable = httpsCallable<Record<string, never>, { deleted: boolean }>(
		functions,
		'deleteMyAccount'
	);
	const result = await callable({});
	return result.data.deleted;
}
