import { httpsCallable } from 'firebase/functions';
import { functions } from '$lib/firebase';

export async function createEventPaymentCheckout(params: { eventId: string }) {
	const callable = httpsCallable<{ eventId: string }, { checkoutUrl: string }>(
		functions,
		'createEventPaymentCheckout'
	);

	const result = await callable(params);
	return result.data;
}

export async function confirmEventPayment(params: { eventId: string; sessionId: string }) {
	const callable = httpsCallable<{ eventId: string; sessionId: string }, { status: 'paid' }>(
		functions,
		'confirmEventPayment'
	);

	const result = await callable(params);
	return result.data;
}
