//src\lib\services\chat.service.ts
import {
	addDoc,
	arrayRemove,
	collection,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	orderBy,
	query,
	serverTimestamp,
	setDoc,
	updateDoc,
	where,
	type Unsubscribe
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { ChatConversation, ChatMessage } from '$lib/schema';
import { getOrganizationById } from '$lib/services/organization.service';

function directConversationIdFor(userA: string, userB: string) {
	return [userA, userB].sort().join('_');
}

function organizationConversationIdFor(organizationId: string, userId: string) {
	return `org_${organizationId}_user_${userId}`;
}

function uniqueIds(ids: string[]) {
	return [...new Set(ids.filter(Boolean))];
}

export async function getOrCreateDirectConversation(currentUserId: string, friendId: string) {
	const conversationId = directConversationIdFor(currentUserId, friendId);
	const conversationRef = doc(db, 'conversations', conversationId);

	await setDoc(
		conversationRef,
		{
			id: conversationId,
			type: 'direct',
			memberIds: [currentUserId, friendId],
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp()
		},
		{ merge: true }
	);

	return conversationId;
}

export async function getOrCreateOrganizationConversation(params: {
	organizationId: string;
	userId: string;
	currentUserId: string;
}) {
	const organization = await getOrganizationById(params.organizationId);

	if (!organization) {
		throw new Error('Organization not found.');
	}

	const currentUserIsClient = params.currentUserId === params.userId;
	const currentUserIsOrganizationAdmin = organization.adminIds.includes(params.currentUserId);

	if (!currentUserIsClient && !currentUserIsOrganizationAdmin) {
		throw new Error('You do not have permission to message this organization.');
	}

	const conversationId = organizationConversationIdFor(params.organizationId, params.userId);
	const conversationRef = doc(db, 'conversations', conversationId);

	const memberIds = uniqueIds([params.userId, ...organization.adminIds]);

	await setDoc(
		conversationRef,
		{
			id: conversationId,
			type: 'organization_direct',
			memberIds,

			organizationId: organization.id,
			organizationName: organization.name,
			organizationLogoURL: organization.logoURL ?? null,
			organizationVerificationStatus: organization.verificationStatus,

			userId: params.userId,
			title: organization.name,
			photoURL: organization.logoURL ?? null,

			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp()
		},
		{ merge: true }
	);

	return conversationId;
}

export async function getConversationsForUser(userId: string) {
	const q = query(
		collection(db, 'conversations'),
		where('memberIds', 'array-contains', userId)
	);

	const snap = await getDocs(q);

	return snap.docs.map((docSnap) => ({
		id: docSnap.id,
		...docSnap.data()
	})) as ChatConversation[];
}

export async function getMessagesForConversation(conversationId: string) {
	const q = query(
		collection(db, 'conversations', conversationId, 'messages'),
		orderBy('createdAt', 'asc')
	);

	const snap = await getDocs(q);

	return snap.docs.map((docSnap) => ({
		id: docSnap.id,
		...docSnap.data()
	})) as ChatMessage[];
}

export async function sendMessage(params: {
	conversationId: string;
	senderId: string;
	text: string;
}) {
	const cleanText = params.text.trim();

	if (!cleanText) {
		throw new Error('Message cannot be empty.');
	}

	const conversationRef = doc(db, 'conversations', params.conversationId);
	const conversationSnap = await getDoc(conversationRef);

	if (!conversationSnap.exists()) {
		throw new Error('Conversation not found.');
	}

	await addDoc(collection(db, 'conversations', params.conversationId, 'messages'), {
		conversationId: params.conversationId,
		senderId: params.senderId,
		text: cleanText,
		createdAt: serverTimestamp()
	});
}

export async function getConversationById(conversationId: string) {
	const conversationRef = doc(db, 'conversations', conversationId);
	const snap = await getDoc(conversationRef);

	if (!snap.exists()) return null;

	return {
		id: snap.id,
		...snap.data()
	} as ChatConversation;
}
function getTimestampMillis(value: unknown) {
	const timestamp = value as { toMillis?: () => number; toDate?: () => Date };

	if (timestamp?.toMillis) return timestamp.toMillis();
	if (timestamp?.toDate) return timestamp.toDate().getTime();

	return 0;
}
export function listenConversationById(
	conversationId: string,
	callback: (conversation: ChatConversation | null) => void,
	onError?: (error: Error) => void
): Unsubscribe {
	const conversationRef = doc(db, 'conversations', conversationId);

	return onSnapshot(
		conversationRef,
		(snap) => {
			if (!snap.exists()) {
				callback(null);
				return;
			}

			callback({
				id: snap.id,
				...snap.data()
			} as ChatConversation);
		},
		(error) => {
			console.error('Conversation listener error:', error);
			onError?.(error);
		}
	);
}
export function listenConversationsForUser(
	userId: string,
	callback: (conversations: ChatConversation[]) => void,
	onError?: (error: Error) => void
): Unsubscribe {
	const q = query(
		collection(db, 'conversations'),
		where('memberIds', 'array-contains', userId)
	);

	return onSnapshot(
		q,
		(snap) => {
			const conversations = snap.docs
				.map((docSnap) => ({
					id: docSnap.id,
					...docSnap.data()
				})) as ChatConversation[];

			conversations.sort((a, b) => {
				const aTime = getTimestampMillis(a.lastMessageAt ?? a.updatedAt);
				const bTime = getTimestampMillis(b.lastMessageAt ?? b.updatedAt);

				return bTime - aTime;
			});

			callback(conversations);
		},
		(error) => {
			console.error('Conversations listener error:', error);
			onError?.(error);
		}
	);
}
export async function setUserTyping(params: {
	conversationId: string;
	userId: string;
	displayName: string;
}) {
	const conversationRef = doc(db, 'conversations', params.conversationId);
	const conversationSnap = await getDoc(conversationRef);

	if (!conversationSnap.exists()) return;

	const conversationData = conversationSnap.data() as ChatConversation;

	const nextTyping = {
		...(conversationData.typing ?? {}),
		[params.userId]: {
			userId: params.userId,
			displayName: params.displayName,
			updatedAt: serverTimestamp()
		}
	};

	await updateDoc(conversationRef, {
		typing: nextTyping
	});
}
export async function clearUserTyping(conversationId: string, userId: string) {
	const conversationRef = doc(db, 'conversations', conversationId);
	const conversationSnap = await getDoc(conversationRef);

	if (!conversationSnap.exists()) return;

	const conversationData = conversationSnap.data() as ChatConversation;
	const nextTyping = { ...(conversationData.typing ?? {}) };

	delete nextTyping[userId];

	await updateDoc(conversationRef, {
		typing: nextTyping
	});
}
export async function markConversationAsRead(conversationId: string, userId: string) {
	const conversationRef = doc(db, 'conversations', conversationId);
	const conversationSnap = await getDoc(conversationRef);

	if (!conversationSnap.exists()) return;

	const conversationData = conversationSnap.data() as ChatConversation;
	const nextUnreadCounts = {
		...(conversationData.unreadCounts ?? {}),
		[userId]: 0
	};

	await updateDoc(conversationRef, {
		unreadFor: arrayRemove(userId),
		unreadCounts: nextUnreadCounts,
		updatedAt: serverTimestamp()
	});
}

export function listenMessagesForConversation(
	conversationId: string,
	callback: (messages: ChatMessage[]) => void,
	onError?: (error: Error) => void
): Unsubscribe {
	const q = query(
		collection(db, 'conversations', conversationId, 'messages'),
		orderBy('createdAt', 'asc')
	);

	return onSnapshot(
		q,
		(snap) => {
			const messages = snap.docs.map((docSnap) => ({
				id: docSnap.id,
				...docSnap.data()
			})) as ChatMessage[];

			callback(messages);
		},
		(error) => {
			console.error('Messages listener error:', error);
			onError?.(error);
		}
	);
}

export const RALLY_SYSTEM_SENDER_ID = 'rally-system';

function rallySystemChatIdFor(userId: string) {
	return `rally_system_${userId}`;
}

export async function getOrCreateRallySystemChat(userId: string): Promise<string> {
	const conversationId = rallySystemChatIdFor(userId);
	const conversationRef = doc(db, 'conversations', conversationId);

	await setDoc(
		conversationRef,
		{
			id: conversationId,
			type: 'rally_system',
			memberIds: [userId],
			title: 'Rally',
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp()
		},
		{ merge: true }
	);

	return conversationId;
}

export async function sendRallySystemMessage(userId: string, text: string): Promise<void> {
	const conversationId = await getOrCreateRallySystemChat(userId);
	const cleanText = text.trim();

	await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
		conversationId,
		senderId: RALLY_SYSTEM_SENDER_ID,
		text: cleanText,
		createdAt: serverTimestamp()
	});
}