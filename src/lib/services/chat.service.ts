//C:\Users\henri\Fct3Ano\ADC\Rally\src\lib\services\chat.service.ts
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

function directConversationIdFor(userA: string, userB: string) {
	return [userA, userB].sort().join('_');
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

	const conversationData = conversationSnap.data() as ChatConversation;
	const unreadFor = conversationData.memberIds.filter((memberId) => memberId !== params.senderId);

	await addDoc(collection(db, 'conversations', params.conversationId, 'messages'), {
		conversationId: params.conversationId,
		senderId: params.senderId,
		text: cleanText,
		createdAt: serverTimestamp()
	});

	await updateDoc(conversationRef, {
		lastMessage: cleanText,
		lastSenderId: params.senderId,
		lastMessageAt: serverTimestamp(),
		updatedAt: serverTimestamp(),
		unreadFor
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

export async function markConversationAsRead(conversationId: string, userId: string) {
	await updateDoc(doc(db, 'conversations', conversationId), {
		unreadFor: arrayRemove(userId),
		updatedAt: serverTimestamp()
	});
}