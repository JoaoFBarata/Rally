import type { ChatTypingState } from '$lib/schema';

export function getTypingLabel(
	typing: Record<string, ChatTypingState> | undefined,
	currentUserId: string,
	visibleMs = 5000
) {
	if (!typing) return '';

	const now = Date.now();

	const activeTypingUsers = Object.values(typing).filter((typingUser) => {
		if (typingUser.userId === currentUserId) return false;

		const timestamp = typingUser.updatedAt as { toMillis?: () => number; toDate?: () => Date };

		const updatedAt =
			timestamp?.toMillis?.() ??
			timestamp?.toDate?.()?.getTime?.() ??
			0;

		return updatedAt > 0 && now - updatedAt <= visibleMs;
	});

	if (activeTypingUsers.length === 0) return '';

	if (activeTypingUsers.length === 1) {
		return `${activeTypingUsers[0].displayName} is typing...`;
	}

	return `${activeTypingUsers.length} people are typing...`;
}