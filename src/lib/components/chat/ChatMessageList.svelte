<script lang="ts">
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import type { ChatMessage, UserProfile } from '$lib/schema';
	import { formatMessageTime, shouldShowMessageTime } from '$lib/utils/chat-time.utils';

	let {
		messages,
		currentUserId,
		getSenderProfile,
		typingLabel = '',
		showSenderName = false,
		onEditMessage,
		onDeleteMessage,
		onTogglePinMessage,
		pinnedMessageIds = []
	}: {
		messages: ChatMessage[];
		currentUserId: string | null | undefined;
		getSenderProfile: (senderId: string) => UserProfile | null | undefined;
		typingLabel?: string;
		showSenderName?: boolean;
		onEditMessage?: (message: ChatMessage) => void;
		onDeleteMessage?: (message: ChatMessage) => void;
		onTogglePinMessage?: (message: ChatMessage) => void;
		pinnedMessageIds?: string[];
	} = $props();

	let openMessageMenuId = $state('');
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressOpenedMessageId = '';

	function openMessageMenu(messageId: string) {
		if (longPressOpenedMessageId === messageId) {
			longPressOpenedMessageId = '';
			return;
		}

		openMessageMenuId = openMessageMenuId === messageId ? '' : messageId;
	}

	function startLongPress(messageId: string) {
		clearLongPress();
		longPressOpenedMessageId = '';
		longPressTimer = setTimeout(() => {
			openMessageMenuId = messageId;
			longPressOpenedMessageId = messageId;
			longPressTimer = null;
		}, 450);
	}

	function clearLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function finishLongPress() {
		clearLongPress();
	}

	function attachmentUrl(message: ChatMessage) {
		return message.attachmentURL ?? message.imageURL ?? null;
	}

	function attachmentName(message: ChatMessage) {
		return message.attachmentName ?? message.imageName ?? 'Attachment';
	}

	function attachmentContentType(message: ChatMessage) {
		return message.attachmentContentType ?? message.imageContentType ?? '';
	}
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-2">
	{#each messages as message, index (message.id)}
		{@const isOwnMessage = message.senderId === currentUserId}
		{@const sender = getSenderProfile(message.senderId)}
		{@const messageTime = formatMessageTime(message.createdAt)}
		{@const showMessageTime = shouldShowMessageTime(messages, index)}
		{@const isDeleted = Boolean(message.deletedAt)}
		{@const isPinned = pinnedMessageIds.includes(message.id)}
		{@const fileURL = attachmentUrl(message)}
		{@const fileName = attachmentName(message)}
		{@const fileType = attachmentContentType(message)}

		<div
			id={`chat-message-${message.id}`}
			class={`flex w-full flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}
		>
			<div
				role="group"
				class={`flex w-full items-end gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
				oncontextmenu={(event) => {
					event.preventDefault();
					if (!isDeleted) openMessageMenu(message.id);
				}}
				onpointerdown={() => !isDeleted && startLongPress(message.id)}
				onpointerup={finishLongPress}
				onpointerleave={clearLongPress}
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
					class={`group relative max-w-[88%] rounded-3xl px-4 py-2 text-sm leading-6 shadow-sm sm:max-w-[78%] ${
						isOwnMessage
							? 'rounded-br-md bg-blue-600 text-white'
							: 'rounded-bl-md bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100'
					}`}
				>
					{#if !isDeleted}
						<button
							type="button"
							onclick={() => openMessageMenu(message.id)}
							class={`absolute top-1 hidden h-7 w-7 items-center justify-center rounded-full text-xs opacity-0 shadow-sm transition group-hover:opacity-100 md:group-hover:flex ${
								isOwnMessage
									? 'left-1 bg-blue-700 text-white hover:bg-blue-800'
									: 'right-1 bg-white text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
							}`}
							aria-label="Message options"
						>
							⌄
						</button>

						{#if openMessageMenuId === message.id}
							<div
								class={`absolute top-8 z-20 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 text-sm text-slate-700 shadow-2xl shadow-slate-300/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:shadow-black/40 ${
									isOwnMessage ? 'right-0' : 'left-0'
								}`}
							>
								<button
									type="button"
									onclick={() => {
										onTogglePinMessage?.(message);
										openMessageMenuId = '';
									}}
									class="block w-full rounded-xl px-3 py-2 text-left font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
								>
									{isPinned ? 'Unpin message' : 'Pin message'}
								</button>

								{#if isOwnMessage && message.senderId !== 'rally-system'}
									<button
										type="button"
										onclick={() => {
											onEditMessage?.(message);
											openMessageMenuId = '';
										}}
										class="block w-full rounded-xl px-3 py-2 text-left font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
									>
										Edit
									</button>
									<button
										type="button"
										onclick={() => {
											onDeleteMessage?.(message);
											openMessageMenuId = '';
										}}
										class="block w-full rounded-xl px-3 py-2 text-left font-bold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
									>
										Delete
									</button>
								{/if}
							</div>
						{/if}
					{/if}

					{#if showSenderName && !isOwnMessage}
						<p class="mb-1 text-xs font-black text-blue-600 dark:text-blue-300">
							{sender?.displayName ?? 'Rally user'}
						</p>
					{/if}

					{#if isDeleted}
						<p class="italic opacity-75">Message deleted</p>
					{:else}
						{#if fileURL && fileType.startsWith('image/')}
							<a href={fileURL} target="_blank" rel="noreferrer" class="block">
								<img src={fileURL} alt={fileName} class="max-h-72 rounded-2xl object-cover" />
							</a>
						{:else if fileURL && fileType.startsWith('video/')}
							<video src={fileURL} controls class="max-h-72 rounded-2xl">
								<track kind="captions" />
							</video>
						{:else if fileURL}
							<a
								href={fileURL}
								target="_blank"
								rel="noreferrer"
								class={`flex items-center gap-3 rounded-2xl p-3 ${
									isOwnMessage
										? 'bg-blue-700/70 text-white'
										: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100'
								}`}
							>
								<span
									class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-lg font-black"
								>
									{fileType === 'application/pdf' ? 'PDF' : 'FILE'}
								</span>
								<span class="min-w-0 flex-1 truncate font-bold">{fileName}</span>
							</a>
						{/if}

						{#if message.text}
							<p class="whitespace-pre-wrap break-words {fileURL ? 'mt-2' : ''}">
								{message.text}
							</p>
						{/if}
					{/if}
				</div>
			</div>

			{#if showMessageTime && messageTime}
				<div
					class={`mt-1 flex items-center gap-2 text-[10px] leading-none text-slate-400 dark:text-slate-500 ${
						isOwnMessage ? 'mr-2 justify-end text-right' : 'ml-12 justify-start text-left'
					}`}
				>
					<span>
						{messageTime}{message.editedAt && !isDeleted ? ' · edited' : ''}
					</span>
				</div>
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
