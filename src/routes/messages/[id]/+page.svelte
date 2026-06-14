<!-- src/routes/messages/[id]/+page.svelte-->
<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
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
	import { getUserProfile } from '$lib/services/user.service';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import type { ChatConversation, ChatMessage, ChatTypingState, UserProfile } from '$lib/schema';
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

	let messagesContainer: HTMLDivElement;

	let unsubscribeMessages: Unsubscribe | null = null;
	let unsubscribeConversation: Unsubscribe | null = null;
	let typingTimeout: ReturnType<typeof setTimeout> | null = null;
	let lastTypingSentAt = 0;

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
	function updateTypingLabel(currentConversation: ChatConversation | null, currentUserId: string) {
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
			return;
		}

		typingLabel = `${activeTypingUsers.length} people are typing...`;
	}
	async function scrollToBottom() {
		await tick();

		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
			conversation = loadedConversation;

			if (!conversation) {
				error = 'Conversation not found.';
				return;
			}

			if (!conversation.memberIds.includes(currentUser.uid)) {
				error = 'You do not have access to this conversation.';
				return;
			}

			if (loadedConversation.type === 'group') {
				const profiles = await Promise.all(
					loadedConversation.memberIds.map(async (memberId) => {
						const profile = await getUserProfile(memberId);
						return profile;
					})
				);

				senderProfiles = Object.fromEntries(
					profiles.filter(Boolean).map((profile) => [profile!.id, profile!])
				);
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
					updateTypingLabel(liveConversation, currentUser.uid);
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
	class="flex h-[calc(100vh-5rem)] flex-col bg-white text-slate-950 dark:bg-slate-950 dark:text-white md:h-screen"
>
	<header
		class="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950"
	>
		<a
			href="/messages"
			class="flex h-10 w-10 items-center justify-center rounded-full text-xl font-bold transition hover:bg-slate-100 dark:hover:bg-slate-900"
			aria-label="Back to messages"
		>
			←
		</a>

		<UserAvatar
			displayName={conversation?.type === 'group' ? conversation.title : otherUser?.displayName}
			email={otherUser?.email}
			photoURL={conversation?.type === 'group' ? conversation.photoURL : otherUser?.photoURL}
			size="md"
		/>

		<div class="min-w-0 flex-1">
			<h1 class="truncate text-base font-black text-slate-950 dark:text-white">
				{conversation?.type === 'group'
					? conversation.title
					: otherUser?.displayName ?? 'Rally user'}
			</h1>

			<p class="truncate text-xs text-slate-500 dark:text-slate-400">
				{conversation?.type === 'group'
					? 'Event group'
					: `@${otherUser?.rallyTag ?? 'rally'}`}
			</p>
		</div>
	</header>

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
					<UserAvatar
						displayName={otherUser?.displayName}
						email={otherUser?.email}
						photoURL={otherUser?.photoURL}
						size="xl"
					/>

					<p class="mt-3 font-bold text-slate-700 dark:text-slate-200">
						No messages yet
					</p>

					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Send a message to {otherUser?.displayName ?? 'this friend'}.
					</p>
				</div>
			</div>
		{:else}
			<div class="mx-auto flex max-w-3xl flex-col gap-2">
				{#each messages as message (message.id)}
					<div
						class={`flex items-end gap-2 ${
							message.senderId === auth.currentUser?.uid ? 'justify-end' : 'justify-start'
						}`}
					>
						{#if message.senderId !== auth.currentUser?.uid}
							<UserAvatar
								displayName={conversation?.type === 'group'
									? senderProfiles[message.senderId]?.displayName
									: otherUser?.displayName}
								email={conversation?.type === 'group'
									? senderProfiles[message.senderId]?.email
									: otherUser?.email}
								photoURL={conversation?.type === 'group'
									? senderProfiles[message.senderId]?.photoURL
									: otherUser?.photoURL}
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
							{message.text}
						</div>
					</div>
				{/each}
			</div>
		{/if}
		{#if typingLabel}
			<div class="mx-auto mt-3 flex max-w-3xl justify-start">
				<div
					class="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-400"
				>
					{typingLabel}
				</div>
			</div>
		{/if}
	</section>

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
</main>