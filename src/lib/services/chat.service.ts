import {
	addDoc,
	collection,
	doc,
    getDoc,
	getDocs,
	orderBy,
	query,
	serverTimestamp,
	setDoc,
	updateDoc,
	where
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

	await addDoc(collection(db, 'conversations', params.conversationId, 'messages'), {
		conversationId: params.conversationId,
		senderId: params.senderId,
		text: cleanText,
		createdAt: serverTimestamp()
	});

	await updateDoc(doc(db, 'conversations', params.conversationId), {
		lastMessage: cleanText,
		lastMessageAt: serverTimestamp(),
		updatedAt: serverTimestamp()
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