<!-- src/routes/messages/convo/+page.svelte-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/firebase';
	import {
		getConversationById,
		getMessagesForConversation,
		sendMessage
	} from '$lib/services/chat.service';
	import { getUserProfile } from '$lib/services/user.service';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import type { ChatMessage, UserProfile } from '$lib/schema';

	let conversationId = $state('');
	let otherUser = $state<UserProfile | null>(null);
	let messages = $state<ChatMessage[]>([]);
	let text = $state('');
	let loading = $state(true);
	let sending = $state(false);
	let error = $state('');
	let messagesContainer: HTMLDivElement;

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
			const conversation = await getConversationById(id);

			if (!conversation) {
				error = 'Conversation not found.';
				return;
			}

			if (!conversation.memberIds.includes(currentUser.uid)) {
				error = 'You do not have access to this conversation.';
				return;
			}

			const otherUserId = conversation.memberIds.find((memberId) => memberId !== currentUser.uid);
			otherUser = otherUserId ? await getUserProfile(otherUserId) : null;

			messages = await getMessagesForConversation(id);
			await scrollToBottom();
		} catch (err) {
			console.error('Conversation load error:', err);
			error = err instanceof Error ? err.message : 'Could not load conversation.';
		} finally {
			loading = false;
		}
	}

	async function handleSendMessage() {
		const currentUser = auth.currentUser;

		if (!currentUser || !conversationId || !text.trim()) return;

		sending = true;
		error = '';

		try {
			await sendMessage({
				conversationId,
				senderId: currentUser.uid,
				text
			});

			text = '';
			messages = await getMessagesForConversation(conversationId);
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
			displayName={otherUser?.displayName}
			email={otherUser?.email}
			photoURL={otherUser?.photoURL}
			size="md"
		/>

		<div class="min-w-0 flex-1">
			<h1 class="truncate text-base font-black text-slate-950 dark:text-white">
				{otherUser?.displayName ?? 'Rally user'}
			</h1>

			<p class="truncate text-xs text-slate-500 dark:text-slate-400">
				@{otherUser?.rallyTag ?? 'rally'}
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
				{#each messages as message}
					<div
						class={`flex items-end gap-2 ${
							message.senderId === auth.currentUser?.uid ? 'justify-end' : 'justify-start'
						}`}
					>
						{#if message.senderId !== auth.currentUser?.uid}
							<UserAvatar
								displayName={otherUser?.displayName}
								email={otherUser?.email}
								photoURL={otherUser?.photoURL}
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