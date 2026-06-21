<!-- src/routes/messages/[id]/+page.svelte-->
<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import {
		clearUserTyping,
		getConversationById,
		listenConversationById,
		listenMessagesForConversation,
		markConversationAsRead,
		sendMessage,
		setUserTyping
	} from '$lib/services/chat.service';
	import { getUserProfile, getUserProfilesByIds } from '$lib/services/user.service';
	import { getTournamentEntries } from '$lib/services/event.service';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import ChatMessageList from '$lib/components/chat/ChatMessageList.svelte';
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

	let messagesContainer = $state<HTMLElement | null>(null);
	let messageInput = $state<HTMLInputElement>();
	let unsubscribeMessages: Unsubscribe | null = null;
	let unsubscribeConversation: Unsubscribe | null = null;
	let typingTimeout: ReturnType<typeof setTimeout> | null = null;
	let lastTypingSentAt = 0;

	let isOrganizationChat = $derived(conversation?.type === 'organization_direct');
	let isRallySystemChat = $derived(conversation?.type === 'rally_system');
	let isGroupChat = $derived(
		conversation?.type === 'group' || conversation?.type === 'tournament_team'
	);

	let conversationTitle = $derived.by(() => {
		if (!conversation) return 'Messages';

		if (conversation.type === 'rally_system') return 'Rally';

		if (conversation.type === 'organization_direct') {
			return conversation.organizationName ?? conversation.title ?? 'Organization';
		}

		if (conversation.type === 'group') {
			return conversation.title ?? 'Event group';
		}

		if (conversation.type === 'tournament_team') {
			return conversation.title ?? 'Tournament team';
		}

		return otherUser?.displayName ?? 'Rally user';
	});

	let conversationSubtitle = $derived.by(() => {
		if (!conversation) return '';

		if (conversation.type === 'rally_system') return 'Activity & event updates';

		if (conversation.type === 'organization_direct') {
			return 'Organization inbox';
		}

		if (conversation.type === 'group') {
			return `Event group · ${conversation.memberIds.length} members`;
		}

		if (conversation.type === 'tournament_team') {
			const capacity = teamEntry?.maxMembers
				? `${conversation.memberIds.length}/${teamEntry.maxMembers}`
				: `${conversation.memberIds.length}`;
			return `Private team chat · ${capacity} players`;
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

	async function updateTypingLabel(currentConversation: ChatConversation | null, currentUserId: string) {
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

	async function loadGroupMetadata(currentConversation: ChatConversation) {
		if (
			currentConversation.type !== 'group' &&
			currentConversation.type !== 'tournament_team'
		) {
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

			if (
				loadedConversation.type === 'group' ||
				loadedConversation.type === 'tournament_team'
			) {
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
						if (
							liveConversation?.type === 'group' ||
							liveConversation?.type === 'tournament_team'
						) {
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
					error = listenerError.message;
				}
			);

			stopMessagesListener();

			unsubscribeMessages = listenMessagesForConversation(
				id,
				async (liveMessages) => {
					messages = liveMessages;

					await markConversationAsRead(id, currentUser.uid);
					await scrollToBottom();
				},
				(listenerError) => {
					console.error('Messages realtime error:', listenerError);
					error = listenerError.message;
				}
			);
			await focusMessageInput();
		} catch (err) {
			console.error('Conversation load error:', err);
			error = err instanceof Error ? err.message : 'Could not load conversation.';
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
			error = err instanceof Error ? err.message : 'Could not send message.';
		} finally {
			sending = false;
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

<main
	class="flex h-[calc(100dvh-5rem)] flex-col bg-white text-slate-950 dark:bg-slate-950 dark:text-white md:h-screen"
>
	<header
		class="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950"
	>
		<a
			href="/messages"
			class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl font-bold transition hover:bg-slate-100 dark:hover:bg-slate-900"
			aria-label="Back to messages"
		>
			←
		</a>

		{#if conversationProfileHref}
			<a
				href={conversationProfileHref}
				class="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1 transition hover:bg-slate-100 dark:hover:bg-slate-900"
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
								Company
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
						isGroupChat ? 'hover:bg-slate-100 dark:hover:bg-slate-900' : 'cursor-default'
					}`}
				>
				<div
					class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full {isRallySystemChat ? 'bg-blue-600 text-white' : 'bg-slate-100 text-blue-600 dark:bg-slate-800 dark:text-blue-300'} text-base font-black"
				>
					{#if isRallySystemChat}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5" aria-hidden="true">
							<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
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
						{#if isRallySystemChat}
							<span class="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white">
								Official
							</span>
						{/if}
					</div>

						<p class="truncate text-xs text-slate-500 dark:text-slate-400">
							{conversationSubtitle}
						</p>
					</div>
					{#if isGroupChat}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true">
							<path d="m9 18 6-6-6-6" />
						</svg>
					{/if}
				</button>
			{/if}
		</header>

	{#if showGroupInfo && conversation && isGroupChat}
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
			<section class="w-full max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-slate-900">
				<div class="border-b border-slate-100 p-6 dark:border-slate-800">
					<div class="flex items-start justify-between gap-4">
						<div class="flex min-w-0 items-center gap-4">
							<div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-100 text-xl font-black text-blue-600 dark:bg-blue-950 dark:text-blue-300">
								{#if conversationPhotoURL}
									<img src={conversationPhotoURL} alt={conversationTitle} class="h-full w-full object-cover" />
								{:else}
									{conversationTitle.charAt(0).toUpperCase()}
								{/if}
							</div>
							<div class="min-w-0">
								<h2 id="group-info-title" class="truncate text-xl font-black text-slate-950 dark:text-white">
									{conversationTitle}
								</h2>
								<p class="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
									{conversation.type === 'tournament_team'
										? `${conversation.memberIds.length}${teamEntry?.maxMembers ? `/${teamEntry.maxMembers}` : ''} players`
										: `${conversation.memberIds.length} members`}
								</p>
							</div>
						</div>
						<button type="button" onclick={() => (showGroupInfo = false)} class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700" aria-label="Close group information">×</button>
					</div>

					{#if conversation.eventId}
						<a href={resolve(`/events/${conversation.eventId}`)} class="mt-5 inline-flex items-center gap-2 text-sm font-black text-blue-600 transition hover:text-blue-700 dark:text-blue-400">
							View event details <span aria-hidden="true">→</span>
						</a>
					{/if}
				</div>

				<div class="max-h-[55vh] overflow-y-auto p-4 sm:p-6">
					<p class="px-2 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
						Members
					</p>
					<div class="mt-3 space-y-2">
						{#each conversation.memberIds as memberId (memberId)}
							{@const member = senderProfiles[memberId]}
							<div class="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/70">
								<UserAvatar photoURL={member?.photoURL} displayName={member?.displayName} email={member?.email} size="md" />
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-black text-slate-900 dark:text-white">
										{member?.displayName ?? 'Rally user'}{memberId === auth.currentUser?.uid ? ' (You)' : ''}
									</p>
									{#if member?.rallyTag}
										<p class="truncate text-xs text-slate-500 dark:text-slate-400">@{member.rallyTag}</p>
									{/if}
								</div>
								{#if conversation.type === 'tournament_team' && teamEntry?.captainId === memberId}
									<span class="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-blue-700 dark:bg-blue-950 dark:text-blue-300">Captain</span>
								{/if}
							</div>
						{/each}
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
		class="flex-1 overflow-y-auto bg-slate-50 px-4 py-5 dark:bg-slate-950"
	>
		{#if loading}
			<div class="flex h-full items-center justify-center text-sm text-slate-500">
				Loading conversation...
			</div>
		{:else if messages.length === 0}
			<div class="flex h-full items-center justify-center text-center">
				<div class="flex flex-col items-center">
					<div
						class="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-2xl font-black text-blue-600 dark:bg-slate-800 dark:text-blue-300"
					>
						{#if conversationPhotoURL}
							<img src={conversationPhotoURL} alt={conversationTitle} class="h-full w-full object-cover" />
						{:else}
							{conversationTitle.charAt(0).toUpperCase()}
						{/if}
					</div>

					<p class="mt-3 font-bold text-slate-700 dark:text-slate-200">
						No messages yet
					</p>

					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						{#if isOrganizationChat}
							Send a message to {conversationTitle}. They will receive it in their organization inbox.
						{:else if isGroupChat}
							Start the conversation with the group.
						{:else}
							Send a message to {otherUser?.displayName ?? 'this friend'}.
						{/if}
					</p>
				</div>
			</div>
		{:else}
			<ChatMessageList
				messages={messages}
				currentUserId={auth.currentUser?.uid}
				getSenderProfile={(senderId) => {
					if (senderId === 'rally-system') return { id: 'rally-system', displayName: 'Rally', email: null, photoURL: null } as never;
						if (isGroupChat) return senderProfiles[senderId];
						return otherUser;
					}}
					typingLabel={typingLabel}
					showSenderName={isGroupChat}
			/>
		{/if}
	</section>

	{#if isRallySystemChat}
		<div class="border-t border-slate-100 bg-white px-4 py-3 text-center dark:border-slate-800 dark:bg-slate-950">
			<p class="text-xs text-slate-400 dark:text-slate-500">
				This is your Rally activity feed. Updates are sent automatically.
			</p>
		</div>
	{:else}
		<form
			class="border-t border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950"
			onsubmit={(e) => {
				e.preventDefault();
				handleSendMessage();
			}}
		>
			<div
				class="mx-auto flex max-w-3xl items-center gap-2 rounded-full bg-slate-100 px-3 py-2 dark:bg-slate-900"
			>
				<input
					bind:this={messageInput}
					bind:value={text}
					oninput={handleTyping}
					placeholder="Message..."
					class="min-w-0 flex-1 border-0 bg-transparent px-2 text-sm text-slate-950 placeholder:text-slate-400 focus:ring-0 dark:text-white"
				/>

				<button
					type="submit"
					disabled={sending || !text.trim()}
					class="rounded-full bg-blue-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
				>
					{sending ? '...' : 'Send'}
				</button>
			</div>
		</form>
	{/if}
</main>
