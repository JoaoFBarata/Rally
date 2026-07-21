// src/lib/services/voice-event.service.ts

import { httpsCallable } from 'firebase/functions';
import { functions } from '$lib/firebase';
import type { Sport, SportLevel } from '$lib/schema';

export interface VoiceExtractedFields {
	title: string | null;
	sport: Sport | null;
	customSport: string | null;
	level: SportLevel | null;
	description: string | null;
	location: string | null;
	date: string | null;
	time: string | null;
	durationMinutes: number | null;
	maxParticipants: number | null;
	priceTotal: number | null;
}

interface TranscribeVoiceEventResult {
	transcript: string;
	fields: VoiceExtractedFields | null;
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const result = reader.result as string;
			resolve(result.slice(result.indexOf(',') + 1));
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

export async function transcribeVoiceEvent(audioBlob: Blob): Promise<TranscribeVoiceEventResult> {
	const audioBase64 = await blobToBase64(audioBlob);

	const callable = httpsCallable<
		{ audioBase64: string; mimeType: string },
		TranscribeVoiceEventResult
	>(functions, 'transcribeVoiceEvent');

	const result = await callable({ audioBase64, mimeType: audioBlob.type });

	return result.data;
}
