<script lang="ts">
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import type { ChatMessage, UserProfile } from '$lib/schema';
	import { formatMessageTime, shouldShowMessageTime } from '$lib/utils/chat-time.utils';
	import { i18n } from '$lib/services/i18n.svelte';

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

	function closeMessageMenuOnOutsidePress(event: PointerEvent) {
		if (!openMessageMenuId) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('[data-message-menu]')) return;
		openMessageMenuId = '';
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

	function translateSystemMessage(text: string): string {
		const lang = i18n.currentLang;
		if (lang === 'en') return text;

		// 1. Welcome personal
		if (text === 'Welcome to Rally! You will receive event updates and more through this chat.') {
			return i18n.t('welcome_personal');
		}
		// 2. Welcome org
		if (text === 'Welcome to Rally! You will receive organization updates and event activity through this chat.') {
			return i18n.t('welcome_org');
		}

		// 3. You joined "event" on date at location.
		let match = text.match(/^You joined "(.+)" on (.+) at (.+)\.$/);
		if (match) {
			const [, eventTitle, eventDate, eventLocation] = match;
			if (lang === 'pt') return `Juntaste-te a "${eventTitle}" em ${eventDate} no local ${eventLocation}.`;
			if (lang === 'es') return `Te uniste a "${eventTitle}" el ${eventDate} en ${eventLocation}.`;
			if (lang === 'fr') return `Vous avez rejoint "${eventTitle}" le ${eventDate} à ${eventLocation}.`;
		}

		// 4. You left "event".
		match = text.match(/^You left "(.+)"\.$/);
		if (match) {
			const [, eventTitle] = match;
			if (lang === 'pt') return `Saíste de "${eventTitle}".`;
			if (lang === 'es') return `Saliste de "${eventTitle}".`;
			if (lang === 'fr') return `Vous avez quitté "${eventTitle}".`;
		}

		// 5. You were removed from "event" by the host.
		match = text.match(/^You were removed from "(.+)" by the host\.$/);
		if (match) {
			const [, eventTitle] = match;
			if (lang === 'pt') return `Foste removido de "${eventTitle}" pelo organizador.`;
			if (lang === 'es') return `Fuiste eliminado de "${eventTitle}" por el organizador.`;
			if (lang === 'fr') return `Vous avez été retiré de "${eventTitle}" par l'organisateur.`;
		}

		// 6. Promotion started for "event". You can follow its views, clicks and spend in the organization dashboard.
		match = text.match(/^Promotion started for "(.+)". You can follow its views, clicks and spend in the organization dashboard\.$/);
		if (match) {
			const [, eventTitle] = match;
			if (lang === 'pt') return `A promoção do evento "${eventTitle}" começou. Podes acompanhar as visualizações, cliques e gastos no painel da organização.`;
			if (lang === 'es') return `La promoción de "${eventTitle}" ha comenzado. Puedes seguir sus vistas, clics y gastos en el panel de la organización.`;
			if (lang === 'fr') return `La promotion a commencé pour "${eventTitle}". Vous pouvez suivre ses vues, clics et dépenses dans le tableau de bord de l'organisation.`;
		}

		// 7. Promotion ended for "event". Its final results remain available in the organization dashboard.
		match = text.match(/^Promotion ended for "(.+)". Its final results remain available in the organization dashboard\.$/);
		if (match) {
			const [, eventTitle] = match;
			if (lang === 'pt') return `A promoção do evento "${eventTitle}" terminou. Os resultados finais continuam disponíveis no painel da organização.`;
			if (lang === 'es') return `La promoción de "${eventTitle}" ha finalizado. Sus resultados finales siguen disponibles en el panel de la organización.`;
			if (lang === 'fr') return `La promotion est terminée pour "${eventTitle}". Ses résultats finaux restent disponibles dans le tableau de bord de l'organisation.`;
		}

		// 8. OrgName created "event" on date.
		match = text.match(/^(.+) created "(.+)" on (.+)\.$/);
		if (match) {
			const [, orgName, eventTitle, eventDate] = match;
			if (lang === 'pt') return `${orgName} criou o evento "${eventTitle}" em ${eventDate}.`;
			if (lang === 'es') return `${orgName} creó el evento "${eventTitle}" el ${eventDate}.`;
			if (lang === 'fr') return `${orgName} a créé l'événement "${eventTitle}" le ${eventDate}.`;
		}

		// 9. OrgName created "event".
		match = text.match(/^(.+) created "(.+)"\.$/);
		if (match) {
			const [, orgName, eventTitle] = match;
			if (lang === 'pt') return `${orgName} criou o evento "${eventTitle}".`;
			if (lang === 'es') return `${orgName} creó el evento "${eventTitle}".`;
			if (lang === 'fr') return `${orgName} a créé l'événement "${eventTitle}".`;
		}

		// 10. OrgName is promoting "event" in Rally.
		match = text.match(/^(.+) is promoting "(.+)" in Rally\.$/);
		if (match) {
			const [, orgName, eventTitle] = match;
			if (lang === 'pt') return `${orgName} está a promover "${eventTitle}" no Rally.`;
			if (lang === 'es') return `${orgName} está promocionando "${eventTitle}" en Rally.`;
			if (lang === 'fr') return `${orgName} fait la promotion de "${eventTitle}" sur Rally.`;
		}

		// 11. requesterName wants to join "event". Review the request on the event page.
		match = text.match(/^(.+) wants to join "(.+)". Review the request on the event page\.$/);
		if (match) {
			const [, requesterName, eventTitle] = match;
			if (lang === 'pt') return `${requesterName} quer juntar-se a "${eventTitle}". Revê o pedido na página do evento.`;
			if (lang === 'es') return `${requesterName} quiere unirse a "${eventTitle}". Revisa la solicitud en la página del evento.`;
			if (lang === 'fr') return `${requesterName} souhaite rejoindre "${eventTitle}". Vérifiez la demande sur la page de l'événement.`;
		}

		// 12. Your request to join "event" was approved. You're in!
		match = text.match(/^Your request to join "(.+)" was approved. You're in!$/);
		if (match) {
			const [, eventTitle] = match;
			if (lang === 'pt') return `O teu pedido para te juntares a "${eventTitle}" foi aprovado. Já estás dentro!`;
			if (lang === 'es') return `Tu solicitud para unirte a "${eventTitle}" fue aprobada. ¡Ya estás dentro!`;
			if (lang === 'fr') return `Votre demande pour rejoindre "${eventTitle}" a été approuvée. Vous y êtes !`;
		}

		// 13. Your request to join "event" was declined.
		match = text.match(/^Your request to join "(.+)" was declined\.$/);
		if (match) {
			const [, eventTitle] = match;
			if (lang === 'pt') return `O teu pedido para te juntares a "${eventTitle}" foi recusado.`;
			if (lang === 'es') return `Tu solicitud para unirte a "${eventTitle}" fue rechazada.`;
			if (lang === 'fr') return `Votre demande pour rejoindre "${eventTitle}" a été refusée.`;
		}

		return text;
	}
</script>

<div
	role="list"
	class="mx-auto flex max-w-3xl flex-col gap-2"
	onpointerdown={closeMessageMenuOnOutsidePress}
>
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
		{@const isMediaOnly =
			Boolean(fileURL) &&
			(fileType.startsWith('image/') || fileType.startsWith('video/')) &&
			!message.text}

		<div
			role="listitem"
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
					class={`group relative max-w-[88%] text-sm leading-6 sm:max-w-[78%] ${
						isMediaOnly
							? 'rounded-3xl bg-transparent p-0 shadow-none'
							: `rounded-3xl px-4 py-2 shadow-sm ${
									isOwnMessage
										? 'rounded-br-md bg-blue-600 text-white'
										: 'rounded-bl-md bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100'
								}`
					}`}
				>
					{#if !isDeleted}
						<button
							type="button"
							onclick={() => openMessageMenu(message.id)}
							data-message-menu
							class={`absolute top-1 hidden h-6 w-6 items-center justify-center rounded-full text-xs opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 md:group-hover:flex ${
								isOwnMessage
									? 'left-1 bg-blue-700/90 text-white hover:bg-blue-800'
									: 'right-1 bg-white/95 text-slate-500 ring-1 ring-slate-200 hover:text-slate-900 dark:bg-slate-800/95 dark:text-slate-300 dark:ring-slate-700 dark:hover:text-white'
							}`}
							aria-label={i18n.t('message_options')}
						>
							⌄
						</button>

						{#if openMessageMenuId === message.id}
							<div
								data-message-menu
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
									{isPinned ? i18n.t('unpin_message') : i18n.t('pin_message')}
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
										{i18n.t('edit')}
									</button>
									<button
										type="button"
										onclick={() => {
											onDeleteMessage?.(message);
											openMessageMenuId = '';
										}}
										class="block w-full rounded-xl px-3 py-2 text-left font-bold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
									>
										{i18n.t('delete')}
									</button>
								{/if}
							</div>
						{/if}
					{/if}

					{#if showSenderName && !isOwnMessage}
						<p class="mb-1 text-xs font-black text-blue-600 dark:text-blue-300">
							{sender?.displayName ?? i18n.t('rally_user')}
						</p>
					{/if}

					{#if isDeleted}
						<p class="italic opacity-75">{i18n.t('message_deleted')}</p>
					{:else}
						{#if fileURL && fileType.startsWith('image/')}
							<a href={fileURL} target="_blank" rel="noreferrer" class="block">
								<img
									src={fileURL}
									alt={fileName}
									class="block max-h-80 max-w-full rounded-3xl object-cover shadow-sm"
								/>
							</a>
						{:else if fileURL && fileType.startsWith('video/')}
							<video src={fileURL} controls class="block max-h-80 max-w-full rounded-3xl shadow-sm">
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
								{message.senderId === 'rally-system' ? translateSystemMessage(message.text) : message.text}
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
