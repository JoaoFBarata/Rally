import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '$lib/firebase';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_CHAT_FILE_SIZE = 25 * 1024 * 1024;

function getFileExtension(file: File) {
	const extensionFromName = file.name.split('.').pop()?.toLowerCase();

	if (extensionFromName) return extensionFromName;

	if (file.type === 'image/png') return 'png';
	if (file.type === 'image/webp') return 'webp';

	return 'jpg';
}

export async function uploadEventGroupPhoto(params: {
	eventId: string;
	userId: string;
	file: File;
}) {
	const { eventId, userId, file } = params;

	if (!file.type.startsWith('image/')) {
		throw new Error('Please choose an image file.');
	}

	if (file.size > MAX_IMAGE_SIZE) {
		throw new Error('Image is too large. Choose an image under 5 MB.');
	}

	const extension = getFileExtension(file);
	const fileName = `${Date.now()}.${extension}`;
	const path = `event-group-photos/${eventId}/${userId}/${fileName}`;

	const storageRef = ref(storage, path);

	await uploadBytes(storageRef, file, {
		contentType: file.type,
		customMetadata: {
			eventId,
			uploadedBy: userId
		}
	});

	const url = await getDownloadURL(storageRef);

	return {
		url,
		path
	};
}

export async function uploadUserProfilePhoto(params: { userId: string; file: File }) {
	const { userId, file } = params;

	if (!file.type.startsWith('image/')) {
		throw new Error('Please choose an image file.');
	}

	if (file.size > MAX_IMAGE_SIZE) {
		throw new Error('Image is too large. Choose an image under 5 MB.');
	}

	const extension = getFileExtension(file);
	const fileName = `${Date.now()}.${extension}`;
	const path = `profile-photos/${userId}/${fileName}`;

	const storageRef = ref(storage, path);

	await uploadBytes(storageRef, file, {
		contentType: file.type,
		customMetadata: {
			uploadedBy: userId
		}
	});

	const url = await getDownloadURL(storageRef);

	return {
		url,
		path
	};
}

export async function uploadOrganizationLogo(params: {
	organizationId: string;
	userId: string;
	file: File;
}) {
	const { organizationId, userId, file } = params;

	if (!file.type.startsWith('image/')) {
		throw new Error('Please choose an image file.');
	}

	if (file.size > 5 * 1024 * 1024) {
		throw new Error('Image is too large. Choose an image under 5 MB.');
	}

	const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
	const fileName = `${Date.now()}.${extension}`;
	const path = `organization-logos/${organizationId}/${userId}/${fileName}`;

	const storageRef = ref(storage, path);

	await uploadBytes(storageRef, file, {
		contentType: file.type,
		customMetadata: {
			organizationId,
			uploadedBy: userId
		}
	});

	const url = await getDownloadURL(storageRef);

	return { url, path };
}

export async function uploadChatImage(params: {
	conversationId: string;
	userId: string;
	file: File;
}) {
	const { conversationId, userId, file } = params;

	if (file.size > MAX_CHAT_FILE_SIZE) {
		throw new Error('File is too large. Choose a file under 25 MB.');
	}

	const extension = getFileExtension(file);
	const fileName = `${Date.now()}.${extension}`;
	const path = `chat-attachments/${conversationId}/${userId}/${fileName}`;

	const storageRef = ref(storage, path);

	await uploadBytes(storageRef, file, {
		contentType: file.type,
		customMetadata: {
			conversationId,
			uploadedBy: userId,
			originalName: file.name
		}
	});

	const url = await getDownloadURL(storageRef);

	return {
		url,
		path
	};
}

export const uploadChatFile = uploadChatImage;
