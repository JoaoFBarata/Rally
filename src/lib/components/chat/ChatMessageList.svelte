<script lang="ts">
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import type { ChatMessage, UserProfile } from '$lib/schema';
	import {
		formatMessageTime,
		shouldShowMessageTime
	} from '$lib/utils/chat-time.utils';

	let {
		messages,
		currentUserId,
		getSenderProfile,
		typingLabel = '',
		showSenderName = false
	}: {
		messages: ChatMessage[];
		currentUserId: string | null | undefined;
		getSenderProfile: (senderId: string) => UserProfile | null | undefined;
		typingLabel?: string;
		showSenderName?: boolean;
	} = $props();
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-2">
	{#each messages as message, index (message.id)}
		{@const isOwnMessage = message.senderId === currentUserId}
		{@const sender = getSenderProfile(message.senderId)}
		{@const messageTime = formatMessageTime(message.createdAt)}
		{@const showMessageTime = shouldShowMessageTime(messages, index)}

		<div class={`flex w-full flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}>
			<div
				class={`flex w-full items-end gap-2 ${
					isOwnMessage ? 'justify-end' : 'justify-start'
				}`}
			>
				{#if !isOwnMessage}
					<UserAvatar
						displayName={sender?.displayName}
						email={sender?.email}
						photoURL={sender?.photoURL}
						size="sm"
					/>
				{/if}

				<div
					class={`max-w-[88%] rounded-3xl px-4 py-2 text-sm leading-6 shadow-sm sm:max-w-[78%] ${
						isOwnMessage
							? 'rounded-br-md bg-blue-600 text-white'
							: 'rounded-bl-md bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100'
					}`}
				>
					{#if showSenderName && !isOwnMessage}
						<p class="mb-1 text-xs font-black text-blue-600 dark:text-blue-300">
							{sender?.displayName ?? 'Rally user'}
						</p>
					{/if}

					<p class="whitespace-pre-wrap break-words">
						{message.text}
					</p>
				</div>
			</div>

			{#if showMessageTime && messageTime}
				<p
					class={`mt-1 text-[10px] leading-none text-slate-400 dark:text-slate-500 ${
						isOwnMessage ? 'mr-2 text-right' : 'ml-12 text-left'
					}`}
				>
					{messageTime}
				</p>
			{/if}
		</div>
	{/each}

	{#if typingLabel}
		<div class="mt-3 flex justify-start">
			<div
				class="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-400"
			>
				{typingLabel}
			</div>
		</div>
	{/if}
</div>