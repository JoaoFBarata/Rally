import type { ChatMessage } from '$lib/schema';

export function getMessageDate(message: ChatMessage) {
	try {
		const timestamp = message.createdAt as { toDate?: () => Date };

		if (!timestamp?.toDate) return null;

		return timestamp.toDate();
	} catch {
		return null;
	}
}

export function formatMessageTime(dateValue: unknown) {
	try {
		const timestamp = dateValue as { toDate?: () => Date };

		if (!timestamp?.toDate) return '';

		return timestamp.toDate().toLocaleTimeString('en-GB', {
			hour: '2-digit',
			minute: '2-digit'
		});
	} catch {
		return '';
	}
}

export function isSameMinute(messageA: ChatMessage, messageB: ChatMessage) {
	const dateA = getMessageDate(messageA);
	const dateB = getMessageDate(messageB);

	if (!dateA || !dateB) return false;

	return Math.floor(dateA.getTime() / 60000) === Math.floor(dateB.getTime() / 60000);
}

export function shouldShowMessageTime(messages: ChatMessage[], index: number) {
	const currentMessage = messages[index];
	const nextMessage = messages[index + 1];

	if (!currentMessage) return false;
	if (!nextMessage) return true;

	if (nextMessage.senderId !== currentMessage.senderId) return true;

	return !isSameMinute(currentMessage, nextMessage);
}