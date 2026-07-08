<!-- src/routes/events/[id]/+page.svelte -->
<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import {
		PROMOTION_PLANS,
		PROMOTION_COUNTRIES,
		cancelEvent,
		calculatePromotionStats,
		ensureEventGroupConversation,
		finishEvent,
		getEventById,
		getEventGroupConversationId,
		getEffectiveEventStatus,
		isEventFinished,
		isPromotionActive,
		joinEvent,
		leaveEvent,
		notifyEventFinished,
		promoteEvent,
		removeParticipantFromEvent,
		stopEventPromotion,
		updateEventGroupPhoto
	} from '$lib/services/event.service';
	import {
		listenJoinRequestForUser,
		listenJoinRequestsForEvent,
		requestToJoinEvent,
		respondToJoinRequest
	} from '$lib/services/join-request.service';
	import {
		clearUserTyping,
		listenConversationById,
		listenMessagesForConversation,
		sendMessage,
		setUserTyping
	} from '$lib/services/chat.service';
	import { getUserProfilesByIds } from '$lib/services/user.service';
	import EventMap from '$lib/components/maps/EventMap.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import EventWeather from '$lib/components/EventWeather.svelte';
	import type {
		ChatConversation,
		ChatMessage,
		EventJoinRequest,
		SportEvent,
		UserProfile,
		EventPromotionPlan
	} from '$lib/schema';
	import { uploadEventGroupPhoto } from '$lib/services/storage.service';
	import { subscribeToEventChanges } from '$lib/services/realtime.service';
	import type { Unsubscribe } from 'firebase/firestore';
	import ChatMessageList from '$lib/components/chat/ChatMessageList.svelte';
	import { getTypingLabel } from '$lib/utils/chat-typing.utils';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { goBack } from '$lib/utils/navigation';
	import { getOrCreateOrganizationConversation } from '$lib/services/chat.service';
	import TournamentPanel from '$lib/components/tournaments/TournamentPanel.svelte';

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
	let groupTypingLabel = $state('');
	let unsubscribeGroupMessages: Unsubscribe | null = null;
	let unsubscribeGroupConversation: Unsubscribe | null = null;
	let groupTypingTimeout: ReturnType<typeof setTimeout> | null = null;
	let groupLastTypingSentAt = 0;

	let myJoinRequest = $state<EventJoinRequest | null>(null);
	let pendingJoinRequests = $state<EventJoinRequest[]>([]);
	let pendingRequesters = $state<UserProfile[]>([]);
	let joinRequestActionLoading = $state(false);
	let unsubscribeMyJoinRequest: Unsubscribe | null = null;
	let unsubscribeJoinRequests: Unsubscribe | null = null;

	type ConfirmDialogConfig = {
		title: string;
		message: string;
		confirmLabel: string;
		danger: boolean;
		resolve: (value: boolean) => void;
	};

	let confirmDialog = $state<ConfirmDialogConfig | null>(null);

	function showConfirm(opts: {
		title: string;
		message: string;
		confirmLabel?: string;
		danger?: boolean;
	}): Promise<boolean> {
		return new Promise((resolve) => {
			confirmDialog = {
				title: opts.title,
				message: opts.message,
				confirmLabel: opts.confirmLabel ?? 'Confirm',
				danger: opts.danger ?? false,
				resolve
			};
		});
	}

	function dismissConfirm(result: boolean) {
		confirmDialog?.resolve(result);
		confirmDialog = null;
	}

	let showPromoteModal = $state(false);
	let promoting = $state(false);
	let stoppingPromotion = $state(false);

	let promotionPlan = $state<EventPromotionPlan>('local');
	let promotionBudget = $state('15');
	let promotionDurationDays = $state('7');
	let promotionTargetCity = $state('');
	let promotionTargetCountry = $state('PT');
	let stopEventListener = () => {};

	let effectiveStatus = $derived.by(() => {
		return event ? getEffectiveEventStatus(event) : 'draft';
	});
	const TYPING_REFRESH_MS = 2000;
	const TYPING_VISIBLE_MS = 5000;
	let isCreator = $derived.by(() => {
		const currentUser = auth.currentUser;
		return !!currentUser && !!event && event.creatorId === currentUser.uid;
	});

	let isParticipant = $derived.by(() => {
		const currentUser = auth.currentUser;
		return !!currentUser && !!event && event.participantIds.includes(currentUser.uid);
	});

	let isTournament = $derived(event?.eventKind === 'tournament');

	let canAccessGroupChat = $derived.by(() => {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return false;

		return event.creatorId === currentUser.uid || event.participantIds.includes(currentUser.uid);
	});

	let canJoin = $derived.by(() => {
		return (
			!!event &&
			event.eventKind !== 'tournament' &&
			(event.joinPolicy ?? 'open') === 'open' &&
			!isCreator &&
			!isParticipant &&
			effectiveStatus !== 'full' &&
			effectiveStatus !== 'cancelled' &&
			effectiveStatus !== 'finished'
		);
	});

	let hasPendingJoinRequest = $derived(myJoinRequest?.status === 'pending');

	let canRequestJoin = $derived.by(() => {
		return (
			!!event &&
			event.eventKind !== 'tournament' &&
			event.joinPolicy === 'approval' &&
			!isCreator &&
			!isParticipant &&
			!hasPendingJoinRequest &&
			effectiveStatus !== 'full' &&
			effectiveStatus !== 'cancelled' &&
			effectiveStatus !== 'finished'
		);
	});

	let canInvite = $derived.by(() => {
		return (
			!!event &&
			event.eventKind !== 'tournament' &&
			effectiveStatus !== 'cancelled' &&
			effectiveStatus !== 'finished' &&
			(isCreator || isParticipant)
		);
	});

	let participantById = $derived.by(() => {
		return Object.fromEntries(
			participants.map((participant) => [participant.id, participant])
		) as Record<string, UserProfile>;
	});

	let contactLoading = $state(false);

	let promotionPlanOptions = $derived(
		Object.entries(PROMOTION_PLANS) as [
			EventPromotionPlan,
			(typeof PROMOTION_PLANS)[EventPromotionPlan]
		][]
	);

	let selectedPromotionPlan = $derived(PROMOTION_PLANS[promotionPlan]);

	let promotionImpressionsPreview = $derived.by(() => {
		const budget = Number(promotionBudget);
		const cpm = selectedPromotionPlan.cpm;

		if (!budget || !cpm) return 0;

		return Math.floor((budget / cpm) * 1000);
	});

	let promotionStats = $derived(event ? calculatePromotionStats(event) : null);

	let canPromoteThisEvent = $derived.by(() => {
		const currentUser = auth.currentUser;

		return (
			!!currentUser &&
			!!event &&
			event.hostType === 'organization' &&
			!!event.organizationId &&
			event.creatorId === currentUser.uid
		);
	});


	let hostProfile = $derived.by(() => {
		if (!event) return null;
		return participants.find((participant) => participant.id === event?.creatorId) ?? null;
	});

	let currentUserId = $derived(auth.currentUser?.uid ?? '');
	let canContactOrganizer = $derived.by(() => {
		const user = auth.currentUser;

		if (!user || !event?.organizationId) return false;
		if (event.creatorId === user.uid) return false;

		return true;
	});

	let canManageTournament = $derived.by(() => {
		const user = auth.currentUser;

		if (!user || !event) return false;

		return event.creatorId === user.uid;
	});

	async function contactOrganizer() {
		const user = auth.currentUser;

		if (!user || !event?.organizationId) return;

		contactLoading = true;
		error = '';

		try {
			const conversationId = await getOrCreateOrganizationConversation({
				organizationId: event.organizationId,
				userId: user.uid,
				currentUserId: user.uid
			});

			await goto(resolve(`/messages/${conversationId}`));
		} catch (err) {
			console.error('Contact organizer error:', err);
			error = getFriendlyErrorMessage(err, 'Could not contact organizer.');
		} finally {
			contactLoading = false;
		}
	}

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

	function formatShortDate(dateValue: unknown) {
		const date = timestampToDate(dateValue);
		if (!date) return 'Date not set';

		return date.toLocaleDateString('en-GB', {
			weekday: 'short',
			day: '2-digit',
			month: 'short'
		});
	}

	function formatShortTime(dateValue: unknown) {
		const date = timestampToDate(dateValue);
		if (!date) return 'Time not set';

		return date.toLocaleTimeString('en-GB', {
			hour: '2-digit',
			minute: '2-digit'
		});
	}


	function timestampToDate(value: unknown): Date | null {
		try {
			const timestamp = value as { toDate?: () => Date };
			const date = timestamp?.toDate?.();
			return date && !Number.isNaN(date.getTime()) ? date : null;
		} catch {
			return null;
		}
	}

	function formatEventDuration(currentEvent: SportEvent) {
		const start = timestampToDate(currentEvent.startAt);
		const end = timestampToDate(currentEvent.endAt);
		if (!start || !end || end <= start) return 'Not set';

		const totalMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;

		if (!hours) return `${minutes} min`;
		if (!minutes) return `${hours}h`;
		return `${hours}h ${minutes}min`;
	}

	function formatPriceLabel(currentEvent: SportEvent) {
		if (currentEvent.pricePerPerson) return `€${currentEvent.pricePerPerson.toFixed(2)} per person`;
		if (currentEvent.priceTotal) return `€${currentEvent.priceTotal.toFixed(2)} total`;
		return 'Free / not defined';
	}

	function stopGroupMessagesListener() {
		if (unsubscribeGroupMessages) {
			unsubscribeGroupMessages();
			unsubscribeGroupMessages = null;
		}
	}

	async function scrollGroupChatToBottom() {
		await tick();

		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	async function updateGroupTypingLabel(
		currentConversation: ChatConversation | null,
		currentUserId: string
	) {
		const previousTypingLabel = groupTypingLabel;

		groupTypingLabel = getTypingLabel(
			currentConversation?.typing,
			currentUserId,
			TYPING_VISIBLE_MS
		);

		if (groupTypingLabel && groupTypingLabel !== previousTypingLabel) {
			await scrollGroupChatToBottom();
		}
	}

	async function loadGroupMessages(currentEvent: SportEvent) {
		const currentUser = auth.currentUser;

		if (!currentUser) return;

		const canCurrentUserAccessChat =
			currentEvent.creatorId === currentUser.uid ||
			currentEvent.participantIds.includes(currentUser.uid);

		if (!canCurrentUserAccessChat) {
			stopGroupMessagesListener();
			stopGroupConversationListener();
			stopGroupTypingTimeout();

			groupMessages = [];
			groupTypingLabel = '';
			return;
		}

		groupChatLoading = true;

		try {
			await ensureEventGroupConversation(currentEvent.id);

			const conversationId = getEventGroupConversationId(currentEvent.id);
			stopGroupConversationListener();

			unsubscribeGroupConversation = listenConversationById(
				conversationId,
				(liveConversation) => {
					void updateGroupTypingLabel(liveConversation, currentUser.uid);
				},
				(listenerError) => {
					console.error('Group conversation realtime error:', listenerError);
				}
			);
			stopGroupMessagesListener();

			unsubscribeGroupMessages = listenMessagesForConversation(
				conversationId,
				async (liveMessages) => {
					groupMessages = liveMessages;
					groupChatLoading = false;
					await scrollGroupChatToBottom();
				},
				(listenerError) => {
					console.error('Group chat realtime error:', listenerError);
					groupChatLoading = false;
				}
			);
		} catch (err) {
			console.error('Group chat load error:', err);
			groupChatLoading = false;
		}
	}

	function stopGroupConversationListener() {
		if (unsubscribeGroupConversation) {
			unsubscribeGroupConversation();
			unsubscribeGroupConversation = null;
		}
	}
	function handleGroupTyping(inputEvent: Event) {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		const value = (inputEvent.currentTarget as HTMLInputElement).value;
		const cleanValue = value.trim();

		const conversationId = getEventGroupConversationId(event.id);

		stopGroupTypingTimeout();

		if (!cleanValue) {
			groupLastTypingSentAt = 0;
			void clearUserTyping(conversationId, currentUser.uid);
			return;
		}

		const now = Date.now();

		if (now - groupLastTypingSentAt >= TYPING_REFRESH_MS) {
			groupLastTypingSentAt = now;

			void setUserTyping({
				conversationId,
				userId: currentUser.uid,
				displayName: currentUser.displayName ?? currentUser.email ?? 'Rally user'
			});
		}

		groupTypingTimeout = setTimeout(() => {
			groupLastTypingSentAt = 0;
			void clearUserTyping(conversationId, currentUser.uid);
		}, TYPING_VISIBLE_MS);
	}

	function stopGroupTypingTimeout() {
		if (groupTypingTimeout) {
			clearTimeout(groupTypingTimeout);
			groupTypingTimeout = null;
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
			syncJoinRequestsListener(loadedEvent, currentUser.uid);

			if (
				isEventFinished(loadedEvent) &&
				loadedEvent.status !== 'finished' &&
				loadedEvent.status !== 'cancelled'
			) {
				void notifyEventFinished(loadedEvent);
			}

			if (
				loadedEvent.creatorId === currentUser.uid ||
				loadedEvent.participantIds.includes(currentUser.uid)
			) {
				await loadGroupMessages(loadedEvent);
			}
		} catch (err) {
			console.error('Event detail error:', err);
			error = getFriendlyErrorMessage(err, 'Could not load event.');
		} finally {
			loading = false;
		}
	}

	function syncJoinRequestsListener(loadedEvent: SportEvent, userId: string) {
		unsubscribeJoinRequests?.();
		unsubscribeJoinRequests = null;
		pendingJoinRequests = [];
		pendingRequesters = [];

		if (loadedEvent.creatorId !== userId || (loadedEvent.joinPolicy ?? 'open') !== 'approval') {
			return;
		}

		unsubscribeJoinRequests = listenJoinRequestsForEvent(
			loadedEvent.id,
			async (requests) => {
				pendingJoinRequests = requests;
				pendingRequesters = requests.length
					? await getUserProfilesByIds(requests.map((request) => request.userId))
					: [];
			},
			(err) => console.error('Join requests listener error:', err)
		);
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
			error = getFriendlyErrorMessage(err, 'Could not join event.');
		} finally {
			actionLoading = false;
		}
	}

	async function handleRequestToJoin() {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		actionLoading = true;
		error = '';

		try {
			await requestToJoinEvent({ eventId: event.id, userId: currentUser.uid });
			await reloadEvent();
		} catch (err) {
			console.error('Request to join error:', err);
			error = getFriendlyErrorMessage(err, 'Could not request to join event.');
		} finally {
			actionLoading = false;
		}
	}

	async function handleRespondToJoinRequest(requestId: string, status: 'accepted' | 'declined') {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		joinRequestActionLoading = true;
		error = '';

		try {
			await respondToJoinRequest({
				requestId,
				eventId: event.id,
				hostId: currentUser.uid,
				status
			});
			await reloadEvent();
		} catch (err) {
			console.error('Respond to join request error:', err);
			error = getFriendlyErrorMessage(err, 'Could not update join request.');
		} finally {
			joinRequestActionLoading = false;
		}
	}

	async function handleLeaveEvent() {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		const confirmed = await showConfirm({
			title: 'Leave this event?',
			message:
				'You will be removed from the participant list. You can rejoin later if there are spots available.',
			confirmLabel: 'Leave event',
			danger: true
		});

		if (!confirmed) return;

		actionLoading = true;
		error = '';

		try {
			await leaveEvent(event.id, currentUser.uid);
			await reloadEvent();
		} catch (err) {
			console.error('Leave event error:', err);
			error = getFriendlyErrorMessage(err, 'Could not leave event.');
		} finally {
			actionLoading = false;
		}
	}

	async function handleCancelEvent() {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		const confirmed = await showConfirm({
			title: 'Cancel this event?',
			message: `This will permanently cancel "${event.title}" and notify all participants. This cannot be undone.`,
			confirmLabel: 'Cancel event',
			danger: true
		});

		if (!confirmed) return;

		actionLoading = true;
		error = '';

		try {
			await cancelEvent(event.id, currentUser.uid);
			await reloadEvent();
		} catch (err) {
			console.error('Cancel event error:', err);
			error = getFriendlyErrorMessage(err, 'Could not cancel event.');
		} finally {
			actionLoading = false;
		}
	}

	async function handleFinishEvent() {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		const confirmed = await showConfirm({
			title: 'Finish this event?',
			message:
				'This will close the event, stop active promotion and move it out of upcoming events.',
			confirmLabel: 'Finish event'
		});

		if (!confirmed) return;

		actionLoading = true;
		error = '';

		try {
			await finishEvent(event.id, currentUser.uid);
			await reloadEvent();
		} catch (err) {
			console.error('Finish event error:', err);
			error = getFriendlyErrorMessage(err, 'Could not finish event.');
		} finally {
			actionLoading = false;
		}
	}

	async function handleRemoveParticipant(participantId: string) {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		const confirmed = await showConfirm({
			title: 'Remove this player?',
			message:
				'They will be removed from the participant list and can rejoin if spots are available.',
			confirmLabel: 'Remove player',
			danger: true
		});

		if (!confirmed) return;

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
			error = getFriendlyErrorMessage(err, 'Could not remove participant.');
		} finally {
			actionLoading = false;
		}
	}

	async function handleGroupPhotoFileChange(fileEvent: Event) {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		const input = fileEvent.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		groupPhotoSaving = true;
		error = '';

		try {
			const uploadedPhoto = await uploadEventGroupPhoto({
				eventId: event.id,
				userId: currentUser.uid,
				file
			});

			await updateEventGroupPhoto({
				eventId: event.id,
				userId: currentUser.uid,
				groupPhotoURL: uploadedPhoto.url,
				groupPhotoPath: uploadedPhoto.path
			});

			input.value = '';
			await reloadEvent();
		} catch (err) {
			console.error('Update group photo error:', err);
			error = getFriendlyErrorMessage(err, 'Could not update group photo.');
		} finally {
			groupPhotoSaving = false;
		}
	}

	async function clearCurrentUserGroupTyping() {
		const currentUser = auth.currentUser;

		stopGroupTypingTimeout();
		groupLastTypingSentAt = 0;

		if (!currentUser || !event) return;

		const conversationId = getEventGroupConversationId(event.id);

		await clearUserTyping(conversationId, currentUser.uid);
	}

	async function handleSendGroupMessage() {
		const currentUser = auth.currentUser;

		if (!currentUser || !event || !groupMessageText.trim()) return;

		const canCurrentUserAccessChat =
			event.creatorId === currentUser.uid || event.participantIds.includes(currentUser.uid);

		if (!canCurrentUserAccessChat) {
			error = 'You need to be in this event to send messages.';
			return;
		}

		groupChatSending = true;
		error = '';

		try {
			const conversationId = getEventGroupConversationId(event.id);

			await clearCurrentUserGroupTyping();

			await sendMessage({
				conversationId,
				senderId: currentUser.uid,
				text: groupMessageText
			});

			groupMessageText = '';
			await scrollGroupChatToBottom();
		} catch (err) {
			console.error('Send group message error:', err);
			error = getFriendlyErrorMessage(err, 'Could not send message.');
		} finally {
			groupChatSending = false;
		}
	}

	async function handlePromoteEvent() {
		const user = auth.currentUser;

		if (!user || !event) return;

		promoting = true;
		error = '';

		try {
			await promoteEvent({
				eventId: event.id,
				userId: user.uid,
				budget: Number(promotionBudget),
				durationDays: Number(promotionDurationDays),
				plan: promotionPlan,
				targetCity: promotionTargetCity,
				targetCountry: promotionTargetCountry,
				targetSport: event.sport
			});

			showPromoteModal = false;
			await loadEventPage();
		} catch (err) {
			console.error('Promote event error:', err);
			error = getFriendlyErrorMessage(err, 'Could not promote event.');
		} finally {
			promoting = false;
		}
	}

	async function handleStopPromotion() {
		const user = auth.currentUser;

		if (!user || !event) return;

		stoppingPromotion = true;
		error = '';

		try {
			await stopEventPromotion({
				eventId: event.id,
				userId: user.uid
			});

			await loadEventPage();
		} catch (err) {
			console.error('Stop promotion error:', err);
			error = getFriendlyErrorMessage(err, 'Could not stop promotion.');
		} finally {
			stoppingPromotion = false;
		}
	}

	onMount(() => {
		void loadEventPage();
		const eventId = page.params.id;
		if (eventId) stopEventListener = subscribeToEventChanges(eventId, () => void loadEventPage());

		const currentUser = auth.currentUser;
		if (eventId && currentUser) {
			unsubscribeMyJoinRequest = listenJoinRequestForUser(
				{ eventId, userId: currentUser.uid },
				(request) => (myJoinRequest = request),
				(err) => console.error('My join request listener error:', err)
			);
		}
	});

	onDestroy(() => {
		void clearCurrentUserGroupTyping();

		stopGroupMessagesListener();
		stopGroupConversationListener();
		stopGroupTypingTimeout();
		stopEventListener();
		unsubscribeMyJoinRequest?.();
		unsubscribeJoinRequests?.();
	});
</script>

<button
	type="button"
	onclick={() => goBack(resolve('/dashboard'))}
	class="ml-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold leading-none text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900 sm:ml-0 sm:px-5"
>
	<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="h-4 w-4 shrink-0">
		<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
	</svg>
	<span>Back</span>
</button>

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
	<div class="mt-4 grid min-w-0 max-w-full gap-6 px-5 pb-28 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] sm:mt-8 sm:px-0 sm:pb-0">
		<div class="min-w-0 max-w-full space-y-6">
			<section class="space-y-5 sm:hidden">
				<div class="flex items-start gap-4">
					<div class="relative h-[4.5rem] w-[4.5rem] shrink-0">
						{#if event.groupPhotoURL}
							<img src={event.groupPhotoURL} alt={event.title} class="h-[4.5rem] w-[4.5rem] rounded-full object-cover ring-4 ring-white dark:ring-slate-900" />
						{:else}
							<div class="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-blue-100 text-3xl font-black text-blue-600 ring-4 ring-white dark:bg-blue-950 dark:text-blue-300 dark:ring-slate-900">
								{event.title.slice(0, 1).toUpperCase()}
							</div>
						{/if}

						{#if isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
							<label
								title="Edit group photo"
								class="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white text-xs text-blue-600 shadow-lg ring-2 ring-white transition hover:bg-blue-50 dark:bg-white dark:text-blue-600 dark:ring-slate-900"
							>
								{#if groupPhotoSaving}
								…
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.4" stroke="currentColor" class="h-4 w-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18A2.25 2.25 0 0 0 4.5 20.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
								</svg>
							{/if}
								<input type="file" accept="image/*" class="hidden" onchange={handleGroupPhotoFileChange} />
							</label>
						{/if}
					</div>

					<div class="min-w-0 flex-1 pt-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="text-[11px] font-black uppercase tracking-[0.22em] text-blue-600 dark:text-blue-400">
								{event.eventKind === 'tournament' ? 'Tournament' : event.sport}
							</span>

							<span class="text-xs font-black capitalize text-slate-500 dark:text-slate-400">
								{effectiveStatus}
							</span>
						</div>

						<h1 class="mt-2 break-words text-3xl font-black leading-tight tracking-tight text-slate-950 dark:text-slate-50">
							{event.title}
						</h1>

						<p class="mt-1 text-sm font-bold capitalize text-slate-500 dark:text-slate-400">
							{event.level ?? 'casual'} level
						</p>
					</div>
				</div>

				{#if event.description}
					<p class="text-[15px] leading-6 text-slate-600 dark:text-slate-300">
						{event.description}
					</p>
				{/if}

				<div class="rounded-[1.75rem] bg-white/80 p-4 shadow-sm shadow-slate-200/60 ring-1 ring-slate-200/70 dark:bg-slate-900/80 dark:shadow-none dark:ring-slate-800">
					<div class="grid grid-cols-3 gap-3">
						<div>
							<p class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Date</p>
							<p class="mt-1 truncate text-sm font-black text-slate-950 dark:text-slate-50">{formatShortDate(event.startAt)}</p>
						</div>
						<div>
							<p class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Time</p>
							<p class="mt-1 truncate text-sm font-black text-slate-950 dark:text-slate-50">{formatShortTime(event.startAt)}</p>
						</div>
						<div>
							<p class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Duration</p>
							<p class="mt-1 truncate text-sm font-black text-slate-950 dark:text-slate-50">{formatEventDuration(event)}</p>
						</div>
					</div>

					<div class="mt-4 flex items-start justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
						<div class="min-w-0">
							<p class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Location</p>
							<p class="mt-1 truncate text-sm font-black text-slate-950 dark:text-slate-50">{event.location.name}</p>
							{#if event.location.address}
								<p class="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{event.location.address}</p>
							{/if}
							<div class="mt-2.5 flex flex-wrap items-center gap-3">
								{#if event.location.lat && event.location.lng}
									<a
										href={`https://www.google.com/maps/dir/?api=1&destination=${event.location.lat},${event.location.lng}`}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center gap-1.5 text-[11px] font-black text-blue-600 dark:text-blue-400 hover:underline"
									>
										<svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
											<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#EA4335" />
											<circle cx="12" cy="9" r="3" fill="#34A853" />
											<path d="M12 2c2.1 0 4 .9 5.3 2.3L15 6.5C14.2 5.6 13.2 5 12 5c-2.2 0-4 1.8-4 4 0 .5.1 1 .3 1.5L6.1 12.2C5.4 11.2 5 10.1 5 9c0-3.87 3.13-7 7-7z" fill="#FBBC05" />
											<path d="M12 22s7-7.75 7-13c0-.4-.1-.8-.2-1.2l-2.2 2.2c.2.6.4 1.3.4 2 0 3.2-3.5 8.1-5 9.8z" fill="#4285F4" />
										</svg>
										<span>Get Directions</span>
									</a>
								{/if}
								<EventWeather lat={event.location.lat} lng={event.location.lng} startAt={event.startAt} size="sm" />
							</div>
						</div>

						<div class="shrink-0 text-right">
							<p class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Price</p>
							<p class="mt-1 max-w-[7rem] text-sm font-black text-slate-950 dark:text-slate-50">{formatPriceLabel(event)}</p>
						</div>
					</div>
				</div>

				<EventMap
					lat={event.location.lat ?? null}
					lng={event.location.lng ?? null}
					name={event.location.name}
					address={event.location.address ?? ''}
					compact={true}
				/>

				{#if event.hostType === 'organization'}
					<div class="rounded-[1.75rem] bg-white/80 p-4 shadow-sm shadow-slate-200/60 ring-1 ring-slate-200/70 dark:bg-slate-900/80 dark:shadow-none dark:ring-slate-800">
						<p class="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Hosted by</p>

						<a href={resolve(`/organizations/${event.organizationId}`)} class="mt-3 flex items-center gap-3">
							<div class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-lg font-black text-blue-600 dark:bg-slate-800 dark:text-blue-300">
								{#if event.organizationLogoURL}
									<img src={event.organizationLogoURL} alt={event.organizationName ?? 'Organization'} class="h-full w-full object-cover" />
								{:else}
									{event.organizationName?.charAt(0).toUpperCase() ?? 'O'}
								{/if}
							</div>

							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<p class="truncate font-black text-slate-950 dark:text-slate-50">{event.organizationName ?? 'Organization'}</p>
									{#if event.organizationVerificationStatus === 'verified'}
										<span class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">Verified</span>
									{/if}
								</div>
								<p class="text-xs text-slate-500 dark:text-slate-400">Official organizer</p>
							</div>
						</a>

						<div class="mt-4 grid gap-2 {canContactOrganizer && canPromoteThisEvent ? 'grid-cols-2' : 'grid-cols-1'}">
							{#if canContactOrganizer}
								<button type="button" onclick={contactOrganizer} disabled={contactLoading} class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
									{contactLoading ? 'Opening...' : 'Contact organizer'}
								</button>
							{/if}

							{#if canPromoteThisEvent}
								{#if isPromotionActive(event)}
									<button type="button" onclick={handleStopPromotion} disabled={stoppingPromotion} class="rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-100 disabled:opacity-60 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900">
										{stoppingPromotion ? 'Stopping...' : 'Promotion active'}
									</button>
								{:else}
									<button type="button" onclick={() => (showPromoteModal = true)} class="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">
										Promote
									</button>
								{/if}
							{/if}
						</div>
					</div>
				{:else if hostProfile}
					<a href={resolve(`/users/${hostProfile.id}`)} class="flex items-center gap-3 rounded-[1.5rem] bg-white/70 p-3 shadow-sm shadow-slate-200/50 ring-1 ring-slate-200/70 dark:bg-slate-900/70 dark:shadow-none dark:ring-slate-800">
						<UserAvatar photoURL={hostProfile.photoURL} displayName={hostProfile.displayName} email={hostProfile.email} size="sm" />
						<div class="min-w-0">
							<p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Host</p>
							<p class="truncate text-sm font-black text-slate-950 dark:text-slate-50">{hostProfile.displayName}</p>
						</div>
					</a>
				{/if}

				{#if event?.eventKind !== 'tournament'}
					<div class="space-y-3">
						<div class="flex items-center justify-between gap-4">
							<div>
								<p class="text-base font-black text-slate-950 dark:text-slate-50">Players</p>
								<p class="text-sm font-bold text-slate-500 dark:text-slate-400">{participants.length}/{event.maxParticipants} confirmed</p>
							</div>

							<div class="flex -space-x-2 overflow-hidden pl-2">
								{#each participants.slice(0, 4) as participant (participant.id)}
									<UserAvatar photoURL={participant.photoURL} displayName={participant.displayName} email={participant.email} size="sm" />
								{/each}

								{#if participants.length > 4}
									<span class="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-xs font-black text-slate-600 dark:border-slate-950 dark:bg-slate-800 dark:text-slate-300">+{participants.length - 4}</span>
								{/if}
							</div>
						</div>

						<div class="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
							<div class="h-full rounded-full bg-blue-600" style={`width: ${Math.min(100, (participants.length / event.maxParticipants) * 100)}%`}></div>
						</div>

						<div class="grid grid-cols-2 gap-3">
							{#if canInvite}
								<a href={resolve(`/events/${event.id}/invite`)} class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800">Invite</a>
							{/if}

							{#if canJoin}
								<button onclick={handleJoinEvent} disabled={actionLoading} class="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60">
									{actionLoading ? 'Joining...' : 'Join event'}
								</button>
							{:else if canRequestJoin}
								<button onclick={handleRequestToJoin} disabled={actionLoading} class="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60">
									{actionLoading ? 'Requesting...' : 'Request to join'}
								</button>
							{:else if hasPendingJoinRequest}
								<button disabled class="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">
									Request pending
								</button>
							{/if}

							{#if isParticipant && !isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
								<button
									type="button"
									onclick={handleLeaveEvent}
									disabled={actionLoading}
									class="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950"
								>
									{actionLoading ? 'Leaving...' : 'Leave event'}
								</button>
							{/if}

							{#if isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
								<a href={resolve(`/events/${event.id}/edit`)} class="rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-black text-white shadow-lg shadow-slate-950/10 transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">Edit</a>
								<button type="button" onclick={handleFinishEvent} disabled={actionLoading} class="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-100 disabled:opacity-60 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900">
									Finish
								</button>
							{/if}
						</div>
					</div>
				{/if}

				{#if error}
					<div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
						{error}
					</div>
				{/if}
			</section>

			<section
				class="hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:block sm:rounded-4xl sm:p-8"
			>
				<div class="flex flex-col gap-5 sm:flex-row sm:items-start">
					<div class="relative h-20 w-20 shrink-0">
						{#if event.groupPhotoURL}
							<img
								src={event.groupPhotoURL}
								alt={event.title}
								class="h-20 w-20 rounded-full object-cover ring-4 ring-slate-100 dark:ring-slate-800"
							/>
						{:else}
							<div
								class="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-3xl font-black text-blue-600 ring-4 ring-slate-100 dark:bg-blue-950 dark:text-blue-300 dark:ring-slate-800"
							>
								{event.title.slice(0, 1).toUpperCase()}
							</div>
						{/if}

						{#if isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
							<label
								title="Edit group photo"
								class="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white text-sm text-blue-600 shadow-lg ring-2 ring-slate-100 transition hover:bg-blue-50 dark:bg-white dark:text-blue-600 dark:ring-slate-800"
							>
								{#if groupPhotoSaving}
								…
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.4" stroke="currentColor" class="h-4 w-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18A2.25 2.25 0 0 0 4.5 20.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
								</svg>
							{/if}
								<input
									type="file"
									accept="image/*"
									class="hidden"
									onchange={handleGroupPhotoFileChange}
								/>
							</label>
						{/if}
					</div>

					<div class="min-w-0 flex-1">
						<p
							class="text-sm font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400"
						>
							{event.sport}
						</p>

						<h1
							class="mt-3 break-words text-3xl font-black tracking-tight text-slate-950 dark:text-slate-50 sm:text-4xl"
						>
							{event.title}
						</h1>

						{#if event.recurringGroupId}
							<span
								class="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300"
							>
								🔁 Part of a recurring series ({event.recurringIndex}/{event.recurringTotal})
							</span>
						{/if}

						<p class="mt-4 text-slate-600 dark:text-slate-300">
							{event.description || 'No description provided.'}
						</p>
					</div>
				</div>

				<div class="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:grid-cols-3 sm:gap-4">
					<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
						<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Date and time</p>
						<p class="mt-2 font-bold text-slate-950 dark:text-slate-50">
							{formatDate(event.startAt)}
						</p>
					</div>

					<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
						<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Location</p>
						<p class="mt-2 font-bold text-slate-950 dark:text-slate-50">
							{event.location.name}
						</p>

						{#if event.location.address}
							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								{event.location.address}
							</p>
						{/if}

						{#if event.location.lat && event.location.lng}
							<a
								href={`https://www.google.com/maps/dir/?api=1&destination=${event.location.lat},${event.location.lng}`}
								target="_blank"
								rel="noopener noreferrer"
								class="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-blue-600 dark:text-blue-400 hover:underline"
							>
								<svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
									<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#EA4335" />
									<circle cx="12" cy="9" r="3" fill="#34A853" />
									<path d="M12 2c2.1 0 4 .9 5.3 2.3L15 6.5C14.2 5.6 13.2 5 12 5c-2.2 0-4 1.8-4 4 0 .5.1 1 .3 1.5L6.1 12.2C5.4 11.2 5 10.1 5 9c0-3.87 3.13-7 7-7z" fill="#FBBC05" />
									<path d="M12 22s7-7.75 7-13c0-.4-.1-.8-.2-1.2l-2.2 2.2c.2.6.4 1.3.4 2 0 3.2-3.5 8.1-5 9.8z" fill="#4285F4" />
								</svg>
								<span>Get Directions</span>
							</a>
						{/if}
					</div>

					<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
						<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Level</p>
						<p class="mt-2 font-bold capitalize text-slate-950 dark:text-slate-50">
							{event.level ?? 'casual'}
						</p>
					</div>

					<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
						<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Duration</p>
						<p class="mt-2 font-bold text-slate-950 dark:text-slate-50">
							{formatEventDuration(event)}
						</p>
					</div>

					<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
						<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Price</p>
						<p class="mt-2 font-bold text-slate-950 dark:text-slate-50">
							{formatPriceLabel(event)}
						</p>
					</div>

					<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800 flex flex-col justify-between">
						<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Weather</p>
						<div class="mt-2.5">
							<EventWeather lat={event.location.lat} lng={event.location.lng} startAt={event.startAt} size="md" />
						</div>
					</div>
				</div>

				{#if event.whatToBring}
					<div class="mt-6 rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
						<p class="text-sm font-medium text-slate-500 dark:text-slate-400">What to bring</p>
						<p class="mt-2 whitespace-pre-line font-bold text-slate-950 dark:text-slate-50">
							{event.whatToBring}
						</p>
					</div>
				{/if}

				{#if event?.eventKind !== 'tournament'}
					<div
						class="mt-8 rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
					>
						<div class="flex items-center justify-between gap-4">
							<div>
								<p
									class="text-sm font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400"
								>
									Players
								</p>

								<h2 class="mt-2 text-2xl font-black text-slate-950 dark:text-slate-50">
									People in this event
								</h2>
							</div>

							<div class="rounded-2xl bg-blue-50 px-4 py-2 text-center dark:bg-blue-950">
								<p class="text-lg font-black text-blue-600 dark:text-blue-300">
									{participants.length}/{event.maxParticipants}
								</p>
								<p class="text-xs font-medium text-slate-500 dark:text-slate-400">players</p>
							</div>
						</div>

						{#if participants.length > 0}
							<div class="mt-5 space-y-3">
								{#each participants as participant (participant.id)}
									<div
										class="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
									>
										<a
											href={resolve(`/users/${participant.id}`)}
											class="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-slate-100 dark:hover:bg-slate-800"
										>
											<UserAvatar
												photoURL={participant.photoURL}
												displayName={participant.displayName}
												email={participant.email}
												size="md"
											/>

											<div class="min-w-0">
												<p class="truncate font-bold text-slate-950 dark:text-slate-50">
													{participant.displayName}
												</p>
												<p class="truncate text-xs text-slate-500 dark:text-slate-400">
													@{participant.rallyTag}
												</p>
											</div>
										</a>

										{#if participant.id === event.creatorId}
											<span
												class="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-600 dark:bg-blue-950 dark:text-blue-300"
											>
												Host
											</span>
										{:else if isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
											<button
												type="button"
												onclick={() => handleRemoveParticipant(participant.id)}
												disabled={actionLoading}
												class="rounded-full px-4 py-2 text-sm font-black text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950"
											>
												Remove
											</button>
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<div class="mt-5 rounded-2xl bg-slate-50 p-5 text-center dark:bg-slate-800">
								<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">
									No players yet.
								</p>
							</div>
						{/if}
					</div>
				{/if}

				{#if error}
					<div
						class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
					>
						{error}
					</div>
				{/if}
			</section>

			{#if isCreator && event?.joinPolicy === 'approval'}
				<section
					class="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-4xl sm:p-6 sm:shadow-xl sm:shadow-slate-200/70"
				>
					<div class="flex items-center justify-between gap-4">
						<div>
							<p
								class="text-sm font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400"
							>
								Requests
							</p>
							<h2 class="mt-2 text-xl font-black text-slate-950 dark:text-slate-50 sm:text-2xl">
								Join requests
							</h2>
						</div>

						{#if pendingJoinRequests.length > 0}
							<div class="rounded-2xl bg-blue-50 px-4 py-2 text-center dark:bg-blue-950">
								<p class="text-lg font-black text-blue-600 dark:text-blue-300">
									{pendingJoinRequests.length}
								</p>
								<p class="text-xs font-medium text-slate-500 dark:text-slate-400">pending</p>
							</div>
						{/if}
					</div>

					{#if pendingJoinRequests.length === 0}
						<div class="mt-5 rounded-2xl bg-slate-50 p-5 text-center dark:bg-slate-800">
							<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">
								No pending requests.
							</p>
						</div>
					{:else}
						<div class="mt-5 space-y-3">
							{#each pendingJoinRequests as request (request.id)}
								{@const requester = pendingRequesters.find((p) => p.id === request.userId)}
								<div
									class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
								>
									<div class="flex min-w-0 items-center gap-3">
										<UserAvatar
											photoURL={requester?.photoURL}
											displayName={requester?.displayName ?? 'Rally user'}
											email={requester?.email}
											size="md"
										/>

										<div class="min-w-0">
											<p class="truncate font-bold text-slate-950 dark:text-slate-50">
												{requester?.displayName ?? 'Rally user'}
											</p>
											{#if requester?.rallyTag}
												<p class="truncate text-xs text-slate-500 dark:text-slate-400">
													@{requester.rallyTag}
												</p>
											{/if}
										</div>
									</div>

									<div class="flex shrink-0 items-center gap-2">
										<button
											type="button"
											onclick={() => handleRespondToJoinRequest(request.id, 'declined')}
											disabled={joinRequestActionLoading}
											class="rounded-full px-3 py-2 text-sm font-black text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950"
										>
											Decline
										</button>

										<button
											type="button"
											onclick={() => handleRespondToJoinRequest(request.id, 'accepted')}
											disabled={joinRequestActionLoading}
											class="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
										>
											Approve
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</section>
			{/if}

			{#if event?.eventKind === 'tournament'}
				<TournamentPanel {event} {currentUserId} canManage={canManageTournament} />
			{/if}

			{#if canAccessGroupChat && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
				<section
					class="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-4xl sm:shadow-xl sm:shadow-slate-200/70"
				>
					<div class="flex items-center gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:gap-4 sm:p-5">
						{#if event.groupPhotoURL}
							<img
								src={event.groupPhotoURL}
								alt={event.title}
								class="h-10 w-10 rounded-full object-cover ring-2 ring-white dark:ring-slate-800 sm:h-12 sm:w-12"
							/>
						{:else}
							<div
								class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-base font-black text-blue-600 ring-2 ring-white dark:bg-blue-950 dark:text-blue-300 dark:ring-slate-800 sm:h-12 sm:w-12 sm:text-lg"
							>
								{event.title.slice(0, 1).toUpperCase()}
							</div>
						{/if}

						<div class="min-w-0 flex-1">
							<p class="truncate text-base font-black text-slate-950 dark:text-white sm:text-lg">
								{event.title}
							</p>
							<p class="truncate text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
								Group chat · {event.participantIds.length} members
							</p>
						</div>
					</div>

					<div
						bind:this={messagesContainer}
						class="h-[20rem] overflow-y-auto bg-slate-50 px-4 py-4 dark:bg-slate-950 sm:h-[22.5rem] sm:px-5 sm:py-5"
					>
						{#if groupChatLoading}
							<div
								class="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400"
							>
								Loading group chat...
							</div>
						{:else if groupMessages.length === 0}
							{#if groupTypingLabel}
								<div class="mx-auto mt-4 flex max-w-3xl justify-start">
									<div
										class="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-400"
									>
										{groupTypingLabel}
									</div>
								</div>
							{/if}
							<div class="flex h-full items-center justify-center text-center">
								<div>
									<p class="text-4xl">💬</p>
									<p class="mt-3 font-black text-slate-700 dark:text-slate-200">No messages yet</p>
									<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
										Send the first message to the event group.
									</p>
								</div>
							</div>
						{:else}
							<ChatMessageList
								messages={groupMessages}
								currentUserId={auth.currentUser?.uid}
								getSenderProfile={(senderId) => participantById[senderId]}
								typingLabel={groupTypingLabel}
								showSenderName={true}
							/>
						{/if}
					</div>

					<form
						class="border-t border-slate-100 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-4"
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
								oninput={handleGroupTyping}
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

		<aside class="hidden space-y-6 lg:block">
			{#if event?.hostType === 'organization'}
				<div
					class="rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<p class="text-sm font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
						Hosted by
					</p>

					<a
						href={resolve(`/organizations/${event.organizationId}`)}
						class="mt-4 flex items-center gap-3 rounded-2xl p-3 transition hover:bg-slate-100 dark:hover:bg-slate-800"
					>
						<div
							class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-lg font-black text-blue-600 dark:bg-slate-800 dark:text-blue-300"
						>
							{#if event.organizationLogoURL}
								<img
									src={event.organizationLogoURL}
									alt={event.organizationName ?? 'Organization'}
									class="h-full w-full object-cover"
								/>
							{:else}
								{event.organizationName?.charAt(0).toUpperCase() ?? 'O'}
							{/if}
						</div>

						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<p class="truncate font-black text-slate-950 dark:text-slate-50">
									{event.organizationName ?? 'Organization'}
								</p>

								{#if event.organizationVerificationStatus === 'verified'}
									<span
										class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300"
									>
										Verified
									</span>
								{/if}
							</div>

							<p class="text-xs text-slate-500 dark:text-slate-400">Official organization host</p>
						</div>
					</a>

					{#if canContactOrganizer}
						<button
							type="button"
							onclick={contactOrganizer}
							disabled={contactLoading}
							class="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 font-black text-slate-800 transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-blue-500 dark:hover:bg-slate-700"
						>
							{contactLoading ? 'Opening chat...' : 'Contact organizer'}
						</button>
					{/if}

					{#if canPromoteThisEvent}
						{#if isPromotionActive(event)}
							<div class="mt-4 rounded-2xl bg-blue-50 p-4 dark:bg-blue-950/40">
								<div class="flex items-center justify-between gap-3">
									<div>
										<p class="font-black text-blue-700 dark:text-blue-300">Promotion active</p>

										{#if promotionStats}
											<p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
												{promotionStats.views} views · {promotionStats.clicks} clicks ·
												{promotionStats.ctr.toFixed(1)}% CTR
											</p>
										{/if}
									</div>

									<button
										type="button"
										onclick={handleStopPromotion}
										disabled={stoppingPromotion}
										class="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-800 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-60 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-red-950 dark:hover:text-red-300"
									>
										{stoppingPromotion ? 'Stopping...' : 'Stop'}
									</button>
								</div>
							</div>
						{:else}
							<button
								type="button"
								onclick={() => (showPromoteModal = true)}
								class="mt-4 w-full rounded-2xl bg-blue-600 px-5 py-3 font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
							>
								Promote event
							</button>
						{/if}
					{/if}
				</div>
			{/if}

			{#if event?.eventKind != 'tournament'}
				<div
					class="rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<div class="flex items-center justify-between gap-3">
						<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Team status</h2>

						{#if isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
							<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={handleFinishEvent}
									disabled={actionLoading}
									title="Finish event"
									aria-label="Finish event"
									class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-sm font-black text-blue-600 transition hover:bg-blue-100 disabled:opacity-60 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
								>
									✓
								</button>

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
							</div>
						{:else if isParticipant && !isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
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

					<div class="mt-5 rounded-2xl bg-blue-50 p-5 dark:bg-blue-950">
						<p class="text-4xl font-black text-blue-600 dark:text-blue-300">
							{event.participantIds.length}/{event.maxParticipants}
						</p>
						<p class="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
							confirmed players
						</p>
					</div>

					{#if effectiveStatus === 'cancelled'}
						<div
							class="mt-5 rounded-2xl bg-red-50 px-5 py-4 text-center font-bold text-red-700 dark:bg-red-950 dark:text-red-300"
						>
							This event has been cancelled
						</div>
					{:else if effectiveStatus === 'finished'}
						<div
							class="mt-5 rounded-2xl bg-slate-100 px-5 py-4 text-center font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300"
						>
							This event has already finished
						</div>
					{:else if event.status === 'full'}
						<div
							class="mt-5 rounded-2xl bg-slate-100 px-5 py-4 text-center font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300"
						>
							Event full
						</div>
					{:else if canJoin}
						<button
							onclick={handleJoinEvent}
							disabled={actionLoading}
							class="mt-5 w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
						>
							{actionLoading ? 'Joining...' : 'Join event'}
						</button>
					{:else if canRequestJoin}
						<button
							onclick={handleRequestToJoin}
							disabled={actionLoading}
							class="mt-5 w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
						>
							{actionLoading ? 'Requesting...' : 'Request to join'}
						</button>
					{:else if hasPendingJoinRequest}
						<button
							disabled
							class="mt-5 w-full rounded-2xl bg-slate-100 px-5 py-3 font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400"
						>
							Request pending
						</button>
					{/if}

					{#if canInvite}
						<a
							href={resolve(`/events/${event.id}/invite`)}
							class="mt-3 block rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-400"
						>
							Invite people
						</a>
					{/if}

					{#if isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
						<a
							href={resolve(`/events/${event.id}/edit`)}
							class="mt-3 block rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-400"
						>
							Edit event
						</a>
					{/if}
				</div>
			{/if}

			<EventMap
				lat={event.location.lat ?? null}
				lng={event.location.lng ?? null}
				name={event.location.name}
				address={event.location.address ?? ''}
			/>
		</aside>

		{#if showPromoteModal && event}
			<div
				class="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/60 px-0 backdrop-blur-sm sm:items-center sm:px-5"
			>
				<div
					class="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl dark:bg-slate-900 sm:rounded-[2rem] sm:p-6"
					role="dialog"
					aria-modal="true"
				>
					<div class="flex items-start justify-between gap-4">
						<div>
							<p
								class="text-sm font-black uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400"
							>
								Promote event
							</p>

							<h2 class="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50">
								Reach more people
							</h2>

							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								Choose a boost plan, budget and duration. This simulates an ads-style campaign.
							</p>
						</div>

						<button
							type="button"
							onclick={() => (showPromoteModal = false)}
							class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
							aria-label="Close promote modal"
						>
							×
						</button>
					</div>

					<div class="mt-6 grid gap-3 md:grid-cols-2">
						{#each promotionPlanOptions as [plan, config]}
							<button
								type="button"
								onclick={() => (promotionPlan = plan)}
								class={`rounded-3xl border p-4 text-left transition ${
									promotionPlan === plan
										? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
										: 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-slate-800'
								}`}
							>
								<p class="font-black text-slate-950 dark:text-slate-50">
									{config.label}
								</p>

								<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
									{config.description}
								</p>

								<p class="mt-3 text-sm font-black text-blue-600 dark:text-blue-400">
									€{config.cpm} CPM
								</p>

								<p class="mt-1 text-xs font-bold text-slate-400 dark:text-slate-500">
									{config.placement}
								</p>
							</button>
						{/each}
					</div>

					<div class="mt-6 grid gap-3 md:grid-cols-3">
						<label class="block">
							<span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
								Budget (€)
							</span>
							<input
								bind:value={promotionBudget}
								type="number"
								min="1"
								step="1"
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								placeholder="e.g. 25"
							/>
						</label>

						<label class="block">
							<span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
								Duration
							</span>
							<select
								bind:value={promotionDurationDays}
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							>
								<option value="3">3 days</option>
								<option value="7">7 days</option>
								<option value="14">14 days</option>
								<option value="30">30 days</option>
							</select>
						</label>

						<label class="block">
							<span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
								Target country
							</span>
							<select
								bind:value={promotionTargetCountry}
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							>
								{#each PROMOTION_COUNTRIES as country}
									<option value={country.code}>{country.label}</option>
								{/each}
							</select>
						</label>

						<label class="block md:col-span-3">
							<span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
								Target city or region
							</span>
							<input
								bind:value={promotionTargetCity}
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								placeholder={`Optional, e.g. ${event.location.name}`}
							/>
							<span class="mt-1 block text-xs text-slate-500 dark:text-slate-400">
								Leave empty for the whole selected country. Sport Boost uses {event.sport} automatically.
							</span>
						</label>
					</div>

					<div class="mt-6 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
						<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
							Estimated campaign
						</p>

						<p class="mt-2 font-black text-slate-950 dark:text-slate-50">
							≈ {promotionImpressionsPreview} impressions · €{selectedPromotionPlan.cpm} CPM
						</p>

						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
							Placement: {selectedPromotionPlan.placement}
						</p>
					</div>

					<div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
						<button
							type="button"
							onclick={() => (showPromoteModal = false)}
							class="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
						>
							Cancel
						</button>

						<button
							type="button"
							onclick={handlePromoteEvent}
							disabled={promoting}
							class="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
						>
							{promoting ? 'Starting campaign...' : 'Start promotion'}
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}

{#if confirmDialog}
	<dialog
		open
		class="fixed inset-0 z-50 m-0 flex h-full w-full max-w-none items-end justify-center border-0 bg-black/50 px-4 pb-8 backdrop-blur-sm sm:items-center sm:pb-0"
		onclick={(event) => {
			if (event.target === event.currentTarget) dismissConfirm(false);
		}}
		aria-labelledby="confirm-title"
	>
		<div class="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900">
			<div class="p-6">
				<h2 id="confirm-title" class="text-lg font-black text-slate-950 dark:text-slate-50">
					{confirmDialog.title}
				</h2>
				<p class="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
					{confirmDialog.message}
				</p>
			</div>

			<div class="flex border-t border-slate-100 dark:border-slate-800">
				<button
					type="button"
					onclick={() => dismissConfirm(false)}
					class="flex-1 py-4 text-sm font-bold text-slate-500 transition hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
				>
					Keep it
				</button>
				<div class="w-px bg-slate-100 dark:bg-slate-800"></div>
				<button
					type="button"
					onclick={() => dismissConfirm(true)}
					class="flex-1 py-4 text-sm font-bold transition {confirmDialog.danger
						? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30'
						: 'text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30'}"
				>
					{confirmDialog.confirmLabel}
				</button>
			</div>
		</div>
	</dialog>
{/if}
