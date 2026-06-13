<!-- src/routes/events/[id]/+page.svelte -->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import {
		cancelEvent,
		ensureEventGroupConversation,
		getEventById,
		getEventGroupConversationId,
		joinEvent,
		leaveEvent,
		removeParticipantFromEvent,
		updateEventGroupPhoto
	} from '$lib/services/event.service';
	import { getMessagesForConversation, sendMessage } from '$lib/services/chat.service';
	import { getUserProfile } from '$lib/services/user.service';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import type { ChatMessage, SportEvent, UserProfile } from '$lib/schema';

	let event = $state<SportEvent | null>(null);
	let loading = $state(true);
	let actionLoading = $state(false);
	let error = $state('');
	let participants = $state<UserProfile[]>([]);

	let groupMessages = $state<ChatMessage[]>([]);
	let groupMessageText = $state('');
	let groupChatLoading = $state(false);
	let groupChatSending = $state(false);
	let groupPhotoSaving = $state(false);
	let messagesContainer = $state<HTMLDivElement | null>(null);

	let isCreator = $derived.by(() => {
		const currentUser = auth.currentUser;
		return !!currentUser && !!event && event.creatorId === currentUser.uid;
	});

	let isParticipant = $derived.by(() => {
		const currentUser = auth.currentUser;
		return !!currentUser && !!event && event.participantIds.includes(currentUser.uid);
	});

	let canJoin = $derived.by(() => {
		return !!event && !isCreator && !isParticipant && event.status !== 'full' && event.status !== 'cancelled';
	});

	let canInvite = $derived.by(() => {
		return !!event && event.status !== 'cancelled' && (isCreator || isParticipant);
	});

	let participantById = $derived.by(() => {
		return Object.fromEntries(participants.map((participant) => [participant.id, participant])) as Record<
			string,
			UserProfile
		>;
	});

	let mapEmbedUrl = $derived.by(() => {
		if (!event) return '';

		const lat = event.location.lat;
		const lng = event.location.lng;

		if (typeof lat !== 'number' || typeof lng !== 'number') return '';

		const bbox = `${lng - 0.012}%2C${lat - 0.012}%2C${lng + 0.012}%2C${lat + 0.012}`;

		return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
	});

	function formatDate(dateValue: unknown) {
		try {
			const timestamp = dateValue as { toDate?: () => Date };

			if (timestamp?.toDate) {
				return timestamp.toDate().toLocaleString('en-GB', {
					weekday: 'long',
					day: '2-digit',
					month: 'long',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				});
			}

			return 'Date not set';
		} catch {
			return 'Date not set';
		}
	}

	async function getUserProfilesByIds(userIds: string[]) {
		const profiles = await Promise.all(userIds.map((userId) => getUserProfile(userId)));

		return profiles.filter(Boolean) as UserProfile[];
	}

	async function scrollGroupChatToBottom() {
		await tick();

		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	async function loadGroupMessages(currentEvent: SportEvent) {
		const currentUser = auth.currentUser;

		if (!currentUser) return;

		if (!currentEvent.participantIds.includes(currentUser.uid)) {
			groupMessages = [];
			return;
		}

		groupChatLoading = true;

		try {
			await ensureEventGroupConversation(currentEvent.id);

			const conversationId = getEventGroupConversationId(currentEvent.id);
			groupMessages = await getMessagesForConversation(conversationId);

			await scrollGroupChatToBottom();
		} catch (err) {
			console.error('Group chat load error:', err);
		} finally {
			groupChatLoading = false;
		}
	}

	async function reloadEvent() {
		if (!event) return;

		const updatedEvent = await getEventById(event.id);

		if (updatedEvent) {
			event = updatedEvent;
			participants = await getUserProfilesByIds(updatedEvent.participantIds ?? []);
			await loadGroupMessages(updatedEvent);
		}
	}

	async function loadEventPage() {
		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto(resolve('/login'));
			return;
		}

		try {
			const eventId = page.params.id;

			if (!eventId) {
				error = 'Event ID not found.';
				loading = false;
				return;
			}

			const loadedEvent = await getEventById(eventId);

			if (!loadedEvent) {
				error = 'Event not found.';
				return;
			}

			event = loadedEvent;
			participants = await getUserProfilesByIds(loadedEvent.participantIds ?? []);

			if (loadedEvent.participantIds.includes(currentUser.uid)) {
				await loadGroupMessages(loadedEvent);
			}
		} catch (err) {
			console.error('Event detail error:', err);
			error = err instanceof Error ? err.message : 'Could not load event.';
		} finally {
			loading = false;
		}
	}

	async function handleJoinEvent() {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		actionLoading = true;
		error = '';

		try {
			await joinEvent(event.id, currentUser.uid);
			await reloadEvent();
		} catch (err) {
			console.error('Join event error:', err);
			error = err instanceof Error ? err.message : 'Could not join event.';
		} finally {
			actionLoading = false;
		}
	}

	async function handleLeaveEvent() {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		const confirmLeave = confirm('Leave this event?');

		if (!confirmLeave) return;

		actionLoading = true;
		error = '';

		try {
			await leaveEvent(event.id, currentUser.uid);
			await reloadEvent();
		} catch (err) {
			console.error('Leave event error:', err);
			error = err instanceof Error ? err.message : 'Could not leave event.';
		} finally {
			actionLoading = false;
		}
	}

	async function handleCancelEvent() {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		const confirmCancel = confirm('Cancel this event?');

		if (!confirmCancel) return;

		actionLoading = true;
		error = '';

		try {
			await cancelEvent(event.id, currentUser.uid);
			await reloadEvent();
		} catch (err) {
			console.error('Cancel event error:', err);
			error = err instanceof Error ? err.message : 'Could not cancel event.';
		} finally {
			actionLoading = false;
		}
	}

	async function handleRemoveParticipant(participantId: string) {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		const confirmRemove = confirm('Remove this person from the event?');

		if (!confirmRemove) return;

		actionLoading = true;
		error = '';

		try {
			await removeParticipantFromEvent({
				eventId: event.id,
				creatorId: currentUser.uid,
				participantId
			});

			await reloadEvent();
		} catch (err) {
			console.error('Remove participant error:', err);
			error = err instanceof Error ? err.message : 'Could not remove participant.';
		} finally {
			actionLoading = false;
		}
	}

	function readFileAsDataURL(file: File) {
		return new Promise<string>((resolveFile, rejectFile) => {
			const reader = new FileReader();

			reader.onload = () => {
				if (typeof reader.result === 'string') {
					resolveFile(reader.result);
				} else {
					rejectFile(new Error('Could not read image.'));
				}
			};

			reader.onerror = () => rejectFile(new Error('Could not read image.'));
			reader.readAsDataURL(file);
		});
	}

	async function handleGroupPhotoFileChange(fileEvent: Event) {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		const input = fileEvent.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		if (!file.type.startsWith('image/')) {
			error = 'Please choose an image file.';
			return;
		}

		if (file.size > 400_000) {
			error = 'Image is too large. Choose an image under 400 KB for now.';
			return;
		}

		groupPhotoSaving = true;
		error = '';

		try {
			const dataURL = await readFileAsDataURL(file);

			await updateEventGroupPhoto({
				eventId: event.id,
				userId: currentUser.uid,
				groupPhotoURL: dataURL
			});

			input.value = '';
			await reloadEvent();
		} catch (err) {
			console.error('Update group photo error:', err);
			error = err instanceof Error ? err.message : 'Could not update group photo.';
		} finally {
			groupPhotoSaving = false;
		}
	}

	async function handleSendGroupMessage() {
		const currentUser = auth.currentUser;

		if (!currentUser || !event || !groupMessageText.trim()) return;

		if (!event.participantIds.includes(currentUser.uid)) {
			error = 'You need to be in this event to send messages.';
			return;
		}

		groupChatSending = true;
		error = '';

		try {
			const conversationId = getEventGroupConversationId(event.id);

			await sendMessage({
				conversationId,
				senderId: currentUser.uid,
				text: groupMessageText
			});

			groupMessageText = '';
			groupMessages = await getMessagesForConversation(conversationId);
			await scrollGroupChatToBottom();
		} catch (err) {
			console.error('Send group message error:', err);
			error = err instanceof Error ? err.message : 'Could not send message.';
		} finally {
			groupChatSending = false;
		}
	}

	onMount(() => {
		loadEventPage();
	});
</script>

<a
	href={resolve('/dashboard')}
	class="inline-flex rounded-full bg-blue-50 px-5 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
>
	← Back to dashboard
</a>

{#if loading}
	<div
		class="mt-8 rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
	>
		<p class="text-slate-500 dark:text-slate-400">Loading event...</p>
	</div>
{:else if error && !event}
	<div
		class="mt-8 rounded-4xl border border-red-200 bg-red-50 p-8 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
	>
		{error}
	</div>
{:else if event}
	<div class="mt-8 grid gap-6 xl:grid-cols-[1.65fr_0.85fr]">
		<div class="space-y-6">
			<section
				class="rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<p class="text-sm font-black uppercase tracking-[0.45em] text-blue-600 dark:text-blue-400">
					{event.sport}
				</p>

				<div class="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h1 class="text-4xl font-black tracking-tight text-slate-950 dark:text-white">
							{event.title}
						</h1>

						<p class="mt-4 text-slate-600 dark:text-slate-400">
							{event.description || 'No description provided.'}
						</p>
					</div>

					{#if event.status === 'cancelled'}
						<span
							class="rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-700 dark:bg-red-950 dark:text-red-300"
						>
							Cancelled
						</span>
					{/if}
				</div>

				<div class="mt-8 grid gap-4 md:grid-cols-2">
					<div class="rounded-3xl bg-slate-50 p-5 dark:bg-slate-950">
						<p class="text-sm font-bold text-slate-500 dark:text-slate-400">Date and time</p>
						<p class="mt-2 font-black text-slate-950 dark:text-white">
							{formatDate(event.startAt)}
						</p>
					</div>

					<div class="rounded-3xl bg-slate-50 p-5 dark:bg-slate-950">
						<p class="text-sm font-bold text-slate-500 dark:text-slate-400">Location</p>
						<p class="mt-2 font-black text-slate-950 dark:text-white">{event.location.name}</p>
						{#if event.location.address}
							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								{event.location.address}
							</p>
						{/if}
					</div>

					<div class="rounded-3xl bg-slate-50 p-5 dark:bg-slate-950">
						<p class="text-sm font-bold text-slate-500 dark:text-slate-400">Participants</p>
						<p class="mt-2 font-black text-slate-950 dark:text-white">
							{event.participantIds.length}/{event.maxParticipants}
						</p>
					</div>

					<div class="rounded-3xl bg-slate-50 p-5 dark:bg-slate-950">
						<p class="text-sm font-bold text-slate-500 dark:text-slate-400">Price</p>
						{#if event.pricePerPerson}
							<p class="mt-2 font-black text-slate-950 dark:text-white">
								€{event.pricePerPerson.toFixed(2)} per person
							</p>
						{:else}
							<p class="mt-2 font-black text-slate-950 dark:text-white">Free / not defined</p>
						{/if}
					</div>
				</div>

				<div
					class="mt-8 rounded-4xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
				>
					<div class="flex items-center justify-between gap-4">
						<div>
							<p class="text-sm font-black uppercase tracking-[0.45em] text-blue-600 dark:text-blue-400">
								Players
							</p>

							<h2 class="mt-2 text-2xl font-black text-slate-950 dark:text-white">
								People in this event
							</h2>
						</div>

						<div class="rounded-3xl bg-blue-50 px-5 py-3 text-center dark:bg-blue-950">
							<p class="text-xl font-black text-blue-600 dark:text-blue-300">
								{event.participantIds.length}/{event.maxParticipants}
							</p>
							<p class="text-xs font-bold text-slate-500 dark:text-slate-400">players</p>
						</div>
					</div>

					{#if participants.length === 0}
						<p class="mt-6 text-sm text-slate-500 dark:text-slate-400">No players yet.</p>
					{:else}
						<div class="mt-6 space-y-3">
							{#each participants as participant (participant.id)}
								<div
									class="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
								>
									<UserAvatar
										displayName={participant.displayName}
										email={participant.email}
										photoURL={participant.photoURL}
										size="md"
									/>

									<div class="min-w-0 flex-1">
										<p class="truncate font-black text-slate-950 dark:text-white">
											{participant.displayName}
										</p>
										<p class="truncate text-sm text-slate-500 dark:text-slate-400">
											@{participant.rallyTag ?? 'rally'}
										</p>
									</div>

									{#if participant.id === event.creatorId}
										<span
											class="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-600 dark:bg-blue-950 dark:text-blue-300"
										>
											Host
										</span>
									{:else if isCreator && event.status !== 'cancelled'}
										<button
											type="button"
											onclick={() => handleRemoveParticipant(participant.id)}
											disabled={actionLoading}
											class="rounded-full px-4 py-2 text-sm font-black text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950"
										>
											Remove
										</button>
									{:else}
										<span
											class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400"
										>
											Player
										</span>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</section>

			{#if isParticipant && event.status !== 'cancelled'}
				<section
					class="rounded-4xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<div class="flex items-center gap-4 border-b border-slate-100 p-5 dark:border-slate-800">
						{#if event.groupPhotoURL}
							<img
								src={event.groupPhotoURL}
								alt={event.title}
								class="h-12 w-12 rounded-full object-cover ring-2 ring-white dark:ring-slate-800"
							/>
						{:else}
							<div
								class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-lg font-black text-blue-600 ring-2 ring-white dark:bg-blue-950 dark:text-blue-300 dark:ring-slate-800"
							>
								{event.title.slice(0, 1).toUpperCase()}
							</div>
						{/if}

						<div class="min-w-0 flex-1">
							<p class="truncate text-lg font-black text-slate-950 dark:text-white">
								{event.title}
							</p>
							<p class="truncate text-sm text-slate-500 dark:text-slate-400">
								Group chat · {event.participantIds.length} members
							</p>
						</div>

						{#if isCreator}
							<label
								class="cursor-pointer rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
							>
								{groupPhotoSaving ? '...' : '📷'}
								<input
									type="file"
									accept="image/*"
									class="hidden"
									onchange={handleGroupPhotoFileChange}
								/>
							</label>
						{/if}
					</div>

					<div
						bind:this={messagesContainer}
						class="h-[360px] overflow-y-auto bg-slate-50 px-5 py-5 dark:bg-slate-950"
					>
						{#if groupChatLoading}
							<div class="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
								Loading group chat...
							</div>
						{:else if groupMessages.length === 0}
							<div class="flex h-full items-center justify-center text-center">
								<div>
									<p class="text-4xl">💬</p>
									<p class="mt-3 font-black text-slate-700 dark:text-slate-200">
										No messages yet
									</p>
									<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
										Send the first message to the event group.
									</p>
								</div>
							</div>
						{:else}
							<div class="mx-auto flex max-w-3xl flex-col gap-3">
								{#each groupMessages as message (message.id)}
									<div
										class={`flex items-end gap-2 ${
											message.senderId === auth.currentUser?.uid ? 'justify-end' : 'justify-start'
										}`}
									>
										{#if message.senderId !== auth.currentUser?.uid}
											<UserAvatar
												displayName={participantById[message.senderId]?.displayName}
												email={participantById[message.senderId]?.email}
												photoURL={participantById[message.senderId]?.photoURL}
												size="sm"
											/>
										{/if}

										<div
											class={`max-w-[78%] rounded-3xl px-4 py-2 text-sm leading-6 shadow-sm ${
												message.senderId === auth.currentUser?.uid
													? 'rounded-br-md bg-blue-600 text-white'
													: 'rounded-bl-md bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100'
											}`}
										>
											{#if message.senderId !== auth.currentUser?.uid}
												<p class="mb-1 text-xs font-black text-blue-600 dark:text-blue-300">
													{participantById[message.senderId]?.displayName ?? 'Rally user'}
												</p>
											{/if}

											{message.text}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<form
						class="border-t border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
						onsubmit={(submitEvent) => {
							submitEvent.preventDefault();
							handleSendGroupMessage();
						}}
					>
						<div
							class="mx-auto flex max-w-3xl items-center gap-2 rounded-full bg-slate-100 px-3 py-2 dark:bg-slate-950"
						>
							<input
								bind:value={groupMessageText}
								placeholder="Message the group..."
								class="min-w-0 flex-1 border-0 bg-transparent px-2 text-sm text-slate-950 placeholder:text-slate-400 focus:ring-0 dark:text-white"
							/>

							<button
								type="submit"
								disabled={groupChatSending || !groupMessageText.trim()}
								class="rounded-full bg-blue-600 px-5 py-2 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-50"
							>
								{groupChatSending ? '...' : 'Send'}
							</button>
						</div>
					</form>
				</section>
			{/if}
		</div>

		<aside class="space-y-6">
			<section
				class="rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<div class="flex items-center justify-between gap-3">
					<h2 class="text-xl font-black text-slate-950 dark:text-white">Team status</h2>

					{#if isCreator && event.status !== 'cancelled'}
						<button
							type="button"
							onclick={handleCancelEvent}
							disabled={actionLoading}
							title="Cancel event"
							aria-label="Cancel event"
							class="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-xl font-black text-red-600 transition hover:bg-red-100 disabled:opacity-60 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
						>
							×
						</button>
					{:else if isParticipant && !isCreator && event.status !== 'cancelled'}
						<button
							type="button"
							onclick={handleLeaveEvent}
							disabled={actionLoading}
							title="Leave event"
							aria-label="Leave event"
							class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg font-black text-slate-600 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-red-950 dark:hover:text-red-300"
						>
							↩
						</button>
					{/if}
				</div>

				<div class="mt-5 rounded-3xl bg-blue-50 p-5 dark:bg-blue-950">
					<p class="text-4xl font-black text-blue-600 dark:text-blue-300">
						{event.participantIds.length}/{event.maxParticipants}
					</p>
					<p class="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">
						confirmed players
					</p>
				</div>

				{#if error}
					<div
						class="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
					>
						{error}
					</div>
				{/if}

				{#if event.status === 'cancelled'}
					<div
						class="mt-5 rounded-2xl bg-red-50 px-5 py-4 text-center font-black text-red-700 dark:bg-red-950 dark:text-red-300"
					>
						This event has been cancelled
					</div>
				{:else if isCreator}
					<div
						class="mt-5 rounded-2xl bg-blue-50 px-5 py-4 text-center font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300"
					>
						You are hosting this event
					</div>
				{:else if isParticipant}
					<div
						class="mt-5 rounded-2xl bg-green-50 px-5 py-4 text-center font-black text-green-700 dark:bg-green-950 dark:text-green-300"
					>
						You are joining this event
					</div>
				{:else if event.status === 'full'}
					<div
						class="mt-5 rounded-2xl bg-slate-100 px-5 py-4 text-center font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300"
					>
						Event full
					</div>
				{:else if canJoin}
					<button
						type="button"
						onclick={handleJoinEvent}
						disabled={actionLoading}
						class="mt-5 w-full rounded-2xl bg-blue-600 px-5 py-3 font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
					>
						{actionLoading ? 'Joining...' : 'Join event'}
					</button>
				{/if}

				{#if canInvite}
					<a
						href={resolve(`/events/${event.id}/invite`)}
						class="mt-3 block rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center font-black text-slate-700 transition hover:border-blue-200 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-400"
					>
						Invite people
					</a>
				{/if}
			</section>

			<section
				class="overflow-hidden rounded-4xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<div class="p-6">
					<p class="text-sm font-black uppercase tracking-[0.45em] text-blue-600 dark:text-blue-400">
						Location
					</p>
					<h2 class="mt-2 text-2xl font-black text-slate-950 dark:text-white">
						{event.location.name}
					</h2>

					{#if event.location.address}
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
							{event.location.address}
						</p>
					{/if}
				</div>

				{#if mapEmbedUrl}
					<iframe
						title="Event location map"
						src={mapEmbedUrl}
						class="h-72 w-full border-0"
						loading="lazy"
					></iframe>
				{:else}
					<div class="flex h-72 items-center justify-center bg-slate-100 dark:bg-slate-950">
						<div class="text-center">
							<p class="text-5xl">📍</p>
							<p class="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">
								Map location not available
							</p>
						</div>
					</div>
				{/if}
			</section>
		</aside>
	</div>
{/if}