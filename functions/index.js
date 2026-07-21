const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getMessaging } = require('firebase-admin/messaging');
const { GoogleGenAI, Type } = require('@google/genai');
const Stripe = require('stripe');

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

const openaiApiKey = defineSecret('OPENAI_API_KEY');
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const stripeApiKey = defineSecret('STRIPE_API_KEY');

const PUSH_TEXT = {
	en: {
		someone: 'Someone',
		friend: 'A friend',
		rallyTitle: 'Rally',
		eventFallback: 'an event',
		attachment: 'Sent an attachment.',
		newMessageFrom: (name) => `New message from ${name}`,
		friendRequestTitle: 'Friend request',
		friendRequestBody: (name) => `${name} sent you a friend request.`,
		friendAcceptedTitle: 'Friend request accepted',
		friendAcceptedBody: (name) => `${name} accepted your friend request.`,
		qrFriendTitle: 'You are now friends',
		qrFriendBody: (name) => `You and ${name} are now friends on Rally.`,
		eventInviteTitle: 'Event invite',
		eventInviteBody: (name, title) => `${name} invited you to "${title}".`,
		eventStartingSoonTitle: 'Event starting soon',
		eventStartingSoonBody: (title) => `"${title}" starts in about 1 hour.`,
		eventStartedTitle: 'Event started',
		eventStartedBody: (title) => `"${title}" is now underway.`,
		eventFinishedTitle: 'Event finished',
		eventFinishedBody: (title) => `"${title}" has finished.`,
		eventCancelledTitle: 'Event cancelled',
		eventCancelledBody: (title) => `"${title}" was cancelled.`,
		participantJoinedTitle: 'New participant',
		participantJoinedBody: (name, title) => `${name} joined "${title}".`,
		participantLeftTitle: 'Participant left',
		participantLeftBody: (name, title) => `${name} left "${title}".`
	},
	pt: {
		someone: 'Alguém',
		friend: 'Um amigo',
		rallyTitle: 'Rally',
		eventFallback: 'um evento',
		attachment: 'Enviou um anexo.',
		newMessageFrom: (name) => `Nova mensagem de ${name}`,
		friendRequestTitle: 'Pedido de amizade',
		friendRequestBody: (name) => `${name} enviou-te um pedido de amizade.`,
		friendAcceptedTitle: 'Pedido de amizade aceite',
		friendAcceptedBody: (name) => `${name} aceitou o teu pedido de amizade.`,
		qrFriendTitle: 'Agora são amigos',
		qrFriendBody: (name) => `Tu e ${name} agora são amigos no Rally.`,
		eventInviteTitle: 'Convite de evento',
		eventInviteBody: (name, title) => `${name} convidou-te para "${title}".`,
		eventStartingSoonTitle: 'Evento quase a começar',
		eventStartingSoonBody: (title) => `"${title}" começa dentro de cerca de 1 hora.`,
		eventStartedTitle: 'Evento iniciado',
		eventStartedBody: (title) => `"${title}" está agora a decorrer.`,
		eventFinishedTitle: 'Evento terminado',
		eventFinishedBody: (title) => `"${title}" terminou.`,
		eventCancelledTitle: 'Evento cancelado',
		eventCancelledBody: (title) => `"${title}" foi cancelado.`,
		participantJoinedTitle: 'Novo participante',
		participantJoinedBody: (name, title) => `${name} juntou-se a "${title}".`,
		participantLeftTitle: 'Participante saiu',
		participantLeftBody: (name, title) => `${name} saiu de "${title}".`
	},
	es: {
		someone: 'Alguien',
		friend: 'Un amigo',
		rallyTitle: 'Rally',
		eventFallback: 'un evento',
		attachment: 'Envió un archivo adjunto.',
		newMessageFrom: (name) => `Nuevo mensaje de ${name}`,
		friendRequestTitle: 'Solicitud de amistad',
		friendRequestBody: (name) => `${name} te envió una solicitud de amistad.`,
		friendAcceptedTitle: 'Solicitud de amistad aceptada',
		friendAcceptedBody: (name) => `${name} aceptó tu solicitud de amistad.`,
		qrFriendTitle: 'Ahora sois amigos',
		qrFriendBody: (name) => `Tú y ${name} ahora sois amigos en Rally.`,
		eventInviteTitle: 'Invitación de evento',
		eventInviteBody: (name, title) => `${name} te invitó a "${title}".`,
		eventStartingSoonTitle: 'Evento a punto de empezar',
		eventStartingSoonBody: (title) => `"${title}" empieza en aproximadamente 1 hora.`,
		eventStartedTitle: 'Evento iniciado',
		eventStartedBody: (title) => `"${title}" está en curso.`,
		eventFinishedTitle: 'Evento finalizado',
		eventFinishedBody: (title) => `"${title}" ha finalizado.`,
		eventCancelledTitle: 'Evento cancelado',
		eventCancelledBody: (title) => `"${title}" ha sido cancelado.`,
		participantJoinedTitle: 'Nuevo participante',
		participantJoinedBody: (name, title) => `${name} se unió a "${title}".`,
		participantLeftTitle: 'Participante salió',
		participantLeftBody: (name, title) => `${name} salió de "${title}".`
	},
	fr: {
		someone: 'Quelqu’un',
		friend: 'Un ami',
		rallyTitle: 'Rally',
		eventFallback: 'un événement',
		attachment: 'A envoyé une pièce jointe.',
		newMessageFrom: (name) => `Nouveau message de ${name}`,
		friendRequestTitle: 'Demande d’ami',
		friendRequestBody: (name) => `${name} vous a envoyé une demande d’ami.`,
		friendAcceptedTitle: 'Demande d’ami acceptée',
		friendAcceptedBody: (name) => `${name} a accepté votre demande d’ami.`,
		qrFriendTitle: 'Vous êtes maintenant amis',
		qrFriendBody: (name) => `Vous et ${name} êtes maintenant amis sur Rally.`,
		eventInviteTitle: 'Invitation à un événement',
		eventInviteBody: (name, title) => `${name} vous a invité à « ${title} ».`,
		eventStartingSoonTitle: 'Événement bientôt',
		eventStartingSoonBody: (title) => `« ${title} » commence dans environ 1 heure.`,
		eventStartedTitle: 'Événement commencé',
		eventStartedBody: (title) => `« ${title} » est en cours.`,
		eventFinishedTitle: 'Événement terminé',
		eventFinishedBody: (title) => `« ${title} » est terminé.`,
		eventCancelledTitle: 'Événement annulé',
		eventCancelledBody: (title) => `« ${title} » a été annulé.`,
		participantJoinedTitle: 'Nouveau participant',
		participantJoinedBody: (name, title) => `${name} a rejoint « ${title} ».`,
		participantLeftTitle: 'Un participant est parti',
		participantLeftBody: (name, title) => `${name} a quitté « ${title} ».`
	}
};

function pushTextFor(language) {
	return PUSH_TEXT[language] || PUSH_TEXT.en;
}

function friendshipIdFor(userA, userB) {
	return [userA, userB].sort().join('_');
}

function friendRequestIdFor(fromUserId, toUserId) {
	return `${fromUserId}_to_${toUserId}`;
}

function getStripeClient() {
	let key = process.env.STRIPE_API_KEY;
	try {
		if (stripeApiKey && typeof stripeApiKey.value === 'function') {
			const val = stripeApiKey.value();
			if (val) key = val;
		}
	} catch (err) {
		console.warn('[getStripeClient] Could not read stripeApiKey secret from Secret Manager:', err?.message);
	}
	if (!key) {
		console.error('[getStripeClient] STRIPE_API_KEY is missing from both Secret Manager and process.env!');
		throw new HttpsError('failed-precondition', 'Stripe API key is not configured on the server.');
	}
	console.log(`[getStripeClient] Stripe client initialized with key starting with "${key.substring(0, 7)}..."`);
	return new Stripe(key);
}

function getEventPaymentAttendeeIds(event) {
	return [...new Set([event.creatorId, ...(event.participantIds || [])])];
}

function getEventPaymentPayerIds(event) {
	return (event.participantIds || []).filter((participantId) => participantId !== event.creatorId);
}

function isUpfrontPaymentEvent(event) {
	return (
		event.paymentMode === 'official' ||
		event.entryFeeType === 'paid' ||
		(event.eventKind === 'tournament' && Number(event.entryFeeAmount || 0) > 0)
	);
}

function isPricePerPersonEvent(event) {
	return event.pricePerPerson != null && event.priceTotal == null;
}

function getEventPaymentSplitAmount(event) {
	if (event.paymentSplitAmount != null) return Number(event.paymentSplitAmount);

	if (event.priceTotal != null) {
		const attendeeCount = getEventPaymentAttendeeIds(event).length;
		if (attendeeCount <= 0) return null;
		return Number((Number(event.priceTotal) / attendeeCount).toFixed(2));
	}

	if (event.pricePerPerson != null) {
		return Number(event.pricePerPerson);
	}

	if (event.entryFeeAmount != null) {
		return Number(event.entryFeeAmount);
	}

	return null;
}

function buildPendingPaymentStatuses(event) {
	return Object.fromEntries(getEventPaymentPayerIds(event).map((participantId) => [participantId, 'pending']));
}

function getRequestOrigin(request) {
	const originHeader =
		request.rawRequest?.headers?.origin ||
		request.rawRequest?.headers?.referer ||
		request.rawRequest?.headers?.['x-forwarded-host'];

	if (originHeader) {
		try {
			if (originHeader.startsWith('http://') || originHeader.startsWith('https://')) {
				return new URL(originHeader).origin;
			}
			return `https://${originHeader}`;
		} catch {
			return originHeader;
		}
	}

	return 'https://synqo-rally.web.app';
}

async function canManageEvent(event, userId) {
	if (event.creatorId === userId) return true;

	if (event.hostType === 'organization' && event.organizationId) {
		const organizationDoc = await db.collection('organizations').doc(event.organizationId).get();
		if (!organizationDoc.exists) return false;

		const organization = organizationDoc.data();
		if (organization.ownerId === userId) return true;
		if (Array.isArray(organization.adminIds) && organization.adminIds.includes(userId)) return true;
	}

	return false;
}

function setCorsHeaders(req, res) {
	const origin = req.headers.origin || '*';
	res.set('Access-Control-Allow-Origin', origin);
	res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
	res.set('Vary', 'Origin');
}

async function getAuthenticatedUserFromRequest(req) {
	const authorization = req.headers.authorization || '';
	const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

	if (!token) {
		throw new HttpsError('unauthenticated', 'You must be signed in.');
	}

	const decoded = await getAuth().verifyIdToken(token);
	return decoded;
}

// Server-authoritative friend request flow. This intentionally does not depend
// on client access to the target profile, so private accounts work reliably.
exports.sendFriendRequest = onCall(async (request) => {
	if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');

	const fromUserId = request.auth.uid;
	const toUserId = String(request.data?.toUserId || '').trim();
	if (!toUserId || fromUserId === toUserId) {
		throw new HttpsError('invalid-argument', 'Invalid friend request recipient.');
	}

	const fromRef = db.collection('users').doc(fromUserId);
	const toRef = db.collection('users').doc(toUserId);
	const friendshipRef = db.collection('friendships').doc(friendshipIdFor(fromUserId, toUserId));
	const requestRef = db.collection('friendRequests').doc(friendRequestIdFor(fromUserId, toUserId));

	const result = await db.runTransaction(async (tx) => {
		const [fromDoc, toDoc, friendshipDoc, requestDoc] = await Promise.all([
			tx.get(fromRef),
			tx.get(toRef),
			tx.get(friendshipRef),
			tx.get(requestRef)
		]);
		if (!fromDoc.exists || !toDoc.exists) throw new HttpsError('not-found', 'User not found.');
		if (
			fromDoc.data().accountType === 'organization' ||
			toDoc.data().accountType === 'organization'
		) {
			throw new HttpsError('failed-precondition', 'Organization accounts cannot use friendships.');
		}
		if (friendshipDoc.exists) return { status: 'already_friends' };
		if (requestDoc.exists && requestDoc.data().status === 'pending')
			return { status: 'already_pending' };

		const now = FieldValue.serverTimestamp();
		if (requestDoc.exists) {
			tx.update(requestRef, { status: 'pending', updatedAt: now });
		} else {
			tx.create(requestRef, {
				id: requestRef.id,
				fromUserId,
				toUserId,
				status: 'pending',
				createdAt: now,
				updatedAt: now
			});
		}
		return { status: 'sent' };
	});

	return result;
});

exports.createEventPaymentCheckout = onCall(
	{ secrets: [stripeApiKey], invoker: 'public', cors: true },
	async (request) => {
		console.log('[createEventPaymentCheckout] Function invoked. Auth:', request.auth ? request.auth.uid : 'UNAUTHENTICATED');
		if (!request.auth) {
			console.error('[createEventPaymentCheckout] Rejected: Unauthenticated');
			throw new HttpsError('unauthenticated', 'You must be signed in.');
		}

		try {
			const eventId = String(request.data?.eventId || '').trim();
			const isJoinPayment = Boolean(request.data?.isJoinPayment);
			const teamName = String(request.data?.teamName || '').trim();
			console.log(`[createEventPaymentCheckout] Target eventId: "${eventId}", userId: "${request.auth.uid}", isJoinPayment: ${isJoinPayment}`);
			if (!eventId) {
				throw new HttpsError('invalid-argument', 'Missing event id.');
			}

			const userId = request.auth.uid;
			const eventDoc = await db.collection('events').doc(eventId).get();
			if (!eventDoc.exists) {
				console.error(`[createEventPaymentCheckout] Event doc not found: ${eventId}`);
				throw new HttpsError('not-found', 'Event not found.');
			}

			const event = eventDoc.data();
			console.log(`[createEventPaymentCheckout] Event loaded: title="${event.title}", status=${event.status}, creatorId=${event.creatorId}`);
			
			if (event.status === 'cancelled') {
				throw new HttpsError('failed-precondition', 'Cannot pay for a cancelled event.');
			}

			if (!isJoinPayment && event.creatorId === userId) {
				throw new HttpsError('failed-precondition', 'As the host of this event, you do not need to pay.');
			}

			const isUpfront = isUpfrontPaymentEvent(event);
			const isPerPerson = isPricePerPersonEvent(event);
			const isParticipant = Array.isArray(event.participantIds) && event.participantIds.includes(userId);

			if (isUpfront) {
				if (isJoinPayment) {
					if (isParticipant) {
						throw new HttpsError('failed-precondition', 'You are already a participant in this event.');
					}
					const currentParticipants = event.participantIds || [];
					const max = event.maxParticipants || 100;
					if (currentParticipants.length >= max) {
						throw new HttpsError('failed-precondition', 'Event is already full.');
					}
				} else {
					if (!isParticipant) {
						throw new HttpsError('permission-denied', 'You are not a participant in this event.');
					}
					if (event.paymentStatuses && event.paymentStatuses[userId] === 'paid') {
						throw new HttpsError('failed-precondition', 'This payment is already completed.');
					}
				}
			} else if (isPerPerson) {
				if (!isParticipant && !isJoinPayment) {
					throw new HttpsError('permission-denied', 'You can only pay if you are a participant or joining.');
				}
				if (event.paymentStatuses && event.paymentStatuses[userId] === 'paid') {
					throw new HttpsError('failed-precondition', 'This payment is already completed.');
				}
			} else {
				if (event.status !== 'finished') {
					throw new HttpsError('failed-precondition', 'Payments are only available after the event is finished.');
				}
				if (event.creatorId === userId) {
					throw new HttpsError('failed-precondition', 'The host does not need to pay.');
				}
				if (!isParticipant) {
					throw new HttpsError('permission-denied', 'You can only pay for your own event participation.');
				}
				if (event.paymentStatuses && event.paymentStatuses[userId] === 'paid') {
					throw new HttpsError('failed-precondition', 'This payment is already completed.');
				}
			}

			const splitAmount = getEventPaymentSplitAmount(event);
			console.log(`[createEventPaymentCheckout] Calculated splitAmount: ${splitAmount}`);
			if (splitAmount == null || splitAmount <= 0) {
				throw new HttpsError('failed-precondition', 'This event has no payable amount.');
			}

			const origin = getRequestOrigin(request);
			console.log(`[createEventPaymentCheckout] Resolved origin: ${origin}`);
			const stripe = getStripeClient();
			const amountInCents = Math.round(splitAmount * 100);

			let currency = String(event.currency || 'EUR').toLowerCase();
			if (currency === '€') currency = 'eur';
			if (currency === '$') currency = 'usd';
			if (currency === '£') currency = 'gbp';

			const productName = isUpfront
				? `${event.title || 'Event'} Entry Fee`
				: isPerPerson
					? `${event.title || 'Event'} Participant Fee`
					: `${event.title || 'Event'} Cost Split`;

			console.log(`[createEventPaymentCheckout] Calling Stripe session create: amountInCents=${amountInCents}, currency=${currency}`);
			const checkoutSession = await stripe.checkout.sessions.create({
				mode: 'payment',
				customer_email: request.auth.token?.email || undefined,
				line_items: [
					{
						quantity: 1,
						price_data: {
							currency,
							product_data: {
								name: productName,
								description: `Payment for ${event.title || 'event'}`
							},
							unit_amount: amountInCents
						}
					}
				],
				metadata: {
					eventId,
					userId,
					isJoinPayment: isJoinPayment ? 'true' : 'false',
					teamName: teamName.slice(0, 32)
				},
				payment_intent_data: {
					metadata: {
						eventId,
						userId,
						isJoinPayment: isJoinPayment ? 'true' : 'false',
						teamName: teamName.slice(0, 32)
					}
				},
				success_url: `${origin}/events/${eventId}?paymentSessionId={CHECKOUT_SESSION_ID}`,
				cancel_url: `${origin}/events/${eventId}`
			});

			console.log(`[createEventPaymentCheckout] Stripe session created: id=${checkoutSession.id}, url=${checkoutSession.url}`);
			if (!checkoutSession.url) {
				throw new HttpsError('internal', 'Could not start the Stripe checkout session.');
			}

			return { checkoutUrl: checkoutSession.url };
		} catch (error) {
			console.error('[createEventPaymentCheckout] Exception caught:', error);
			if (error instanceof HttpsError) {
				throw error;
			}
			throw new HttpsError('internal', error?.message || 'Could not start the payment flow.');
		}
	}
);

exports.confirmEventPayment = onCall(
	{ secrets: [stripeApiKey], invoker: 'public', cors: true },
	async (request) => {
		console.log('[confirmEventPayment] Function invoked. Auth:', request.auth ? request.auth.uid : 'UNAUTHENTICATED');
		if (!request.auth) {
			console.error('[confirmEventPayment] Rejected: Unauthenticated');
			throw new HttpsError('unauthenticated', 'You must be signed in.');
		}

		try {
			const eventId = String(request.data?.eventId || '').trim();
			const sessionId = String(request.data?.sessionId || '').trim();
			console.log(`[confirmEventPayment] eventId: "${eventId}", sessionId: "${sessionId}", userId: "${request.auth.uid}"`);
			if (!eventId || !sessionId) {
				throw new HttpsError('invalid-argument', 'Missing payment confirmation data.');
			}

			const userId = request.auth.uid;
			const eventRef = db.collection('events').doc(eventId);
			const eventDoc = await eventRef.get();
			if (!eventDoc.exists) {
				console.error(`[confirmEventPayment] Event not found: ${eventId}`);
				throw new HttpsError('not-found', 'Event not found.');
			}

			const event = eventDoc.data();
			const stripe = getStripeClient();
			console.log(`[confirmEventPayment] Retrieving Stripe session ${sessionId}`);
			const session = await stripe.checkout.sessions.retrieve(sessionId);

			if (session.metadata?.eventId !== eventId || session.metadata?.userId !== userId) {
				console.error('[confirmEventPayment] Session metadata mismatch:', session.metadata);
				throw new HttpsError('permission-denied', 'This payment session does not belong to the current user or event.');
			}

			if (session.payment_status !== 'paid') {
				console.error(`[confirmEventPayment] Payment status is not paid: ${session.payment_status}`);
				throw new HttpsError('failed-precondition', 'Payment has not been completed yet.');
			}

			const isJoinPayment = session.metadata?.isJoinPayment === 'true';
			const teamName = session.metadata?.teamName || '';
			let currentParticipantIds = event.participantIds || [];

			if (isJoinPayment) {
				const isTournament = event.eventKind === 'tournament';
				const isAlreadyParticipant = currentParticipantIds.includes(userId);

				if (!isAlreadyParticipant) {
					currentParticipantIds = [...currentParticipantIds, userId];
				}

				if (isTournament) {
					const userDoc = await db.collection('users').doc(userId).get();
					const userData = userDoc.exists ? userDoc.data() : {};
					const displayName = userData.displayName || 'Player';

					const entriesSnap = await db.collection('tournament_entries').where('eventId', '==', eventId).get();
					const existingEntries = entriesSnap.docs.map((d) => d.data());
					const registered = existingEntries.some((e) => Array.isArray(e.memberIds) && e.memberIds.includes(userId));

					if (!registered) {
						const regType = event.tournamentRegistrationType || 'individual';
						const seed = existingEntries.length + 1;
						const entryName = regType === 'team' ? (teamName || `${displayName}'s Team`) : displayName;

						await db.collection('tournament_entries').add({
							eventId,
							type: regType,
							name: entryName,
							captainId: userId,
							memberIds: [userId],
							isOpen: false,
							maxMembers: regType === 'team' ? (event.maxTeamSize || event.teamSize || null) : 1,
							groupName: null,
							seed,
							status: 'confirmed',
							createdAt: FieldValue.serverTimestamp(),
							updatedAt: FieldValue.serverTimestamp()
						});
					}
				}
			}

			const max = event.maxParticipants || 100;
			const newStatus = currentParticipantIds.length >= max && event.status === 'open' ? 'full' : event.status;

			const existingStatuses = event.paymentStatuses || {};
			const paymentStatuses = {
				...existingStatuses,
				[userId]: 'paid'
			};

			await eventRef.update({
				participantIds: currentParticipantIds,
				status: newStatus,
				paymentSplitAmount: getEventPaymentSplitAmount(event),
				paymentStatuses,
				updatedAt: FieldValue.serverTimestamp()
			});

			console.log(`[confirmEventPayment] Successfully updated payment status for user ${userId} on event ${eventId}`);
			return { status: 'paid' };
		} catch (error) {
			console.error('[confirmEventPayment] Exception caught:', error);
			if (error instanceof HttpsError) {
				throw error;
			}
			throw new HttpsError('internal', error?.message || 'Could not confirm the payment.');
		}
	}
);

exports.createEventPromotionCheckout = onCall(
	{ secrets: [stripeApiKey], invoker: 'public', cors: true },
	async (request) => {
		console.log('[createEventPromotionCheckout] Function invoked. Auth:', request.auth ? request.auth.uid : 'UNAUTHENTICATED');
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'You must be signed in.');
		}

		try {
			const eventId = String(request.data?.eventId || '').trim();
			const budget = Number(request.data?.budget || 0);
			const durationDays = Number(request.data?.durationDays || 7);
			const plan = String(request.data?.plan || 'local');
			const targetCity = String(request.data?.targetCity || '').trim();
			const targetCountry = String(request.data?.targetCountry || 'PT').trim().toUpperCase();
			const targetSport = String(request.data?.targetSport || '').trim();

			if (!eventId || budget <= 0) {
				throw new HttpsError('invalid-argument', 'Missing or invalid promotion parameters.');
			}

			const userId = request.auth.uid;
			const eventDoc = await db.collection('events').doc(eventId).get();
			if (!eventDoc.exists) {
				throw new HttpsError('not-found', 'Event not found.');
			}

			const event = eventDoc.data();
			if (event.hostType !== 'organization' || !event.organizationId) {
				throw new HttpsError('failed-precondition', 'Only organization events can be sponsored.');
			}

			const orgDoc = await db.collection('organizations').doc(event.organizationId).get();
			if (!orgDoc.exists) {
				throw new HttpsError('not-found', 'Organization not found.');
			}

			const org = orgDoc.data();
			const isAdmin = org.ownerId === userId || (Array.isArray(org.adminIds) && org.adminIds.includes(userId));
			if (!isAdmin) {
				throw new HttpsError('permission-denied', 'Only organization admins can sponsor events.');
			}

			if (org.verificationStatus !== 'verified') {
				throw new HttpsError('failed-precondition', 'Only verified organizations can sponsor events.');
			}

			const origin = getRequestOrigin(request);
			const stripe = getStripeClient();
			const amountInCents = Math.round(budget * 100);

			const checkoutSession = await stripe.checkout.sessions.create({
				mode: 'payment',
				customer_email: request.auth.token?.email || undefined,
				line_items: [
					{
						quantity: 1,
						price_data: {
							currency: 'eur',
							product_data: {
								name: `Event Sponsorship - ${event.title || 'Event'}`,
								description: `Promotion campaign (${plan}) for ${durationDays} days`
							},
							unit_amount: amountInCents
						}
					}
				],
				metadata: {
					type: 'event_promotion',
					eventId,
					userId,
					budget: String(budget),
					durationDays: String(durationDays),
					plan,
					targetCity,
					targetCountry,
					targetSport
				},
				payment_intent_data: {
					metadata: {
						type: 'event_promotion',
						eventId,
						userId
					}
				},
				success_url: `${origin}/events/${eventId}?promotionSessionId={CHECKOUT_SESSION_ID}`,
				cancel_url: `${origin}/events/${eventId}`
			});

			if (!checkoutSession.url) {
				throw new HttpsError('internal', 'Could not start the Stripe checkout session.');
			}

			return { checkoutUrl: checkoutSession.url };
		} catch (error) {
			console.error('[createEventPromotionCheckout] Exception caught:', error);
			if (error instanceof HttpsError) throw error;
			throw new HttpsError('internal', error?.message || 'Could not start promotion payment flow.');
		}
	}
);

exports.confirmEventPromotionPayment = onCall(
	{ secrets: [stripeApiKey], invoker: 'public', cors: true },
	async (request) => {
		console.log('[confirmEventPromotionPayment] Function invoked. Auth:', request.auth ? request.auth.uid : 'UNAUTHENTICATED');
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'You must be signed in.');
		}

		try {
			const eventId = String(request.data?.eventId || '').trim();
			const sessionId = String(request.data?.sessionId || '').trim();
			if (!eventId || !sessionId) {
				throw new HttpsError('invalid-argument', 'Missing promotion confirmation data.');
			}

			const userId = request.auth.uid;
			const eventRef = db.collection('events').doc(eventId);
			const eventDoc = await eventRef.get();
			if (!eventDoc.exists) {
				throw new HttpsError('not-found', 'Event not found.');
			}

			const event = eventDoc.data();
			if (event.hostType !== 'organization' || !event.organizationId) {
				throw new HttpsError('failed-precondition', 'Only organization events can be sponsored.');
			}

			const orgDoc = await db.collection('organizations').doc(event.organizationId).get();
			if (!orgDoc.exists) {
				throw new HttpsError('not-found', 'Organization not found.');
			}

			const org = orgDoc.data();
			const isAdmin = org.ownerId === userId || (Array.isArray(org.adminIds) && org.adminIds.includes(userId));
			if (!isAdmin) {
				throw new HttpsError('permission-denied', 'Only organization admins can sponsor events.');
			}

			if (org.verificationStatus !== 'verified') {
				throw new HttpsError('failed-precondition', 'Only verified organizations can sponsor events.');
			}

			const stripe = getStripeClient();
			const session = await stripe.checkout.sessions.retrieve(sessionId);

			if (
				session.metadata?.type !== 'event_promotion' ||
				session.metadata?.eventId !== eventId ||
				session.metadata?.userId !== userId
			) {
				throw new HttpsError('permission-denied', 'Promotion payment session mismatch.');
			}

			if (session.payment_status !== 'paid') {
				throw new HttpsError('failed-precondition', 'Promotion payment has not been completed.');
			}

			const budget = Number(session.metadata?.budget || 0);
			const durationDays = Number(session.metadata?.durationDays || 7);
			const plan = session.metadata?.plan || 'local';
			const targetCity = session.metadata?.targetCity || '';
			const targetCountry = session.metadata?.targetCountry || 'PT';
			const targetSport = session.metadata?.targetSport || null;

			const cpm = plan === 'sport' ? 11 : 7;
			const impressionLimit = Math.floor((budget / cpm) * 1000);
			const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

			await eventRef.update({
				isPromoted: true,
				promotionStatus: 'active',
				promotionPlan: plan,
				promotionBudget: budget,
				promotionCpm: cpm,
				promotionImpressionLimit: impressionLimit,
				promotionTargetCity: targetCity,
				promotionTargetCountry: targetCountry,
				promotionTargetSport: targetSport || null,
				promotionStartedAt: FieldValue.serverTimestamp(),
				promotionEndsAt: Timestamp.fromDate(endsAt),
				promotionViews: 0,
				promotionClicks: 0,
				updatedAt: FieldValue.serverTimestamp()
			});

			console.log(`[confirmEventPromotionPayment] Promotion activated for event ${eventId}`);
			return { status: 'active' };
		} catch (error) {
			console.error('[confirmEventPromotionPayment] Exception caught:', error);
			if (error instanceof HttpsError) throw error;
			throw new HttpsError('internal', error?.message || 'Could not confirm promotion payment.');
		}
	}
);

exports.createBatchEventPaymentCheckout = onCall(
	{ secrets: [stripeApiKey], invoker: 'public', cors: true },
	async (request) => {
		console.log('[createBatchEventPaymentCheckout] Function invoked. Auth:', request.auth ? request.auth.uid : 'UNAUTHENTICATED');
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'You must be signed in.');
		}

		try {
			const eventIds = Array.isArray(request.data?.eventIds) ? request.data.eventIds : [];
			if (eventIds.length === 0) {
				throw new HttpsError('invalid-argument', 'Missing event ids.');
			}

			const userId = request.auth.uid;
			const line_items = [];
			const validEventIds = [];

			for (const eventId of eventIds) {
				const eventDoc = await db.collection('events').doc(eventId).get();
				if (!eventDoc.exists) continue;

				const event = eventDoc.data();
				if (event.status === 'cancelled') continue;
				if (event.creatorId === userId) continue;
				if (event.paymentStatuses && event.paymentStatuses[userId] === 'paid') continue;
				if (!Array.isArray(event.participantIds) || !event.participantIds.includes(userId)) continue;

				const splitAmount = getEventPaymentSplitAmount(event);
				if (splitAmount == null || splitAmount <= 0) continue;

				const amountInCents = Math.round(splitAmount * 100);
				let currency = String(event.currency || 'EUR').toLowerCase();
				if (currency === '€') currency = 'eur';
				if (currency === '$') currency = 'usd';
				if (currency === '£') currency = 'gbp';

				line_items.push({
					quantity: 1,
					price_data: {
						currency,
						product_data: {
							name: `${event.title || 'Event'} payment`,
							description: `Payment for ${event.title || 'event'}`
						},
						unit_amount: amountInCents
					}
				});

				validEventIds.push(eventId);
			}

			if (line_items.length === 0) {
				throw new HttpsError('failed-precondition', 'No pending payable events found.');
			}

			const origin = getRequestOrigin(request);
			const stripe = getStripeClient();

			const checkoutSession = await stripe.checkout.sessions.create({
				mode: 'payment',
				customer_email: request.auth.token?.email || undefined,
				line_items,
				metadata: {
					type: 'batch_event_payment',
					userId,
					eventIds: validEventIds.join(',')
				},
				payment_intent_data: {
					metadata: {
						type: 'batch_event_payment',
						userId
					}
				},
				success_url: `${origin}/payments?batchSessionId={CHECKOUT_SESSION_ID}`,
				cancel_url: `${origin}/payments`
			});

			if (!checkoutSession.url) {
				throw new HttpsError('internal', 'Could not start batch Stripe checkout session.');
			}

			return { checkoutUrl: checkoutSession.url };
		} catch (error) {
			console.error('[createBatchEventPaymentCheckout] Exception caught:', error);
			if (error instanceof HttpsError) throw error;
			throw new HttpsError('internal', error?.message || 'Could not start batch payment flow.');
		}
	}
);

exports.confirmBatchEventPayment = onCall(
	{ secrets: [stripeApiKey], invoker: 'public', cors: true },
	async (request) => {
		console.log('[confirmBatchEventPayment] Function invoked. Auth:', request.auth ? request.auth.uid : 'UNAUTHENTICATED');
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'You must be signed in.');
		}

		try {
			const sessionId = String(request.data?.sessionId || '').trim();
			if (!sessionId) {
				throw new HttpsError('invalid-argument', 'Missing session id.');
			}

			const userId = request.auth.uid;
			const stripe = getStripeClient();
			const session = await stripe.checkout.sessions.retrieve(sessionId);

			if (session.metadata?.type !== 'batch_event_payment' || session.metadata?.userId !== userId) {
				throw new HttpsError('permission-denied', 'Session metadata mismatch.');
			}

			if (session.payment_status !== 'paid') {
				throw new HttpsError('failed-precondition', 'Payment has not been completed yet.');
			}

			const eventIds = String(session.metadata?.eventIds || '').split(',').filter(Boolean);

			for (const eventId of eventIds) {
				const eventRef = db.collection('events').doc(eventId);
				const eventDoc = await eventRef.get();
				if (!eventDoc.exists) continue;

				const event = eventDoc.data();
				const existingStatuses = event.paymentStatuses || {};
				const paymentStatuses = {
					...existingStatuses,
					[userId]: 'paid'
				};

				await eventRef.update({
					paymentSplitAmount: getEventPaymentSplitAmount(event),
					paymentStatuses,
					updatedAt: FieldValue.serverTimestamp()
				});
			}

			console.log(`[confirmBatchEventPayment] Successfully confirmed batch payments for user ${userId} across ${eventIds.length} events`);
			return { status: 'paid', count: eventIds.length };
		} catch (error) {
			console.error('[confirmBatchEventPayment] Exception caught:', error);
			if (error instanceof HttpsError) throw error;
			throw new HttpsError('internal', error?.message || 'Could not confirm batch payment.');
		}
	}
);

exports.sendPaymentReminders = onCall(
	{ secrets: [stripeApiKey], invoker: 'public', cors: true },
	async (request) => {
		console.log('[sendPaymentReminders] Function invoked. Auth:', request.auth ? request.auth.uid : 'UNAUTHENTICATED');
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'You must be signed in.');
		}

		try {
			const eventId = String(request.data?.eventId || '').trim();
			if (!eventId) {
				throw new HttpsError('invalid-argument', 'Missing event id.');
			}

			const userId = request.auth.uid;
			const eventRef = db.collection('events').doc(eventId);
			const eventDoc = await eventRef.get();
			if (!eventDoc.exists) {
				throw new HttpsError('not-found', 'Event not found.');
			}

			const event = eventDoc.data();
			if (event.creatorId !== userId) {
				throw new HttpsError('permission-denied', 'Only the event organizer can send payment reminders.');
			}

			const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
			const lastSentAt = event.lastPaymentReminderSentAt ? event.lastPaymentReminderSentAt.toMillis() : 0;
			if (Date.now() - lastSentAt < COOLDOWN_MS) {
				throw new HttpsError('failed-precondition', 'Payment reminders were sent recently. Please wait before sending again.');
			}

			const payerIds = getEventPaymentPayerIds(event);
			const statuses = event.paymentStatuses || {};
			const unpaidPayerIds = payerIds.filter((id) => (statuses[id] || 'pending') !== 'paid');

			if (unpaidPayerIds.length === 0) {
				return { count: 0, message: 'All participants have already paid.' };
			}

			const splitAmount = getEventPaymentSplitAmount(event);
			const amountStr = splitAmount != null ? ` (€${splitAmount.toFixed(2)})` : '';
			const reminderText = `Payment reminder: You have a pending payment${amountStr} for "${event.title || 'event'}". You can view and settle your payment on the Payments page or event page.`;

			for (const participantId of unpaidPayerIds) {
				try {
					const convId = [userId, participantId].sort().join('_');
					const convRef = db.collection('conversations').doc(convId);

					await convRef.set(
						{
							id: convId,
							type: 'direct',
							memberIds: [userId, participantId],
							createdAt: FieldValue.serverTimestamp(),
							updatedAt: FieldValue.serverTimestamp()
						},
						{ merge: true }
					);

					await convRef.collection('messages').add({
						conversationId: convId,
						senderId: userId,
						text: reminderText,
						type: 'text',
						createdAt: FieldValue.serverTimestamp(),
						readBy: [userId]
					});

					console.log(`[sendPaymentReminders] Sent reminder message to user ${participantId} in conversation ${convId}`);
				} catch (err) {
					console.warn(`[sendPaymentReminders] Error sending reminder message to user ${participantId}:`, err?.message);
				}
			}

			await eventRef.update({
				lastPaymentReminderSentAt: FieldValue.serverTimestamp(),
				updatedAt: FieldValue.serverTimestamp()
			});

			console.log(`[sendPaymentReminders] Sent payment reminders to ${unpaidPayerIds.length} participants for event ${eventId}`);
			return { count: unpaidPayerIds.length };
		} catch (error) {
			console.error('[sendPaymentReminders] Exception caught:', error);
			if (error instanceof HttpsError) throw error;
			throw new HttpsError('internal', error?.message || 'Could not send payment reminders.');
		}
	}
);

// QR scans establish friendship directly on the trusted server and notify both
// accounts. Repeated scans are idempotent but still confirm the relationship.
exports.addFriendByQrCode = onCall(async (request) => {
	if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');

	const scannerId = request.auth.uid;
	const ownerId = String(request.data?.toUserId || '').trim();
	if (!ownerId || scannerId === ownerId) {
		throw new HttpsError('invalid-argument', 'Invalid QR code owner.');
	}

	const scannerRef = db.collection('users').doc(scannerId);
	const ownerRef = db.collection('users').doc(ownerId);
	const friendshipRef = db.collection('friendships').doc(friendshipIdFor(scannerId, ownerId));
	const [scannerDoc, ownerDoc] = await Promise.all([scannerRef.get(), ownerRef.get()]);
	if (!scannerDoc.exists || !ownerDoc.exists) throw new HttpsError('not-found', 'User not found.');
	if (
		scannerDoc.data().accountType === 'organization' ||
		ownerDoc.data().accountType === 'organization'
	) {
		throw new HttpsError('failed-precondition', 'Organization accounts cannot use friendships.');
	}

	await friendshipRef.set(
		{
			id: friendshipRef.id,
			memberIds: [scannerId, ownerId],
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp()
		},
		{ merge: true }
	);

	const scannerName = scannerDoc.data().displayName || 'Rally user';
	const ownerName = ownerDoc.data().displayName || 'Rally user';
	await Promise.allSettled([
		sendPushToUser(scannerId, {
			notification: {
				title: pushTextFor(scannerDoc.data().language).qrFriendTitle,
				body: pushTextFor(scannerDoc.data().language).qrFriendBody(ownerName)
			},
			data: { path: `/users/${ownerId}` },
			android: { notification: { channelId: 'rally_default_channel' } }
		}),
		sendPushToUser(ownerId, {
			notification: {
				title: pushTextFor(ownerDoc.data().language).qrFriendTitle,
				body: pushTextFor(ownerDoc.data().language).qrFriendBody(scannerName)
			},
			data: { path: `/users/${scannerId}` },
			android: { notification: { channelId: 'rally_default_channel' } }
		})
	]);

	return { status: 'friends' };
});

async function sendPushToUser(userId, payload) {
	const userDoc = await db.collection('users').doc(userId).get();
	if (!userDoc.exists) return;

	const userData = userDoc.data();
	let tokens = Array.isArray(userData.fcmTokens) ? userData.fcmTokens : [];
	tokens = tokens.filter((t) => typeof t === 'string' && t.trim() !== '');

	if (tokens.length === 0) return;

	for (const token of tokens) {
		try {
			await messaging.send({
				token,
				...payload
			});
		} catch (sendError) {
			console.error(`Error sending push to token ${token} for user ${userId}:`, sendError);
			if (
				sendError.code === 'messaging/invalid-registration-token' ||
				sendError.code === 'messaging/registration-token-not-registered'
			) {
				await db
					.collection('users')
					.doc(userId)
					.update({
						fcmTokens: FieldValue.arrayRemove(token)
					});
			}
		}
	}
}

const VOICE_EVENT_SPORTS = [
	'football',
	'padel',
	'basketball',
	'running',
	'gym',
	'tennis',
	'cycling',
	'volleyball',
	'other'
];
const VOICE_EVENT_LEVELS = ['beginner', 'casual', 'intermediate', 'advanced'];

// JSON schema for structured extraction of event fields from a voice transcript.
// Every field is nullable — the model must leave unmentioned details as null rather than guessing.
const VOICE_EVENT_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		title: { type: Type.STRING, nullable: true },
		sport: { type: Type.STRING, enum: VOICE_EVENT_SPORTS, nullable: true },
		customSport: { type: Type.STRING, nullable: true },
		level: { type: Type.STRING, enum: VOICE_EVENT_LEVELS, nullable: true },
		description: { type: Type.STRING, nullable: true },
		location: { type: Type.STRING, nullable: true },
		date: { type: Type.STRING, nullable: true },
		time: { type: Type.STRING, nullable: true },
		durationMinutes: { type: Type.INTEGER, nullable: true },
		maxParticipants: { type: Type.INTEGER, nullable: true },
		priceTotal: { type: Type.NUMBER, nullable: true }
	},
	required: [
		'title',
		'sport',
		'customSport',
		'level',
		'description',
		'location',
		'date',
		'time',
		'durationMinutes',
		'maxParticipants',
		'priceTotal'
	]
};

// Callable: transcribes a recorded voice clip and extracts structured event fields from it.
exports.transcribeVoiceEvent = onCall(
	{ secrets: [openaiApiKey, geminiApiKey] },
	async (request) => {
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'You must be signed in to use voice event creation.');
		}

		const { audioBase64, mimeType } = request.data || {};
		if (!audioBase64 || typeof audioBase64 !== 'string') {
			throw new HttpsError('invalid-argument', 'Missing audio data.');
		}

		let transcript;
		try {
			const audioBuffer = Buffer.from(audioBase64, 'base64');
			const audioBlob = new Blob([audioBuffer], { type: mimeType || 'audio/webm' });

			const formData = new FormData();
			formData.append('file', audioBlob, 'recording.webm');
			formData.append('model', 'whisper-1');

			const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
				method: 'POST',
				headers: { Authorization: `Bearer ${openaiApiKey.value()}` },
				body: formData
			});

			if (!whisperResponse.ok) {
				console.error('Whisper transcription failed:', await whisperResponse.text());
				throw new Error('Transcription request failed.');
			}

			const whisperResult = await whisperResponse.json();
			transcript = (whisperResult.text || '').trim();
		} catch (err) {
			console.error('Error transcribing audio:', err);
			throw new HttpsError('internal', 'Could not transcribe the recording. Please try again.');
		}

		if (!transcript) {
			throw new HttpsError('invalid-argument', "Didn't catch that — please try recording again.");
		}

		try {
			const genAI = new GoogleGenAI({ apiKey: geminiApiKey.value() });
			const today = new Date().toISOString().slice(0, 10);

			const response = await genAI.models.generateContent({
				model: 'gemini-2.5-flash',
				contents: transcript,
				config: {
					systemInstruction:
						'Extract sport event details from a spoken transcript describing an event someone wants to create. ' +
						`Today's date is ${today} (YYYY-MM-DD) — resolve relative dates like "tomorrow" or "next Saturday" against it. ` +
						'Only fill in fields explicitly stated or clearly implied in the transcript. Set anything unmentioned to null — never invent details.',
					responseMimeType: 'application/json',
					responseSchema: VOICE_EVENT_SCHEMA
				}
			});

			const fields = JSON.parse(response.text);

			return { transcript, fields };
		} catch (err) {
			console.error('Error extracting event fields:', err);
			throw new HttpsError('internal', 'Could not understand the event details. Please try again.');
		}
	}
);

// Trigger: New message created in conversations/{conversationId}/messages/{messageId}
exports.onMessageCreated = onDocumentCreated(
	'conversations/{conversationId}/messages/{messageId}',
	async (event) => {
		const snapshot = event.data;
		if (!snapshot) return;

		const message = snapshot.data();
		const conversationId = event.params.conversationId;
		const senderId = message.senderId;

		try {
			const convRef = db.collection('conversations').doc(conversationId);
			let memberIds = [];
			const rawText = (message.text || '').trim();
			const cleanText = rawText || PUSH_TEXT.pt.attachment;

			// Execute a server-side transaction to update conversation metadata safely
			await db.runTransaction(async (transaction) => {
				const convDoc = await transaction.get(convRef);
				if (!convDoc.exists) return;

				const convData = convDoc.data();
				memberIds = convData.memberIds || [];

				const currentUnreadFor = convData.unreadFor || [];
				const currentUnreadCounts = convData.unreadCounts || {};
				const receivers = memberIds.filter((id) => id !== senderId);

				// Compute next unreadFor list
				const nextUnreadFor = [
					...new Set([...currentUnreadFor.filter((id) => id !== senderId), ...receivers])
				];

				// Compute next unreadCounts Map
				const nextUnreadCounts = { ...currentUnreadCounts };
				for (const receiverId of receivers) {
					nextUnreadCounts[receiverId] = (nextUnreadCounts[receiverId] || 0) + 1;
				}
				nextUnreadCounts[senderId] = 0;

				// Clear typing state for sender
				const currentTyping = convData.typing || {};
				const nextTyping = { ...currentTyping };
				delete nextTyping[senderId];

				// Update conversation document
				transaction.update(convRef, {
					lastMessage: cleanText,
					lastSenderId: senderId,
					lastMessageAt: message.createdAt || FieldValue.serverTimestamp(),
					updatedAt: FieldValue.serverTimestamp(),
					unreadFor: nextUnreadFor,
					unreadCounts: nextUnreadCounts,
					typing: nextTyping
				});
			});

			// Some lifecycle messages have their own localized push. They still
			// appear in the Rally system conversation, but must not create a
			// second, untranslated notification.
			if (message.suppressPush === true) return;

			// Find the sender's display name
			const senderDoc =
				senderId === 'rally-system' ? null : await db.collection('users').doc(senderId).get();
			const senderName = senderDoc?.exists
				? senderDoc.data().displayName || PUSH_TEXT.pt.someone
				: PUSH_TEXT.pt.rallyTitle;

			const recipients = memberIds.filter((id) => id !== senderId);

			for (const recipientId of recipients) {
				const userDoc = await db.collection('users').doc(recipientId).get();
				if (!userDoc.exists) continue;

				const userData = userDoc.data();
				const text = pushTextFor(userData.language);
				const notificationBody = rawText || text.attachment;

				let tokens = Array.isArray(userData.fcmTokens) ? userData.fcmTokens : [];
				tokens = tokens.filter((t) => typeof t === 'string' && t.trim() !== '');

				if (tokens.length === 0) continue;

				const payload = {
					notification: {
						title: senderId === 'rally-system' ? text.rallyTitle : text.newMessageFrom(senderName),
						body: notificationBody
					},
					data: {
						path: `/messages/${conversationId}`
					},
					android: {
						notification: {
							channelId: 'rally_default_channel'
						}
					}
				};

				for (const token of tokens) {
					try {
						await messaging.send({
							token: token,
							...payload
						});
						console.log(`Notification sent successfully to user ${recipientId}`);
					} catch (sendError) {
						console.error(
							`Error sending push to token ${token} for user ${recipientId}:`,
							sendError
						);
						if (
							sendError.code === 'messaging/invalid-registration-token' ||
							sendError.code === 'messaging/registration-token-not-registered'
						) {
							await db
								.collection('users')
								.doc(recipientId)
								.update({
									fcmTokens: FieldValue.arrayRemove(token)
								});
						}
					}
				}
			}
		} catch (error) {
			console.error('Error in onMessageCreated Cloud Function:', error);
		}
	}
);

// Trigger: New friend request created in friendRequests/{requestId}
exports.onFriendRequestCreated = onDocumentCreated('friendRequests/{requestId}', async (event) => {
	const snapshot = event.data;
	if (!snapshot) return;

	const request = snapshot.data();
	if (request.status !== 'pending') return;

	const fromUserId = request.fromUserId;
	const toUserId = request.toUserId;
	if (!fromUserId || !toUserId || fromUserId === toUserId) return;

	try {
		const [senderDoc, recipientDoc] = await Promise.all([
			db.collection('users').doc(fromUserId).get(),
			db.collection('users').doc(toUserId).get()
		]);

		if (!recipientDoc.exists) return;

		const recipientData = recipientDoc.data();
		const text = pushTextFor(recipientData.language);
		const senderName = senderDoc.exists ? senderDoc.data().displayName || text.friend : text.friend;

		await sendPushToUser(toUserId, {
			notification: {
				title: text.friendRequestTitle,
				body: text.friendRequestBody(senderName)
			},
			data: {
				path: '/messages'
			},
			android: {
				notification: {
					channelId: 'rally_default_channel'
				}
			}
		});
	} catch (error) {
		console.error('Error in onFriendRequestCreated Cloud Function:', error);
	}
});

// Trigger: Friend request accepted in friendRequests/{requestId}
exports.onFriendRequestUpdated = onDocumentUpdated('friendRequests/{requestId}', async (event) => {
	const before = event.data?.before?.data();
	const after = event.data?.after?.data();
	if (!before || !after) return;
	if (before.status === after.status) return;

	const fromUserId = after.fromUserId;
	const toUserId = after.toUserId;
	if (!fromUserId || !toUserId || fromUserId === toUserId) return;

	try {
		// A declined/accepted request can be sent again. Since this is an
		// update rather than a create, explicitly notify the recipient.
		if (after.status === 'pending') {
			const [senderDoc, recipientDoc] = await Promise.all([
				db.collection('users').doc(fromUserId).get(),
				db.collection('users').doc(toUserId).get()
			]);
			if (!recipientDoc.exists) return;
			const text = pushTextFor(recipientDoc.data().language);
			const senderName = senderDoc.exists
				? senderDoc.data().displayName || text.friend
				: text.friend;
			await sendPushToUser(toUserId, {
				notification: { title: text.friendRequestTitle, body: text.friendRequestBody(senderName) },
				data: { path: '/messages' },
				android: { notification: { channelId: 'rally_default_channel' } }
			});
			return;
		}

		if (after.status !== 'accepted') return;
		const [acceptedByDoc, requesterDoc] = await Promise.all([
			db.collection('users').doc(toUserId).get(),
			db.collection('users').doc(fromUserId).get()
		]);

		if (!requesterDoc.exists) return;

		const requesterData = requesterDoc.data();
		const text = pushTextFor(requesterData.language);
		const acceptedByName = acceptedByDoc.exists
			? acceptedByDoc.data().displayName || text.friend
			: text.friend;

		await sendPushToUser(fromUserId, {
			notification: {
				title: text.friendAcceptedTitle,
				body: text.friendAcceptedBody(acceptedByName)
			},
			data: {
				path: '/messages'
			},
			android: {
				notification: {
					channelId: 'rally_default_channel'
				}
			}
		});
	} catch (error) {
		console.error('Error in onFriendRequestUpdated Cloud Function:', error);
	}
});

// Trigger: New event invite created in eventInvites/{inviteId}
exports.onInviteCreated = onDocumentCreated('eventInvites/{inviteId}', async (event) => {
	const snapshot = event.data;
	if (!snapshot) return;

	const invite = snapshot.data();
	const fromUserId = invite.fromUserId;
	const toUserId = invite.toUserId;
	const eventId = invite.eventId;

	try {
		// Get sender profile details
		const senderDoc = await db.collection('users').doc(fromUserId).get();
		const senderName = senderDoc.exists
			? senderDoc.data().displayName || PUSH_TEXT.pt.friend
			: PUSH_TEXT.pt.friend;

		// Get event details
		const eventDoc = await db.collection('events').doc(eventId).get();
		const eventTitle = eventDoc.exists
			? eventDoc.data().title || PUSH_TEXT.pt.eventFallback
			: PUSH_TEXT.pt.eventFallback;

		// Get recipient profile details
		const recipientDoc = await db.collection('users').doc(toUserId).get();
		if (!recipientDoc.exists) return;

		const recipientData = recipientDoc.data();
		const text = pushTextFor(recipientData.language);

		let tokens = Array.isArray(recipientData.fcmTokens) ? recipientData.fcmTokens : [];
		tokens = tokens.filter((t) => typeof t === 'string' && t.trim() !== '');
		if (tokens.length === 0) return;

		const payload = {
			notification: {
				title: text.eventInviteTitle,
				body: text.eventInviteBody(senderName, eventTitle)
			},
			data: {
				path: `/events/${eventId}`
			},
			android: {
				notification: {
					channelId: 'rally_default_channel'
				}
			}
		};

		for (const token of tokens) {
			try {
				await messaging.send({
					token: token,
					...payload
				});
				console.log('Invite notification sent successfully');
			} catch (sendError) {
				console.error(`Error sending invite push:`, sendError);
				if (
					sendError.code === 'messaging/invalid-registration-token' ||
					sendError.code === 'messaging/registration-token-not-registered'
				) {
					await db
						.collection('users')
						.doc(toUserId)
						.update({
							fcmTokens: FieldValue.arrayRemove(token)
						});
				}
			}
		}
	} catch (error) {
		console.error('Error in onInviteCreated Cloud Function:', error);
	}
});

// Scheduled: Remind participants about events that are starting soon.
exports.sendEventStartingSoonReminders = onSchedule('every 5 minutes', async () => {
	const now = Date.now();
	const windowStart = new Date(now + 55 * 60 * 1000);
	const windowEnd = new Date(now + 65 * 60 * 1000);

	try {
		const snap = await db
			.collection('events')
			.where('startAt', '>=', Timestamp.fromDate(windowStart))
			.where('startAt', '<', Timestamp.fromDate(windowEnd))
			.get();

		for (const eventDoc of snap.docs) {
			const eventData = eventDoc.data();

			if (eventData.startingSoonReminderSentAt) continue;
			if (eventData.status === 'cancelled' || eventData.status === 'finished') continue;

			const recipientIds = [
				...new Set(
					[
						eventData.creatorId,
						...(Array.isArray(eventData.participantIds) ? eventData.participantIds : [])
					].filter(Boolean)
				)
			];

			await Promise.allSettled(
				recipientIds.map(async (userId) => {
					const userDoc = await db.collection('users').doc(userId).get();
					if (!userDoc.exists) return;

					const text = pushTextFor(userDoc.data().language);
					await sendPushToUser(userId, {
						notification: {
							title: text.eventStartingSoonTitle,
							body: text.eventStartingSoonBody(eventData.title || text.eventFallback)
						},
						data: {
							path: `/events/${eventDoc.id}`
						},
						android: {
							notification: {
								channelId: 'rally_default_channel'
							}
						}
					});
				})
			);

			await eventDoc.ref.update({
				startingSoonReminderSentAt: FieldValue.serverTimestamp()
			});
		}
	} catch (error) {
		console.error('Error in sendEventStartingSoonReminders Cloud Function:', error);
	}
});

// Scheduled lifecycle pass: sends the exact start notification and marks
// elapsed events as finished even when nobody currently has the app open.
exports.processEventLifecycle = onSchedule('every 5 minutes', async () => {
	const now = Date.now();
	const recentStart = Timestamp.fromMillis(now - 10 * 60 * 1000);
	const currentTime = Timestamp.fromMillis(now);

	try {
		const [startedSnap, finishedSnap] = await Promise.all([
			db
				.collection('events')
				.where('startAt', '>=', recentStart)
				.where('startAt', '<=', currentTime)
				.get(),
			db
				.collection('events')
				.where('endAt', '>=', recentStart)
				.where('endAt', '<=', currentTime)
				.get()
		]);

		for (const eventDoc of startedSnap.docs) {
			const data = eventDoc.data();
			if (
				data.status === 'cancelled' ||
				data.status === 'finished' ||
				data.startedNotificationSentAt
			)
				continue;
			const recipients = [
				...new Set([data.creatorId, ...(data.participantIds || [])].filter(Boolean))
			];
			await Promise.allSettled(
				recipients.map(async (userId) => {
					const userDoc = await db.collection('users').doc(userId).get();
					if (!userDoc.exists) return;
					const text = pushTextFor(userDoc.data().language);
					await sendPushToUser(userId, {
						notification: {
							title: text.eventStartedTitle,
							body: text.eventStartedBody(data.title || text.eventFallback)
						},
						data: { path: `/events/${eventDoc.id}` },
						android: { notification: { channelId: 'rally_default_channel' } }
					});
				})
			);
			await eventDoc.ref.update({ startedNotificationSentAt: FieldValue.serverTimestamp() });
		}

		for (const eventDoc of finishedSnap.docs) {
			const data = eventDoc.data();
			if (data.status === 'cancelled' || data.status === 'finished') continue;
			await eventDoc.ref.update({
				status: 'finished',
				finishedAt: FieldValue.serverTimestamp(),
				updatedAt: FieldValue.serverTimestamp()
			});
		}
	} catch (error) {
		console.error('Error in processEventLifecycle Cloud Function:', error);
	}
});

// Helper: Send system message inside conversations
async function sendSystemMessage(userId, text, suppressPush = false) {
	const RALLY_SYSTEM_SENDER_ID = 'rally-system';
	const conversationsRef = db.collection('conversations');

	// Check if system chat exists
	const querySnap = await conversationsRef
		.where('memberIds', 'array-contains', userId)
		.where('type', '==', 'rally_system')
		.limit(1)
		.get();

	let conversationId;
	if (querySnap.empty) {
		const newConvRef = conversationsRef.doc();
		conversationId = newConvRef.id;
		await newConvRef.set({
			type: 'rally_system',
			memberIds: [userId],
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp(),
			unreadFor: [userId],
			unreadCounts: {
				[userId]: 0
			}
		});
	} else {
		conversationId = querySnap.docs[0].id;
	}

	const cleanText = text.trim();

	// 1. Add system message document
	await conversationsRef.doc(conversationId).collection('messages').add({
		conversationId: conversationId,
		senderId: RALLY_SYSTEM_SENDER_ID,
		text: cleanText,
		suppressPush,
		createdAt: FieldValue.serverTimestamp()
	});

	// 2. Update conversation info
	const convDoc = await conversationsRef.doc(conversationId).get();
	const convData = convDoc.data();
	const currentUnreadCounts = convData.unreadCounts || {};
	const currentUnreadFor = convData.unreadFor || [];

	await conversationsRef.doc(conversationId).update({
		lastMessage: cleanText,
		lastSenderId: RALLY_SYSTEM_SENDER_ID,
		lastMessageAt: FieldValue.serverTimestamp(),
		updatedAt: FieldValue.serverTimestamp(),
		unreadFor: [...new Set([...currentUnreadFor, userId])],
		unreadCounts: {
			...currentUnreadCounts,
			[userId]: (currentUnreadCounts[userId] || 0) + 1
		}
	});
}

// Points Configuration
const RALLY_POINTS_CONFIG = {
	BASE_PARTICIPATION: 50,
	FIRST_VENUE_BONUS: 25,
	PER_PARTICIPANT: 2,
	PER_PARTICIPANT_CAP: 20,
	ORGANIZER_BONUS: 15,
	FULL_EVENT_BONUS: 10
};

// Helper: Secure Points Awarding via Server-side Transaction
async function awardPoints(
	userId,
	eventId,
	venueOrganizationId,
	venueName,
	eventTitle,
	participantCount,
	maxParticipants,
	isOrganizer
) {
	const txCollectionRef = db.collection('users').doc(userId).collection('pointTransactions');

	// Check if points already awarded for this event to avoid double allocation
	const alreadyAwardedSnap = await txCollectionRef.where('eventId', '==', eventId).limit(1).get();
	if (!alreadyAwardedSnap.empty) return;

	// Check if first visit to this venue
	const firstVisitSnap = await txCollectionRef
		.where('venueOrganizationId', '==', venueOrganizationId)
		.limit(1)
		.get();
	const isFirstVisit = firstVisitSnap.empty;

	// Calculate points details
	const base = RALLY_POINTS_CONFIG.BASE_PARTICIPATION;
	const firstVenueBonus = isFirstVisit ? RALLY_POINTS_CONFIG.FIRST_VENUE_BONUS : 0;

	const otherParticipants = Math.max(0, participantCount - 1);
	const participantBonus = Math.min(
		otherParticipants * RALLY_POINTS_CONFIG.PER_PARTICIPANT,
		RALLY_POINTS_CONFIG.PER_PARTICIPANT_CAP
	);

	const organizerBonus = isOrganizer ? RALLY_POINTS_CONFIG.ORGANIZER_BONUS : 0;
	const fullEventBonus =
		participantCount >= maxParticipants ? RALLY_POINTS_CONFIG.FULL_EVENT_BONUS : 0;

	const breakdown = { base, firstVenueBonus, participantBonus, organizerBonus, fullEventBonus };
	const total = base + firstVenueBonus + participantBonus + organizerBonus + fullEventBonus;

	const userRef = db.collection('users').doc(userId);

	// Apply transaction to atomically increment total points and write receipt log
	await db.runTransaction(async (tx) => {
		tx.update(userRef, {
			rallyPointsTotal: FieldValue.increment(total),
			updatedAt: FieldValue.serverTimestamp()
		});

		const newTxRef = txCollectionRef.doc();
		tx.set(newTxRef, {
			userId,
			eventId,
			venueOrganizationId,
			venueName,
			eventTitle,
			amount: total,
			breakdown,
			createdAt: FieldValue.serverTimestamp()
		});
	});
}

// Trigger: Event updated (Completion / Cancellation)
// Records that every pair of members in `memberIds` has shared an event.
// Connections are additive and permanent (used to gate private-profile
// visibility) — no removal logic when someone later leaves an event.
async function syncEventConnections(memberIds) {
	const uniqueMembers = [...new Set(memberIds)].filter(Boolean);
	if (uniqueMembers.length < 2) return;

	await Promise.all(
		uniqueMembers.map((memberId) => {
			const others = uniqueMembers.filter((id) => id !== memberId);
			return db
				.collection('users')
				.doc(memberId)
				.update({
					connections: FieldValue.arrayUnion(...others)
				});
		})
	);
}

exports.onEventUpdated = onDocumentUpdated('events/{eventId}', async (event) => {
	const change = event.data;
	if (!change) return;

	const before = change.before.data();
	const after = change.after.data();
	const eventId = event.params.eventId;

	// Someone joined: sync connections so co-participants can see each
	// other's profile even if one of them is private.
	const beforeParticipantIds = new Set(before.participantIds || []);
	const afterParticipantIds = after.participantIds || [];
	const hasNewParticipant = afterParticipantIds.some((id) => !beforeParticipantIds.has(id));
	const joinedIds = afterParticipantIds.filter((id) => !beforeParticipantIds.has(id));
	const afterParticipantSet = new Set(afterParticipantIds);
	const leftIds = (before.participantIds || []).filter((id) => !afterParticipantSet.has(id));

	if (hasNewParticipant) {
		try {
			await syncEventConnections([after.creatorId, ...afterParticipantIds]);
		} catch (err) {
			console.error(`Error syncing connections for event ${eventId}:`, err);
		}
	}

	// The organizer is notified whenever the participant list changes.
	if (after.creatorId && (joinedIds.length > 0 || leftIds.length > 0)) {
		const organizerDoc = await db.collection('users').doc(after.creatorId).get();
		if (organizerDoc.exists) {
			const text = pushTextFor(organizerDoc.data().language);
			const eventTitle = after.title || text.eventFallback;
			for (const participantId of joinedIds) {
				if (participantId === after.creatorId) continue;
				const participantDoc = await db.collection('users').doc(participantId).get();
				const name = participantDoc.exists
					? participantDoc.data().displayName || text.someone
					: text.someone;
				await sendPushToUser(after.creatorId, {
					notification: {
						title: text.participantJoinedTitle,
						body: text.participantJoinedBody(name, eventTitle)
					},
					data: { path: `/events/${eventId}` },
					android: { notification: { channelId: 'rally_default_channel' } }
				});
			}
			for (const participantId of leftIds) {
				if (participantId === after.creatorId) continue;
				const participantDoc = await db.collection('users').doc(participantId).get();
				const name = participantDoc.exists
					? participantDoc.data().displayName || text.someone
					: text.someone;
				await sendPushToUser(after.creatorId, {
					notification: {
						title: text.participantLeftTitle,
						body: text.participantLeftBody(name, eventTitle)
					},
					data: { path: `/events/${eventId}` },
					android: { notification: { channelId: 'rally_default_channel' } }
				});
			}
		}
	}

	// Execute only if the event status changed
	if (before.status !== after.status) {
		const participantIds = after.participantIds || [];
		const eventTitle = after.title || 'evento';
		const creatorId = after.creatorId;
		const hostType = after.hostType;
		const organizationId = after.organizationId || null;
		const venueName = after.venueName || '';

		// Case 1: Event was cancelled
		if (after.status === 'cancelled') {
			const recipients = [...new Set([creatorId, ...participantIds].filter(Boolean))];
			for (const participantId of recipients) {
				try {
					await sendSystemMessage(participantId, `O evento "${eventTitle}" foi cancelado.`, true);
					const userDoc = await db.collection('users').doc(participantId).get();
					if (userDoc.exists) {
						const text = pushTextFor(userDoc.data().language);
						await sendPushToUser(participantId, {
							notification: {
								title: text.eventCancelledTitle,
								body: text.eventCancelledBody(eventTitle)
							},
							data: { path: `/events/${eventId}` },
							android: { notification: { channelId: 'rally_default_channel' } }
						});
					}
				} catch (err) {
					console.error(`Error sending cancellation system message to user ${participantId}:`, err);
				}
			}
		}

		// Case 2: Event was finished
		if (after.status === 'finished') {
			// Send event finished messages
			const recipients = [...new Set([creatorId, ...participantIds].filter(Boolean))];
			for (const participantId of recipients) {
				try {
					await sendSystemMessage(
						participantId,
						`O teu evento "${eventTitle}" terminou. Esperamos que tenha sido um bom jogo!`,
						true
					);
					const userDoc = await db.collection('users').doc(participantId).get();
					if (userDoc.exists) {
						const text = pushTextFor(userDoc.data().language);
						await sendPushToUser(participantId, {
							notification: {
								title: text.eventFinishedTitle,
								body: text.eventFinishedBody(eventTitle)
							},
							data: { path: `/events/${eventId}` },
							android: { notification: { channelId: 'rally_default_channel' } }
						});
					}
				} catch (err) {
					console.error(`Error sending completion system message to user ${participantId}:`, err);
				}
			}

			// Award Rally Points if the event took place in a verified venue organization
			if (hostType === 'organization' && organizationId) {
				const maxParticipants = after.maxParticipants || 0;
				const participantCount = participantIds.length;

				for (const participantId of participantIds) {
					try {
						const isOrganizer = participantId === creatorId;
						await awardPoints(
							participantId,
							eventId,
							organizationId,
							venueName,
							eventTitle,
							participantCount,
							maxParticipants,
							isOrganizer
						);
					} catch (err) {
						console.error(
							`Error awarding points to user ${participantId} for event ${eventId}:`,
							err
						);
					}
				}
			}
		}
	}
});
