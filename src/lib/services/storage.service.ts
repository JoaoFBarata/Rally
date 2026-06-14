import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '$lib/firebase';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

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