<!-- src/lib/components/VoiceRecordButton.svelte -->
<script lang="ts">
	import {
		transcribeVoiceEvent,
		type VoiceExtractedFields
	} from '$lib/services/voice-event.service';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { i18n } from '$lib/services/i18n.svelte';

	let { onExtracted }: { onExtracted: (fields: VoiceExtractedFields) => void } = $props();

	type RecordState = 'idle' | 'recording' | 'processing' | 'error';

	let recordState = $state<RecordState>('idle');
	let errorMessage = $state('');

	let mediaRecorder: MediaRecorder | null = null;
	let mediaStream: MediaStream | null = null;
	let chunks: BlobPart[] = [];

	const MIME_CANDIDATES = ['audio/webm', 'audio/mp4', 'audio/aac', 'audio/wav'];

	function pickSupportedMimeType() {
		return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
	}

	function stopStream() {
		mediaStream?.getTracks().forEach((track) => track.stop());
		mediaStream = null;
	}

	async function startRecording() {
		errorMessage = '';

		try {
			mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch (err) {
			recordState = 'error';
			errorMessage = 'Microphone access was denied. Enable it in your settings to use voice fill.';
			console.error('getUserMedia error:', err);
			return;
		}

		const mimeType = pickSupportedMimeType();
		chunks = [];

		try {
			mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
		} catch (err) {
			stopStream();
			recordState = 'error';
			errorMessage = 'Voice recording is not supported on this device.';
			console.error('MediaRecorder error:', err);
			return;
		}

		mediaRecorder.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};

		mediaRecorder.onstop = async () => {
			stopStream();

			const audioBlob = new Blob(chunks, { type: mimeType || 'audio/webm' });
			chunks = [];

			recordState = 'processing';

			try {
				const { fields } = await transcribeVoiceEvent(audioBlob);

				if (fields) {
					onExtracted(fields);
				}

				recordState = 'idle';
			} catch (err) {
				recordState = 'error';
				errorMessage = getFriendlyErrorMessage(
					err,
					'Could not process the recording. Please try again.'
				);
				console.error('Voice event transcription error:', err);
			}
		};

		mediaRecorder.start();
		recordState = 'recording';
	}

	function stopRecording() {
		mediaRecorder?.stop();
	}

	function handleClick() {
		if (recordState === 'idle' || recordState === 'error') {
			void startRecording();
		} else if (recordState === 'recording') {
			stopRecording();
		}
	}
</script>

<div class="flex flex-col gap-2">
	<button
		type="button"
		onclick={handleClick}
		disabled={recordState === 'processing'}
		class={`inline-flex items-center gap-2 self-start rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${
			recordState === 'recording'
				? 'bg-red-600 shadow-red-600/25 hover:bg-red-700'
				: 'bg-blue-600 shadow-blue-600/25 hover:bg-blue-700 dark:shadow-blue-950/40'
		}`}
	>
		{#if recordState === 'processing'}
			<svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
				></circle>
				<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
			</svg>
			{i18n.t('listening_to_recording')}
		{:else if recordState === 'recording'}
			<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
				<rect x="5" y="5" width="10" height="10" rx="2" />
			</svg>
			{i18n.t('tap_to_stop')}
		{:else}
			<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
				<path d="M10 2a3 3 0 00-3 3v5a3 3 0 006 0V5a3 3 0 00-3-3z" />
				<path
					d="M5.5 9a.75.75 0 00-1.5 0 6 6 0 005.25 5.955V17h-2a.75.75 0 000 1.5h5.5a.75.75 0 000-1.5h-2v-2.045A6 6 0 0016 9a.75.75 0 00-1.5 0 4.5 4.5 0 01-9 0z"
				/>
			</svg>
			{i18n.t('fill_with_voice')}
		{/if}
	</button>

	{#if errorMessage}
		<p class="text-sm font-medium text-red-600 dark:text-red-400">{errorMessage}</p>
	{/if}
</div>
