import { httpsCallable } from 'firebase/functions';
import { functions } from '$lib/firebase';

export async function createEventPaymentCheckout(params: {
	eventId: string;
	isJoinPayment?: boolean;
	teamName?: string;
}) {
	console.log('[event-payment.service] Calling createEventPaymentCheckout callable with params:', params);
	const callable = httpsCallable<
		{ eventId: string; isJoinPayment?: boolean; teamName?: string },
		{ checkoutUrl: string }
	>(functions, 'createEventPaymentCheckout');

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

export async function createEventPromotionCheckout(params: {
	eventId: string;
	budget: number;
	durationDays: number;
	plan: string;
	targetCity?: string;
	targetCountry?: string;
	targetSport?: string | null;
}) {
	console.log('[event-payment.service] Calling createEventPromotionCheckout callable with params:', params);
	const callable = httpsCallable<
		{
			eventId: string;
			budget: number;
			durationDays: number;
			plan: string;
			targetCity?: string;
			targetCountry?: string;
			targetSport?: string | null;
		},
		{ checkoutUrl: string }
	>(functions, 'createEventPromotionCheckout');

	try {
		const result = await callable(params);
		console.log('[event-payment.service] createEventPromotionCheckout succeeded:', result.data);
		return result.data;
	} catch (err) {
		console.error('[event-payment.service] createEventPromotionCheckout failed:', err);
		throw err;
	}
}

export async function confirmEventPromotionPayment(params: { eventId: string; sessionId: string }) {
	console.log('[event-payment.service] Calling confirmEventPromotionPayment callable with params:', params);
	const callable = httpsCallable<{ eventId: string; sessionId: string }, { status: 'active' }>(
		functions,
		'confirmEventPromotionPayment'
	);

	try {
		const result = await callable(params);
		console.log('[event-payment.service] confirmEventPromotionPayment succeeded:', result.data);
		return result.data;
	} catch (err) {
		console.error('[event-payment.service] confirmEventPromotionPayment failed:', err);
		throw err;
	}
}

export async function createBatchEventPaymentCheckout(params: { eventIds: string[] }) {
	console.log('[event-payment.service] Calling createBatchEventPaymentCheckout with params:', params);
	const callable = httpsCallable<{ eventIds: string[] }, { checkoutUrl: string }>(
		functions,
		'createBatchEventPaymentCheckout'
	);

	try {
		const result = await callable(params);
		console.log('[event-payment.service] createBatchEventPaymentCheckout succeeded:', result.data);
		return result.data;
	} catch (err) {
		console.error('[event-payment.service] createBatchEventPaymentCheckout failed:', err);
		throw err;
	}
}

export async function confirmBatchEventPayment(params: { sessionId: string }) {
	console.log('[event-payment.service] Calling confirmBatchEventPayment with params:', params);
	const callable = httpsCallable<{ sessionId: string }, { status: 'paid'; count: number }>(
		functions,
		'confirmBatchEventPayment'
	);

	try {
		const result = await callable(params);
		console.log('[event-payment.service] confirmBatchEventPayment succeeded:', result.data);
		return result.data;
	} catch (err) {
		console.error('[event-payment.service] confirmBatchEventPayment failed:', err);
		throw err;
	}
}

export async function sendPaymentReminders(params: { eventId: string }) {
	console.log('[event-payment.service] Calling sendPaymentReminders with params:', params);
	const callable = httpsCallable<{ eventId: string }, { count: number }>(
		functions,
		'sendPaymentReminders'
	);

	try {
		const result = await callable(params);
		console.log('[event-payment.service] sendPaymentReminders succeeded:', result.data);
		return result.data;
	} catch (err) {
		console.error('[event-payment.service] sendPaymentReminders failed:', err);
		throw err;
	}
}
