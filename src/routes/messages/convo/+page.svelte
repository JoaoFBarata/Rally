<!-- src/routes/messages/convo/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/firebase';
	import {
		getMessagesForConversation,
		sendMessage
	} from '$lib/services/chat.service';
	import type { ChatMessage } from '$lib/schema';

	let conversationId = $state('');
	let messages = $state<ChatMessage[]>([]);
	let text = $state('');
	let loading = $state(true);
	let sending = $state(false);
	let error = $state('');

	async function loadMessages() {
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

		try {
			messages = await getMessagesForConversation(id);
		} catch (err) {
			console.error('Conversation load error:', err);
			error = err instanceof Error ? err.message : 'Could not load conversation.';
		} finally {
			loading = false;
		}
	}

	async function handleSendMessage() {
		const currentUser = auth.currentUser;

		if (!currentUser || !conversationId) return;

		sending = true;
		error = '';

		try {
			await sendMessage({
				conversationId,
				senderId: currentUser.uid,
				text
			});

			text = '';
			await loadMessages();
		} catch (err) {
			console.error('Send message error:', err);
			error = err instanceof Error ? err.message : 'Could not send message.';
		} finally {
			sending = false;
		}
	}

	onMount(() => {
		loadMessages();
	});
</script>

<main class="mx-auto flex min-h-screen max-w-4xl flex-col px-5 py-6">
	<header class="mb-6 flex items-center justify-between gap-4">
		<div>
			<a href="/messages" class="text-sm font-bold text-blue-600">← Back to messages</a>
			<h1 class="mt-2 text-3xl font-black text-slate-950">Conversation</h1>
		</div>
	</header>

	{#if error}
		<div class="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
			{error}
		</div>
	{/if}

	<section class="flex min-h-[520px] flex-1 flex-col rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
		{#if loading}
			<div class="flex flex-1 items-center justify-center text-slate-500">
				Loading conversation...
			</div>
		{:else}
			<div class="flex-1 space-y-3 overflow-y-auto pb-5">
				{#if messages.length === 0}
					<div class="flex h-full items-center justify-center text-center">
						<div>
							<p class="text-4xl">💬</p>
							<p class="mt-2 font-bold text-slate-700">No messages yet</p>
							<p class="mt-1 text-sm text-slate-500">Send the first message.</p>
						</div>
					</div>
				{:else}
					{#each messages as message}
						<div
							class={`flex ${
								message.senderId === auth.currentUser?.uid ? 'justify-end' : 'justify-start'
							}`}
						>
							<div
								class={`max-w-[75%] rounded-3xl px-4 py-3 text-sm ${
									message.senderId === auth.currentUser?.uid
										? 'bg-blue-600 text-white'
										: 'bg-slate-100 text-slate-800'
								}`}
							>
								{message.text}
							</div>
						</div>
					{/each}
				{/if}
			</div>

			<form
				class="flex gap-2 border-t border-slate-100 pt-4"
				onsubmit={(e) => {
					e.preventDefault();
					handleSendMessage();
				}}
			>
				<input
					bind:value={text}
					placeholder="Write a message..."
					class="min-w-0 flex-1 rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500"
				/>

				<button
					type="submit"
					disabled={sending || !text.trim()}
					class="rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
				>
					{sending ? 'Sending...' : 'Send'}
				</button>
			</form>
		{/if}
	</section>
</main>