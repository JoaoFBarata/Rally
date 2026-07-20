<!-- src/routes/messages/[id]/+page.svelte-->
<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { browser } from '$app/environment';
	import { auth } from '$lib/firebase';
	import {
		clearUserTyping,
		deleteMessageForEveryone,
		editMessage,
		getConversationById,
		listenConversationById,
		listenMessagesForConversation,
		markConversationAsRead,
		sendMessage,
		setUserTyping
	} from '$lib/services/chat.service';
	import { uploadChatFile } from '$lib/services/storage.service';
	import { getUserProfile, getUserProfilesByIds } from '$lib/services/user.service';
	import { getTournamentEntries } from '$lib/services/event.service';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import ChatMessageList from '$lib/components/chat/ChatMessageList.svelte';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { goBack } from '$lib/utils/navigation';
	import { i18n } from '$lib/services/i18n.svelte';
	import { TEXT_LIMITS } from '$lib/constants/text-limits';
	import type {
		ChatConversation,
		ChatMessage,
		ChatTypingState,
		TournamentEntry,
		UserProfile
	} from '$lib/schema';
	import type { Unsubscribe } from 'firebase/firestore';

	let conversation = $state<ChatConversation | null>(null);
	let senderProfiles = $state<Record<string, UserProfile>>({});

	let conversationId = $state('');
	let otherUser = $state<UserProfile | null>(null);
	let messages = $state<ChatMessage[]>([]);
	let text = $state('');
	let loading = $state(true);
	let sending = $state(false);
	let error = $state('');
	let typingLabel = $state('');
	let showGroupInfo = $state(false);
	let teamEntry = $state<TournamentEntry | null>(null);
	let editingMessage = $state<ChatMessage | null>(null);
	let imageSending = $state(false);
	let pinnedMessageIds = $state<string[]>([]);

	let messagesContainer = $state<HTMLElement | null>(null);
	let messageInput = $state<HTMLInputElement>();
	let imageInput = $state<HTMLInputElement>();
	let unsubscribeMessages: Unsubscribe | null = null;
	let unsubscribeConversation: Unsubscribe | null = null;
	let typingTimeout: ReturnType<typeof setTimeout> | null = null;
	let lastTypingSentAt = 0;

	let isOrganizationChat = $derived(conversation?.type === 'organization_direct');
	let isRallySystemChat = $derived(conversation?.type === 'rally_system');
	let isGroupChat = $derived(
		conversation?.type === 'group' || conversation?.type === 'tournament_team'
	);
	let displayedMessages = $derived.by(() => {
		const currentUserId = auth.currentUser?.uid;
		const clearedAt = currentUserId ? conversation?.clearedFor?.[currentUserId] : null;
		const clearedAtMs = timestampToMillis(clearedAt);

		if (!clearedAtMs) return messages;

		return messages.filter((message) => timestampToMillis(message.createdAt) > clearedAtMs);
	});
	let pinnedMessages = $derived(
		displayedMessages.filter(
			(message) => pinnedMessageIds.includes(message.id) && !message.deletedAt
		)
	);
	let pinnedPreviewMessage = $derived(pinnedMessages[0] ?? null);
	let attachmentMessages = $derived(
		displayedMessages.filter(
			(message) =>
				!message.deletedAt &&
				Boolean(message.attachmentURL ?? message.imageURL)
		)
	);

	let conversationTitle = $derived.by(() => {
		if (!conversation) return i18n.t('messages');

		if (conversation.type === 'rally_system') return 'Rally';

		if (conversation.type === 'organization_direct') {
			return conversation.organizationName ?? conversation.title ?? i18n.t('organization');
		}

		if (conversation.type === 'group') {
			return conversation.title ?? i18n.t('event_group');
		}

		if (conversation.type === 'tournament_team') {
			return conversation.title ?? i18n.t('tournament_team');
		}

		return otherUser?.displayName ?? i18n.t('rally_user');
	});

	let conversationSubtitle = $derived.by(() => {
		if (!conversation) return '';

		if (conversation.type === 'rally_system') return i18n.t('rally_chat_subtitle');

		if (conversation.type === 'organization_direct') {
			return i18n.t('org_chat_subtitle');
		}

		if (conversation.type === 'group') {
			return i18n.t('event_group_members', { count: conversation.memberIds.length });
		}

		if (conversation.type === 'tournament_team') {
			const capacity = teamEntry?.maxMembers
				? `${conversation.memberIds.length}/${teamEntry.maxMembers}`
				: `${conversation.memberIds.length}`;
			return i18n.t('private_team_chat_players', { capacity });
		}

		return `@${otherUser?.rallyTag ?? 'rally'}`;
	});

	let conversationPhotoURL = $derived.by(() => {
		if (!conversation) return null;

		if (conversation.type === 'organization_direct') {
			return conversation.organizationLogoURL ?? conversation.photoURL ?? null;
		}

		if (conversation.type === 'group' || conversation.type === 'tournament_team') {
			return conversation.photoURL ?? null;
		}

		return otherUser?.photoURL ?? null;
	});

	let conversationProfileHref = $derived.by(() => {
		if (!conversation) return null;

		if (conversation.type === 'organization_direct' && conversation.organizationId) {
			return `/organizations/${conversation.organizationId}`;
		}

		if (conversation.type === 'direct' && otherUser?.id) {
			return `/users/${otherUser.id}`;
		}

		return null;
	});

	const TYPING_REFRESH_MS = 2000;
	const TYPING_VISIBLE_MS = 5000;

	function stopMessagesListener() {
		if (unsubscribeMessages) {
			unsubscribeMessages();
			unsubscribeMessages = null;
		}
	}

	function stopConversationListener() {
		if (unsubscribeConversation) {
			unsubscribeConversation();
			unsubscribeConversation = null;
		}
	}

	function stopTypingTimeout() {
		if (typingTimeout) {
			clearTimeout(typingTimeout);
			typingTimeout = null;
		}
	}

	function timestampToMillis(value: unknown) {
		try {
			const timestamp = value as { toMillis?: () => number; toDate?: () => Date };

			if (timestamp?.toMillis) return timestamp.toMillis();
			if (timestamp?.toDate) return timestamp.toDate().getTime();

			return 0;
		} catch {
			return 0;
		}
	}

	function pinnedStorageKey(nextConversationId = conversationId) {
		return `rally:pinned-messages:${nextConversationId}`;
	}

	function loadPinnedMessages(nextConversationId: string) {
		if (!browser || !nextConversationId) return;

		try {
			pinnedMessageIds = JSON.parse(
				localStorage.getItem(pinnedStorageKey(nextConversationId)) ?? '[]'
			);
		} catch {
			pinnedMessageIds = [];
		}
	}

	function savePinnedMessages() {
		if (!browser || !conversationId) return;
		localStorage.setItem(pinnedStorageKey(), JSON.stringify(pinnedMessageIds));
	}

	function togglePinnedMessage(message: ChatMessage) {
		if (message.deletedAt) return;

		pinnedMessageIds = pinnedMessageIds.includes(message.id)
			? pinnedMessageIds.filter((id) => id !== message.id)
			: [message.id, ...pinnedMessageIds];
		savePinnedMessages();
	}

	function messageAttachmentName(message: ChatMessage) {
		return message.attachmentName ?? message.imageName ?? '';
	}

	function messagePreviewText(message: ChatMessage) {
		if (message.text) return message.text;
		if ((message.attachmentContentType ?? message.imageContentType ?? '').startsWith('image/')) {
			return 'Photo';
		}
		if ((message.attachmentContentType ?? '').startsWith('video/')) {
			return 'Video';
		}
		return messageAttachmentName(message) || 'Attachment';
	}

	async function scrollToMessage(messageId: string) {
		await tick();

		const target = document.getElementById(`chat-message-${messageId}`);

		if (target) {
			target.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	async function updateTypingLabel(
		currentConversation: ChatConversation | null,
		currentUserId: string
	) {
		const previousTypingLabel = typingLabel;

		if (!currentConversation?.typing) {
			typingLabel = '';
			return;
		}

		const now = Date.now();

		const activeTypingUsers = Object.values(currentConversation.typing).filter(
			(typingUser: ChatTypingState) => {
				if (typingUser.userId === currentUserId) return false;

				const updatedAt = timestampToMillis(typingUser.updatedAt);

				return updatedAt > 0 && now - updatedAt <= TYPING_VISIBLE_MS;
			}
		);

		if (activeTypingUsers.length === 0) {
			typingLabel = '';
			return;
		}

		if (activeTypingUsers.length === 1) {
			typingLabel = `${activeTypingUsers[0].displayName} is typing...`;
		} else {
			typingLabel = `${activeTypingUsers.length} people are typing...`;
		}

		if (typingLabel && typingLabel !== previousTypingLabel) {
			await scrollToBottom();
		}
	}

	async function scrollToBottom() {
		await tick();

		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	function isNearBottom() {
		if (!messagesContainer) return true;
		const threshold = 150;
		return (
			messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight <
			threshold
		);
	}

	async function loadGroupMetadata(currentConversation: ChatConversation) {
		if (currentConversation.type !== 'group' && currentConversation.type !== 'tournament_team') {
			return;
		}

		const profiles = await getUserProfilesByIds(currentConversation.memberIds);
		senderProfiles = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));

		if (
			currentConversation.type === 'tournament_team' &&
			currentConversation.eventId &&
			currentConversation.teamId
		) {
			const entries = await getTournamentEntries(currentConversation.eventId);
			teamEntry = entries.find((entry) => entry.id === currentConversation.teamId) ?? null;
		} else {
			teamEntry = null;
		}
	}

	async function loadConversation() {
		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto('/login');
			return;
		}

		const id = page.params.id;

		if (!id) {
			error = 'Conversation not found.';
			loading = false;
			return;
		}

		conversationId = id;
		loadPinnedMessages(id);
		loading = true;
		error = '';

		try {
			const loadedConversation = await getConversationById(id);

			if (!loadedConversation) {
				error = 'Conversation not found.';
				return;
			}

			conversation = loadedConversation;

			if (!loadedConversation.memberIds.includes(currentUser.uid)) {
				error = 'You do not have access to this conversation.';
				return;
			}

			if (loadedConversation.type === 'group' || loadedConversation.type === 'tournament_team') {
				await loadGroupMetadata(loadedConversation);
			} else {
				const otherUserId = loadedConversation.memberIds.find(
					(memberId) => memberId !== currentUser.uid
				);

				otherUser = otherUserId ? await getUserProfile(otherUserId) : null;
			}

			stopConversationListener();

			unsubscribeConversation = listenConversationById(
				id,
				(liveConversation) => {
					conversation = liveConversation;
					void updateTypingLabel(liveConversation, currentUser.uid);
					if (liveConversation?.type === 'group' || liveConversation?.type === 'tournament_team') {
						void loadGroupMetadata(liveConversation);
					}

					const hasUnreadForCurrentUser =
						liveConversation?.unreadFor?.includes(currentUser.uid) ||
						(liveConversation?.unreadCounts?.[currentUser.uid] ?? 0) > 0;

					if (hasUnreadForCurrentUser) {
						void markConversationAsRead(id, currentUser.uid);
					}
				},
				(listenerError) => {
					console.error('Conversation realtime error:', listenerError);
					error = getFriendlyErrorMessage(listenerError, 'Could not load conversation updates.');
				}
			);

			stopMessagesListener();

			unsubscribeMessages = listenMessagesForConversation(
				id,
				async (liveMessages) => {
					// Only auto-scroll when a genuinely new message arrives, not on
					// every snapshot (edits/deletes of older messages also trigger
					// this listener) — and only if it's the viewer's own message or
					// they're already near the bottom, so scrolling up to reread
					// history isn't yanked back down.
					const previousLastId = messages.at(-1)?.id;
					const wasNearBottom = isNearBottom();

					messages = liveMessages;

					await markConversationAsRead(id, currentUser.uid);

					const newLastMessage = liveMessages.at(-1);
					const isNewMessage = Boolean(newLastMessage) && newLastMessage?.id !== previousLastId;
					const isOwnMessage = newLastMessage?.senderId === currentUser.uid;

					if (isNewMessage && (isOwnMessage || wasNearBottom)) {
						await scrollToBottom();
					}
				},
				(listenerError) => {
					console.error('Messages realtime error:', listenerError);
					error = getFriendlyErrorMessage(listenerError, 'Could not load messages.');
				}
			);
			await focusMessageInput();
		} catch (err) {
			console.error('Conversation load error:', err);
			error = getFriendlyErrorMessage(err, 'Could not load conversation.');
		} finally {
			loading = false;
		}
	}

	function handleTyping(event: Event) {
		const currentUser = auth.currentUser;

		if (!currentUser || !conversationId) return;

		const value = (event.currentTarget as HTMLInputElement).value;
		const cleanValue = value.trim();

		stopTypingTimeout();

		if (!cleanValue) {
			lastTypingSentAt = 0;
			void clearUserTyping(conversationId, currentUser.uid);
			return;
		}

		const now = Date.now();

		if (now - lastTypingSentAt >= TYPING_REFRESH_MS) {
			lastTypingSentAt = now;

			void setUserTyping({
				conversationId,
				userId: currentUser.uid,
				displayName: currentUser.displayName ?? currentUser.email ?? 'Rally user'
			});
		}

		typingTimeout = setTimeout(() => {
			lastTypingSentAt = 0;
			void clearUserTyping(conversationId, currentUser.uid);
		}, TYPING_VISIBLE_MS);
	}

	async function clearCurrentUserTyping() {
		const currentUser = auth.currentUser;

		stopTypingTimeout();
		lastTypingSentAt = 0;

		if (!currentUser || !conversationId) return;

		await clearUserTyping(conversationId, currentUser.uid);
	}
	async function focusMessageInput() {
		await tick();

		if (messageInput) {
			messageInput.focus();
		}
	}
	async function handleSendMessage() {
		const currentUser = auth.currentUser;

		if (!currentUser || !conversationId || !text.trim()) return;

		sending = true;
		error = '';

		try {
			await clearCurrentUserTyping();

			await sendMessage({
				conversationId,
				senderId: currentUser.uid,
				text
			});

			text = '';
			await scrollToBottom();
		} catch (err) {
			console.error('Send message error:', err);
			error = getFriendlyErrorMessage(err, 'Could not send message.');
		} finally {
			sending = false;
		}
	}

	function beginEditMessage(message: ChatMessage) {
		if (message.senderId !== auth.currentUser?.uid || message.deletedAt) return;

		editingMessage = message;
		text = message.text;
		void focusMessageInput();
	}

	function cancelEditMessage() {
		editingMessage = null;
		text = '';
	}

	async function handleEditMessage() {
		const currentUser = auth.currentUser;

		if (!currentUser || !conversationId || !editingMessage || !text.trim()) return;

		sending = true;
		error = '';

		try {
			await editMessage({
				conversationId,
				messageId: editingMessage.id,
				userId: currentUser.uid,
				text
			});

			cancelEditMessage();
		} catch (err) {
			console.error('Edit message error:', err);
			error = getFriendlyErrorMessage(err, 'Could not edit message.');
		} finally {
			sending = false;
		}
	}

	async function handleDeleteMessage(message: ChatMessage) {
		const currentUser = auth.currentUser;

		if (!currentUser || !conversationId || message.senderId !== currentUser.uid) return;
		if (!confirm('Delete this message for everyone?')) return;

		error = '';

		try {
			await deleteMessageForEveryone({
				conversationId,
				messageId: message.id,
				userId: currentUser.uid,
				deletedPreviewText: i18n.t('message_deleted')
			});
		} catch (err) {
			console.error('Delete message error:', err);
			error = getFriendlyErrorMessage(err, 'Could not delete message.');
		}
	}

	async function handleFileSelected(event: Event) {
		const currentUser = auth.currentUser;
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];

		if (!currentUser || !conversationId || !file) return;

		imageSending = true;
		error = '';

		try {
			await clearCurrentUserTyping();

			const attachment = await uploadChatFile({
				conversationId,
				userId: currentUser.uid,
				file
			});

			await sendMessage({
				conversationId,
				senderId: currentUser.uid,
				text: '',
				attachmentURL: attachment.url,
				attachmentPath: attachment.path,
				attachmentName: file.name,
				attachmentContentType: file.type || 'application/octet-stream'
			});

			await scrollToBottom();
		} catch (err) {
			console.error('Send attachment error:', err);
			error = getFriendlyErrorMessage(err, 'Could not send attachment.');
		} finally {
			input.value = '';
			imageSending = false;
		}
	}

	onMount(() => {
		loadConversation();
	});

	onDestroy(() => {
		void clearCurrentUserTyping();

		stopMessagesListener();
		stopConversationListener();
		stopTypingTimeout();
});
</script>

<main class="flex h-dvh flex-col bg-[#eaeaea] text-black dark:bg-[#1E1E1E] dark:text-white">
	<header
		class="flex items-center gap-3 border-b border-slate-100 bg-[#eaeaea] px-4 py-3 dark:border-slate-800 dark:bg-[#1E1E1E]"
	>
		<button
			type="button"
			onclick={() => goBack(resolve('/messages'))}
			class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl font-bold transition hover:bg-slate-100 dark:hover:bg-[#242424]"
			aria-label={i18n.t('back_to_messages_aria')}
		>
			←
		</button>

		{#if conversationProfileHref}
			<a
				href={conversationProfileHref}
				class="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1 transition hover:bg-slate-100 dark:hover:bg-[#242424]"
			>
				<div
					class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-base font-black text-blue-600 dark:bg-slate-800 dark:text-blue-300"
				>
					{#if conversationPhotoURL}
						<img
							src={conversationPhotoURL}
							alt={conversationTitle}
							class="h-full w-full object-cover"
						/>
					{:else}
						{conversationTitle.charAt(0).toUpperCase()}
					{/if}
				</div>

				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<h1 class="truncate text-base font-black text-slate-950 dark:text-white">
							{conversationTitle}
						</h1>

						{#if isOrganizationChat}
							<span
								class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300"
							>
								{i18n.t('organization')}
							</span>
						{/if}
					</div>

					<p class="truncate text-xs text-slate-500 dark:text-slate-400">
						{conversationSubtitle}
					</p>
				</div>
			</a>
		{:else}
			<button
				type="button"
				disabled={!isGroupChat}
				onclick={() => (showGroupInfo = true)}
				class={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1 text-left transition ${
					isGroupChat ? 'hover:bg-slate-100 dark:hover:bg-[#242424]' : 'cursor-default'
				}`}
			>
				<div
					class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full {isRallySystemChat
						? 'bg-blue-600 text-white'
						: 'bg-slate-100 text-blue-600 dark:bg-slate-800 dark:text-blue-300'} text-base font-black"
				>
					{#if isRallySystemChat}
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-5 w-5"
							aria-hidden="true"
						>
							<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
						</svg>
					{:else}
						{conversationTitle.charAt(0).toUpperCase()}
					{/if}
				</div>

			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<h1 class="truncate text-base font-black text-slate-950 dark:text-white">
						{conversationTitle}
					</h1>
					{#if isOrganizationChat}
						<span class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">{i18n.t('organization')}</span>
					{:else if isRallySystemChat}
						<span class="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white">{i18n.t('official')}</span>
					{/if}
				</div>

				<p class="truncate text-xs text-slate-500 dark:text-slate-400">
					{conversationSubtitle}
				</p>
			</div>

			{#if !isRallySystemChat}
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true">
					<path d="m9 18 6-6-6-6" />
				</svg>
			{/if}
		</button>
		{/if}
	</header>

	{#if pinnedPreviewMessage}
		<button
			type="button"
			onclick={() => scrollToMessage(pinnedPreviewMessage.id)}
			class="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-2 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
			aria-label={i18n.t('pinned')}
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.3"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400"
				aria-hidden="true"
			>
				<path d="m14 4 6 6-4 1-5 5v4h-2v-4l-5-5 1-1 5 1 5-5z" />
			</svg>
			<p class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
				{messagePreviewText(pinnedPreviewMessage)}
			</p>
			<span class="text-xs font-black text-slate-400 dark:text-slate-500">
				{pinnedMessages.length > 1 ? i18n.t('pinned_count', { count: pinnedMessages.length }) : i18n.t('pinned')}
			</span>
		</button>
	{/if}

	{#if showGroupInfo && conversation && !isRallySystemChat}
		<dialog
			open
			class="fixed inset-0 z-[120] m-0 flex h-full w-full max-w-none items-end justify-center border-0 bg-slate-950/55 px-4 pb-4 backdrop-blur-sm sm:items-center sm:pb-0"
			onclick={(event) => {
				if (event.target === event.currentTarget) showGroupInfo = false;
			}}
			onkeydown={(event) => {
				if (event.key === 'Escape') showGroupInfo = false;
			}}
			aria-labelledby="group-info-title"
		>
			<section
				class="w-full max-w-lg overflow-hidden rounded-4xl bg-white shadow-2xl dark:bg-[#161616]"
			>
				<div class="border-b border-slate-100 p-6 dark:border-slate-800">
					<div class="flex items-start justify-between gap-4">
						<div class="flex min-w-0 items-center gap-4">
							<div
								class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-100 text-xl font-black text-blue-600 dark:bg-blue-950 dark:text-blue-300"
							>
								{#if conversationPhotoURL}
									<img
										src={conversationPhotoURL}
										alt={conversationTitle}
										class="h-full w-full object-cover"
									/>
								{:else}
									{conversationTitle.charAt(0).toUpperCase()}
								{/if}
							</div>
							<div class="min-w-0">
								<h2
									id="group-info-title"
									class="truncate text-xl font-black text-slate-950 dark:text-white"
								>
									{conversationTitle}
								</h2>
								<p class="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
									{conversation.type === 'tournament_team'
										? i18n.t('private_team_chat_players', { capacity: teamEntry?.maxMembers ? `${conversation.memberIds.length}/${teamEntry.maxMembers}` : `${conversation.memberIds.length}` })
										: i18n.t('event_group_members', { count: conversation.memberIds.length })}
								</p>
							</div>
						</div>
						<button
							type="button"
							onclick={() => (showGroupInfo = false)}
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
							aria-label={i18n.t('close_group_info_aria')}>×</button
						>
					</div>

					{#if conversation.eventId}
						<a
							href={resolve(`/events/${conversation.eventId}`)}
							class="mt-5 inline-flex items-center gap-2 text-sm font-black text-blue-600 transition hover:text-blue-700 dark:text-blue-400"
						>
							{i18n.t('view_event_details')} <span aria-hidden="true">→</span>
						</a>
					{/if}

					{#if conversationProfileHref}
						<a
							href={conversationProfileHref}
							class="mt-5 inline-flex items-center gap-2 text-sm font-black text-blue-600 transition hover:text-blue-700 dark:text-blue-400"
						>
							{i18n.t('view_profile')} <span aria-hidden="true">→</span>
						</a>
					{/if}
				</div>

				<div class="max-h-[55vh] overflow-y-auto p-4 sm:p-6">
					{#if isGroupChat}
						<p class="px-2 text-xs font-black uppercase tracking-[0.2em] text-slate-400">{i18n.t('members')}</p>
						<div class="mt-3 space-y-2">
							{#each conversation.memberIds as memberId (memberId)}
								{@const member = senderProfiles[memberId]}
								<a
									href={resolve(`/users/${memberId}`)}
									class="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/70"
								>
									<UserAvatar
										photoURL={member?.photoURL}
										displayName={member?.displayName}
										email={member?.email}
										size="md"
									/>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-black text-slate-900 dark:text-white">
											{member?.displayName ?? i18n.t('rally_user')}{memberId === auth.currentUser?.uid
												? ` (${i18n.t('you_label')})`
												: ''}
										</p>
										{#if member?.rallyTag}
											<p class="truncate text-xs text-slate-500 dark:text-slate-400">
												@{member.rallyTag}
											</p>
										{/if}
									</div>
									{#if conversation.type === 'tournament_team' && teamEntry?.captainId === memberId}
										<span
											class="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-blue-700 dark:bg-blue-950 dark:text-blue-300"
											>Captain</span
										>
									{/if}
								</a>
							{/each}
						</div>
					{/if}

					<div class={isGroupChat ? 'mt-6 border-t border-slate-100 pt-5 dark:border-slate-800' : ''}>
						<div class="flex items-center justify-between gap-3 px-2">
							<p class="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{i18n.t('files')}</p>
							<span class="text-xs font-bold text-slate-400">{attachmentMessages.length}</span>
						</div>
						{#if attachmentMessages.length}
							<div class="mt-3 grid grid-cols-3 gap-2">
								{#each attachmentMessages.slice(0, 9) as message (message.id)}
									<a
										href={message.attachmentURL ?? message.imageURL ?? '#'}
										target="_blank"
										rel="noopener noreferrer"
										class="group aspect-square overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200 transition hover:ring-blue-300 dark:bg-slate-800 dark:ring-slate-700"
									>
										{#if (message.attachmentContentType ?? message.imageContentType)?.startsWith('image/')}
											<img
												src={message.attachmentURL ?? message.imageURL ?? ''}
												alt={message.attachmentName ?? message.imageName ?? 'Attachment'}
												class="h-full w-full object-cover"
											/>
										{:else}
											<div class="flex h-full flex-col items-center justify-center p-2 text-center">
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="h-6 w-6 text-blue-600 dark:text-blue-300" aria-hidden="true">
													<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
													<path d="M14 2v6h6" />
												</svg>
												<p class="mt-1 line-clamp-2 text-[10px] font-bold text-slate-500 dark:text-slate-300">
													{message.attachmentName ?? message.imageName ?? 'File'}
												</p>
											</div>
										{/if}
									</a>
								{/each}
							</div>
						{:else}
							<div class="mt-3 rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm font-semibold text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
								{i18n.t('no_files_shared_yet')}
							</div>
						{/if}
					</div>
				</div>
			</section>
		</dialog>
	{/if}

	{#if error}
		<div
			class="mx-5 mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
		>
			{error}
		</div>
	{/if}

	<section
		bind:this={messagesContainer}
		class="flex-1 overflow-y-auto bg-white px-4 py-5 dark:bg-[#161616]"
	>
		{#if loading}
			<div class="flex h-full items-center justify-center text-sm text-slate-500">
				{i18n.t('loading_conversation')}
			</div>
		{:else if displayedMessages.length === 0}
			<div class="flex h-full items-center justify-center text-center">
				<div class="flex flex-col items-center">
					<div
						class="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-2xl font-black text-blue-600 dark:bg-slate-800 dark:text-blue-300"
					>
						{#if conversationPhotoURL}
							<img
								src={conversationPhotoURL}
								alt={conversationTitle}
								class="h-full w-full object-cover"
							/>
						{:else}
							{conversationTitle.charAt(0).toUpperCase()}
						{/if}
					</div>

					<p class="mt-3 font-bold text-slate-700 dark:text-slate-200">{i18n.t('no_messages_yet')}</p>

					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						{#if isOrganizationChat}
							{i18n.t('org_chat_first_message_msg', { title: conversationTitle })}
						{:else if isGroupChat}
							{i18n.t('group_chat_first_message_msg')}
						{:else}
							{i18n.t('direct_chat_first_message_msg', { name: otherUser?.displayName ?? i18n.t('this_friend') })}
						{/if}
					</p>
				</div>
			</div>
		{:else}
			<ChatMessageList
				messages={displayedMessages}
				currentUserId={auth.currentUser?.uid}
				getSenderProfile={(senderId) => {
					if (senderId === 'rally-system')
						return {
							id: 'rally-system',
							displayName: 'Rally',
							email: null,
							photoURL: null
						} as never;
					if (isGroupChat) return senderProfiles[senderId];
					return otherUser;
				}}
				{typingLabel}
				showSenderName={isGroupChat}
				onEditMessage={beginEditMessage}
				onDeleteMessage={handleDeleteMessage}
				onTogglePinMessage={togglePinnedMessage}
				{pinnedMessageIds}
			/>
		{/if}
	</section>

	{#if isRallySystemChat}
		<div
			class="border-t border-slate-100 bg-[#f6f6f6] px-4 py-3 text-center dark:border-slate-800 dark:bg-[#242424]"
		>
			<p class="text-xs text-black dark:text-white">
				{i18n.t('activity_feed_note')}
			</p>
		</div>
	{:else}
		<form
			class="border-t border-slate-100 bg-[#f6f6f6] px-4 py-3 dark:border-slate-800 dark:bg-[#242424]"
			onsubmit={(e) => {
				e.preventDefault();
				if (editingMessage) {
					handleEditMessage();
				} else {
					handleSendMessage();
				}
			}}
		>
			{#if editingMessage}
				<div
					class="mx-auto mb-2 flex max-w-3xl items-center justify-between gap-3 rounded-2xl bg-blue-50 px-4 py-2 text-sm text-blue-700 dark:bg-blue-950/50 dark:text-blue-200"
				>
					<span class="min-w-0 truncate font-semibold">{i18n.t('editing_message')}</span>
					<button
						type="button"
						onclick={cancelEditMessage}
						class="shrink-0 font-black hover:text-blue-950 dark:hover:text-white"
					>
						{i18n.t('cancel')}
					</button>
				</div>
			{/if}

			<div
				class="mx-auto flex max-w-3xl items-center gap-2 rounded-full bg-[#EAEAEA] px-3 py-2 dark:bg-[#1E1E1E]"
			>
				<input bind:this={imageInput} type="file" class="hidden" onchange={handleFileSelected} />

				<button
					type="button"
					onclick={() => imageInput?.click()}
					disabled={sending || imageSending || Boolean(editingMessage)}
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-blue-600 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-300"
					aria-label="Send attachment"
				>
					{#if imageSending}
						<span
							class="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600"
						></span>
					{:else}
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-5 w-5"
							aria-hidden="true"
						>
							<rect x="3" y="3" width="18" height="18" rx="3" />
							<circle cx="8.5" cy="8.5" r="1.5" />
							<path d="m21 15-5-5L5 21" />
						</svg>
					{/if}
				</button>

				<input
					bind:this={messageInput}
					bind:value={text}
					oninput={handleTyping}
					maxlength={TEXT_LIMITS.chatMessage}
					placeholder={editingMessage ? i18n.t('edit_message_placeholder') : i18n.t('message_placeholder')}
					class="min-w-0 flex-1 border-0 bg-transparent px-2 text-sm text-slate-950 placeholder:text-slate-400 focus:ring-0 dark:text-white"
				/>

				<button
					type="submit"
					disabled={sending || !text.trim()}
					class="rounded-full bg-blue-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
				>
					{sending ? '...' : editingMessage ? i18n.t('save') : i18n.t('send')}
				</button>
			</div>
		</form>
	{/if}
</main>
