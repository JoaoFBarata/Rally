export function getFriendlyErrorMessage(err: unknown, fallback = 'Something went wrong.') {
	const rawMessage = err instanceof Error ? err.message : String(err || '');
	const message = rawMessage.trim();
	const lowerMessage = message.toLowerCase();

	if (!message) return fallback;

	if (
		lowerMessage.includes('missing or insufficient permissions') ||
		lowerMessage.includes('permission-denied') ||
		lowerMessage.includes('does not have permission')
	) {
		return 'You do not have permission to do this. Check that you are using the right account.';
	}

	if (lowerMessage.includes('firebase storage') || lowerMessage.includes('storage/unauthorized')) {
		return 'This file could not be uploaded because storage permissions blocked it.';
	}

	if (lowerMessage.includes('storage/quota-exceeded')) {
		return 'Storage is temporarily full. Try again later or choose a smaller file.';
	}

	if (lowerMessage.includes('auth/invalid-credential') || lowerMessage.includes('auth/wrong-password')) {
		return 'The email or password is incorrect.';
	}

	if (lowerMessage.includes('auth/email-already-in-use')) {
		return 'There is already an account with this email.';
	}

	if (lowerMessage.includes('auth/too-many-requests')) {
		return 'Too many attempts. Please wait a moment and try again.';
	}

	if (lowerMessage.includes('network') || lowerMessage.includes('offline')) {
		return 'Network problem. Check your internet connection and try again.';
	}

	if (lowerMessage.includes('index')) {
		return 'This data is still being prepared. Please try again in a moment.';
	}

	return message.replace(/^Firebase(?:Error)?:?\s*/i, '').replace(/\s*\([^)]*\)\.?$/i, '') || fallback;
}
