import { httpsCallable } from 'firebase/functions';
import { functions } from '$lib/firebase';

export async function createEventPaymentCheckout(params: { eventId: string }) {
	console.log('[event-payment.service] Calling createEventPaymentCheckout callable with params:', params);
	const callable = httpsCallable<{ eventId: string }, { checkoutUrl: string }>(
		functions,
		'createEventPaymentCheckout'
	);

	try {
		const result = await callable(params);
		console.log('[event-payment.service] createEventPaymentCheckout succeeded:', result.data);
		return result.data;
	} catch (err) {
		console.error('[event-payment.service] createEventPaymentCheckout failed:', err);
		throw err;
	}
}

export async function confirmEventPayment(params: { eventId: string; sessionId: string }) {
	console.log('[event-payment.service] Calling confirmEventPayment callable with params:', params);
	const callable = httpsCallable<{ eventId: string; sessionId: string }, { status: 'paid' }>(
		functions,
		'confirmEventPayment'
	);

	try {
		const result = await callable(params);
		console.log('[event-payment.service] confirmEventPayment succeeded:', result.data);
		return result.data;
	} catch (err) {
		console.error('[event-payment.service] confirmEventPayment failed:', err);
		throw err;
	}
}
