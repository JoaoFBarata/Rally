<!-- src/routes/events/[id]/+page.svelte -->
<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { i18n } from '$lib/services/i18n.svelte';
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
		getAvailablePromotionPlanOptions,
		getEventById,
		getEventGroupConversationId,
		getEffectiveEventStatus,
		getEventPaymentSummary,
		isEventFinished,
		isPromotionActive,
		joinEvent,
		leaveEvent,
		notifyEventFinished,
		promoteEvent,
		removeParticipantFromEvent,
		stopEventPromotion,
		updateEventParticipantPaymentStatus,
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
	import { getUserProfilesByIds, getUserProfile } from '$lib/services/user.service';
	import ImageCropperModal from '$lib/components/ImageCropperModal.svelte';
	import EventMap from '$lib/components/maps/EventMap.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import EventWeather from '$lib/components/EventWeather.svelte';
	import type {
		ChatConversation,
		ChatMessage,
		EventJoinRequest,
		OrganizationReview,
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
	import { formatSport, getCurrencySymbol, getSportBackgroundImage } from '$lib/utils/format.utils';
	import { getOrCreateOrganizationConversation } from '$lib/services/chat.service';
	import TournamentPanel from '$lib/components/tournaments/TournamentPanel.svelte';
	import { getOrganizationReviews } from '$lib/services/organization.service';
	import { TEXT_LIMITS } from '$lib/constants/text-limits';

	let event = $state<SportEvent | null>(null);
	let loading = $state(true);
	let actionLoading = $state(false);
	let error = $state('');
	let participants = $state<UserProfile[]>([]);
	let paymentActionLoading = $state(false);

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
	let organizationReviews = $state<OrganizationReview[]>([]);
	let activeEventTab = $state<'overview' | 'players' | 'chat' | 'location'>('overview');
	let isSavedEvent = $state(false);
	let currentUserProfile = $state<UserProfile | null>(null);

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

	let showCropper = $state(false);
	let cropperImageSrc = $state('');
	let cropperInputRef = $state<HTMLInputElement | null>(null);
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
			currentUserProfile?.accountType !== 'organization' &&
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
			currentUserProfile?.accountType !== 'organization' &&
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
			(isCreator || isParticipant) &&
			currentUserProfile?.accountType !== 'organization'
		);
	});

	let googleCalendarUrl = $derived(event ? getGoogleCalendarUrl(event) : '');
	let canAddToGoogleCalendar = $derived(
		!!googleCalendarUrl && (isCreator || isParticipant)
	);

	let participantById = $derived.by(() => {
		return Object.fromEntries(
			participants.map((participant) => [participant.id, participant])
		) as Record<string, UserProfile>;
	});

	let contactLoading = $state(false);

	let promotionPlanOptions = $derived(getAvailablePromotionPlanOptions());

	let selectedPromotionPlan = $derived(PROMOTION_PLANS[promotionPlan]);

	let promotionImpressionsPreview = $derived.by(() => {
		const budget = Number(promotionBudget);
		const cpm = selectedPromotionPlan.cpm;

		if (!budget || !cpm) return 0;

		return Math.floor((budget / cpm) * 1000);
	});

	let promotionStats = $derived(event ? calculatePromotionStats(event) : null);
	let paymentSummary = $derived.by(() => (event ? getEventPaymentSummary(event) : null));
	let organizationAverageRating = $derived.by(() => {
		if (!organizationReviews.length) return 0;
		return organizationReviews.reduce((sum, review) => sum + review.rating, 0) / organizationReviews.length;
	});

	function getPromotionPlanTranslationKey(plan: EventPromotionPlan, field: 'label' | 'description' | 'placement') {
		const keyByPlan = {
			local: {
				label: 'regional_boost',
				description: 'regional_boost_desc',
				placement: 'regional_boost_placement'
			},
			sport: {
				label: 'sport_targeting',
				description: 'sport_targeting_desc',
				placement: 'sport_targeting_placement'
			},
			featured: {
				label: 'legacy_featured',
				description: 'legacy_featured_desc',
				placement: 'legacy_featured_placement'
			}
		} satisfies Record<EventPromotionPlan, Record<'label' | 'description' | 'placement', string>>;

		return keyByPlan[plan][field];
	}

	function getSportLabel(value: string | null | undefined) {
		if (!value) return '';
		return i18n.t(`sport_${value}`);
	}

	function getLevelLabel(value: string | null | undefined) {
		if (!value) return i18n.t('casual');
		return i18n.t(value);
	}

	function getStatusLabel(value: string | null | undefined) {
		if (!value) return '';
		return i18n.t(`status_${value}`);
	}

	function formatReviewSummary() {
		if (!organizationReviews.length) return i18n.t('official_organizer');

		const reviewKey = organizationReviews.length === 1 ? 'review_singular' : 'review_plural';
		return `${organizationAverageRating.toFixed(1)} ★ · ${organizationReviews.length} ${i18n.t(reviewKey)}`;
	}

	let canPromoteThisEvent = $derived.by(() => {
		const currentUser = auth.currentUser;

		return (
			!!currentUser &&
			!!event &&
			event.hostType === 'organization' &&
			!!event.organizationId &&
			(event.creatorId === currentUser.uid || event.organizationId === currentUserProfile?.activeOrganizationId)
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
			error = getFriendlyErrorMessage(err, i18n.t('could_not_contact_organizer'));
		} finally {
			contactLoading = false;
		}
	}

	function formatDate(dateValue: unknown) {
		try {
			const timestamp = dateValue as { toDate?: () => Date };

			if (timestamp?.toDate) {
				return timestamp.toDate().toLocaleString(getLocale(), {
					weekday: 'long',
					day: '2-digit',
					month: 'long',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				});
			}

			return i18n.t('date_not_set');
		} catch {
			return i18n.t('date_not_set');
		}
	}

	function getLocale() {
		return { en: 'en-GB', pt: 'pt-PT', es: 'es-ES', fr: 'fr-FR' }[i18n.currentLang];
	}

	function formatShortDate(dateValue: unknown) {
		const date = timestampToDate(dateValue);
		if (!date) return i18n.t('date_not_set');

		return date.toLocaleDateString(getLocale(), {
			weekday: 'short',
			day: '2-digit',
			month: 'short'
		});
	}

	function formatShortTime(dateValue: unknown) {
		const date = timestampToDate(dateValue);
		if (!date) return i18n.t('time_not_set');

		return date.toLocaleTimeString(getLocale(), {
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
		if (!start || !end || end <= start) return i18n.t('duration_not_set');

		const totalMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;

		if (!hours) return i18n.t('minutes', { count: minutes });
		if (!minutes) return `${hours}h`;
		return `${hours}h ${minutes}min`;
	}

	function formatGoogleCalendarDate(date: Date) {
		return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
	}

	function getGoogleCalendarUrl(currentEvent: SportEvent) {
		const start = timestampToDate(currentEvent.startAt);

		if (!start) return '';

		const suppliedEnd = timestampToDate(currentEvent.endAt);
		const end =
			suppliedEnd && suppliedEnd > start
				? suppliedEnd
				: new Date(start.getTime() + 60 * 60 * 1000);
		const location = [currentEvent.location.name, currentEvent.location.address]
			.filter(Boolean)
			.join(', ');
		const details = currentEvent.description?.trim() || '';
		const params = new URLSearchParams({
			action: 'TEMPLATE',
			text: currentEvent.title,
			dates: `${formatGoogleCalendarDate(start)}/${formatGoogleCalendarDate(end)}`,
			details,
			location
		});

		return `https://calendar.google.com/calendar/render?${params.toString()}`;
	}

	function formatPriceLabel(currentEvent: SportEvent) {
		const currencySymbol = getCurrencySymbol(currentEvent.currency);
		if (currentEvent.pricePerPerson) return `${currencySymbol}${currentEvent.pricePerPerson.toFixed(2)} ${i18n.t('per_person_label')}`;
		if (currentEvent.priceTotal) return `${currencySymbol}${currentEvent.priceTotal.toFixed(2)}${i18n.t('total_label')}`;
		return i18n.t('free_not_defined');
	}

	function getEventHeroImage(currentEvent: SportEvent) {
		if (currentEvent.groupPhotoURL) return currentEvent.groupPhotoURL;
		return getSportBackgroundImage(currentEvent.sport);
	}

	function syncSavedEventState(eventId: string) {
		if (typeof localStorage === 'undefined') return;
		const saved = JSON.parse(localStorage.getItem('rally-saved-events') ?? '[]') as string[];
		isSavedEvent = saved.includes(eventId);
	}

	function toggleSavedEvent() {
		if (!event || typeof localStorage === 'undefined') return;
		const currentEvent = event;
		const saved = JSON.parse(localStorage.getItem('rally-saved-events') ?? '[]') as string[];
		const nextSaved = saved.includes(currentEvent.id)
			? saved.filter((id) => id !== currentEvent.id)
			: [...saved, currentEvent.id];

		localStorage.setItem('rally-saved-events', JSON.stringify(nextSaved));
		isSavedEvent = nextSaved.includes(currentEvent.id);
	}

	async function shareEvent() {
		if (!event || typeof window === 'undefined') return;
		const url = `${window.location.origin}${resolve(`/events/${event.id}`)}`;

		try {
			if (navigator.share) {
				await navigator.share({
					title: event.title,
					text: `Check this event on Rally: ${event.title}`,
					url
				});
			} else {
				await navigator.clipboard?.writeText(url);
				error = i18n.t('event_link_copied');
			}
		} catch (err) {
			if ((err as Error)?.name !== 'AbortError') {
				console.error('Share event error:', err);
				error = i18n.t('could_not_share_event');
			}
		}
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
				organizationReviews = updatedEvent.organizationId
					? await getOrganizationReviews(updatedEvent.organizationId)
					: [];
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
				error = i18n.t('event_id_not_found');
				loading = false;
				return;
			}

			const loadedEvent = await getEventById(eventId);

			if (!loadedEvent) {
				error = i18n.t('event_not_found');
				return;
			}

				event = loadedEvent;
				participants = await getUserProfilesByIds(loadedEvent.participantIds ?? []);
				currentUserProfile = await getUserProfile(currentUser.uid);
				organizationReviews = loadedEvent.organizationId
					? await getOrganizationReviews(loadedEvent.organizationId)
					: [];
				syncSavedEventState(loadedEvent.id);
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
			error = getFriendlyErrorMessage(err, i18n.t('could_not_load_event'));
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
			error = getFriendlyErrorMessage(err, i18n.t('could_not_join_event'));
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
			error = getFriendlyErrorMessage(err, i18n.t('could_not_request_join'));
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
			error = getFriendlyErrorMessage(err, i18n.t('could_not_update_join_request'));
		} finally {
			joinRequestActionLoading = false;
		}
	}

	async function handleLeaveEvent() {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		const confirmed = await showConfirm({
			title: i18n.t('leave_event_title'),
			message: i18n.t('leave_event_message'),
			confirmLabel: i18n.t('leave_event'),
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
			error = getFriendlyErrorMessage(err, i18n.t('could_not_leave_event'));
		} finally {
			actionLoading = false;
		}
	}

	async function handleCancelEvent() {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		const confirmed = await showConfirm({
			title: i18n.t('cancel_event_title'),
			message: i18n.t('cancel_event_message', { title: event.title }),
			confirmLabel: i18n.t('cancel_event'),
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
			error = getFriendlyErrorMessage(err, i18n.t('could_not_cancel_event'));
		} finally {
			actionLoading = false;
		}
	}

	async function handleFinishEvent() {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		const confirmed = await showConfirm({
			title: i18n.t('finish_event_title'),
			message: i18n.t('finish_event_message'),
			confirmLabel: i18n.t('finish_event')
		});

		if (!confirmed) return;

		actionLoading = true;
		error = '';

		try {
			await finishEvent(event.id, currentUser.uid);
			await reloadEvent();
		} catch (err) {
			console.error('Finish event error:', err);
			error = getFriendlyErrorMessage(err, i18n.t('could_not_finish_event'));
		} finally {
			actionLoading = false;
		}
	}

	async function handleToggleParticipantPayment(participantId: string, currentStatus: 'paid' | 'pending') {
		const currentUser = auth.currentUser;

		if (!currentUser || !event || !paymentSummary?.splitAmount) return;

		paymentActionLoading = true;
		error = '';

		try {
			await updateEventParticipantPaymentStatus({
				eventId: event.id,
				userId: currentUser.uid,
				participantId,
				status: currentStatus === 'paid' ? 'pending' : 'paid'
			});
			await reloadEvent();
		} catch (err) {
			console.error('Update participant payment error:', err);
			error = getFriendlyErrorMessage(err, 'Could not update participant payment status.');
		} finally {
			paymentActionLoading = false;
		}
	}

	function formatPaymentAmount(amount: number) {
		return `${getCurrencySymbol(event?.currency)}${amount.toFixed(2)}`;
	}

	async function handleRemoveParticipant(participantId: string) {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		const confirmed = await showConfirm({
			title: i18n.t('remove_player_title'),
			message: i18n.t('remove_player_message'),
			confirmLabel: i18n.t('remove_player'),
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
			error = getFriendlyErrorMessage(err, i18n.t('could_not_remove_player'));
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

		cropperInputRef = input;

		const reader = new FileReader();
		reader.onload = () => {
			cropperImageSrc = reader.result as string;
			showCropper = true;
		};
		reader.readAsDataURL(file);
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
			error = getFriendlyErrorMessage(err, i18n.t('could_not_send_message'));
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
			await goto(resolve(`/organizations/${event.organizationId}/manage`));
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

	$effect(() => {
		if (page.url.searchParams.get('promote') === 'true' && event && canPromoteThisEvent && event.organizationVerificationStatus === 'verified') {
			const cleanUrl = new URL(window.location.href);
			cleanUrl.searchParams.delete('promote');
			window.history.replaceState({}, '', cleanUrl.toString());
			showPromoteModal = true;
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
	class="hidden items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900 sm:inline-flex"
>
	<span class="leading-none">←</span>
	<span>{i18n.t('back')}</span>
</button>

{#if loading}
	<div
		class="mt-8 rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
	>
		<p class="text-slate-500 dark:text-slate-400">{i18n.t('loading_event')}</p>
	</div>
{:else if error && !event}
	<div
		class="mt-8 rounded-4xl border border-red-200 bg-red-50 p-8 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
	>
		{error}
	</div>
{:else if event}
	<div class="mt-0 grid min-w-0 max-w-full gap-6 px-5 pb-28 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] sm:mt-8 sm:px-0 sm:pb-0">
		<div class="min-w-0 max-w-full space-y-6">
						<section class="space-y-4 sm:hidden">
							<div class="relative -mx-5 -mt-2 overflow-hidden bg-slate-950">
									<img src={getEventHeroImage(event)} alt={event.title} class="h-52 w-full object-cover" loading="eager" />
								<div class="absolute inset-0 bg-gradient-to-t from-white via-white/10 to-transparent dark:from-slate-950"></div>

								<button
									type="button"
									onclick={() => goBack(resolve('/dashboard'))}
									class="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-950 shadow-sm backdrop-blur"
					aria-label={i18n.t('back_aria')}
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="2.8" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
									</svg>
								</button>

								<div class="absolute right-4 top-4 flex items-center gap-2">
									<button
										type="button"
										onclick={shareEvent}
										class="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-950 shadow-sm backdrop-blur"
						aria-label={i18n.t('share_event_aria')}
									>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 overflow-visible" fill="none" viewBox="0 0 24 24" stroke-width="2.1" stroke="currentColor">
											<path stroke-linecap="round" d="m8.9 10.75 6.2-3.5M8.9 13.25l6.2 3.5" />
											<circle cx="6.75" cy="12" r="2.35" />
											<circle cx="17.25" cy="6" r="2.35" />
											<circle cx="17.25" cy="18" r="2.35" />
										</svg>
									</button>
								<button
									type="button"
									onclick={toggleSavedEvent}
									class="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-950 shadow-sm backdrop-blur"
					aria-label={isSavedEvent ? i18n.t('unsave_event_aria') : i18n.t('save_event_aria')}
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill={isSavedEvent ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
									</svg>
								</button>
							</div>
						</div>

							<div class="space-y-3 pt-1">
								<h1 class="break-words text-[2rem] font-black leading-[1.02] tracking-tight text-slate-950 dark:text-slate-50">
									{event.title}
								</h1>

							<div class="flex flex-wrap items-center gap-2">
								<span class="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-blue-700 dark:bg-blue-950 dark:text-blue-300">
					{event.eventKind === 'tournament' ? i18n.t('status_tournament') : formatSport(event.sport)}
								</span>
								<span class="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black capitalize text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{effectiveStatus}</span>
					<span class="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-700 dark:bg-amber-950 dark:text-amber-300">{getLevelLabel(event.level)}</span>
								{#if isPromotionActive(event)}
									<span class="rounded-full bg-orange-50 px-3 py-1 text-[11px] font-black text-orange-600 dark:bg-orange-950 dark:text-orange-300">↗ {i18n.t('event_promoted')}</span>
								{/if}
							</div>
						</div>

							<div class="sticky top-0 z-20 -mx-5 bg-white/95 px-5 py-2 backdrop-blur dark:bg-slate-950/95">
								<div class="grid grid-cols-4 rounded-[1.35rem] bg-white p-1 text-sm font-black text-slate-500 shadow-sm shadow-slate-200/70 ring-1 ring-slate-200/80 dark:bg-slate-900 dark:text-slate-400 dark:shadow-none dark:ring-slate-800">
								{#each [
									['overview', i18n.t('overview')],
									['players', i18n.t('players')],
									['chat', i18n.t('chat')],
									['location', i18n.t('location')]
								] as [tab, label]}
									<button
										type="button"
										onclick={() => (activeEventTab = tab as typeof activeEventTab)}
											class={`min-w-0 rounded-[1rem] px-2 py-2.5 text-center transition ${
												activeEventTab === tab
													? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
													: 'hover:bg-slate-50 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100'
											}`}
										>
											<span class="block truncate">{label}</span>
									</button>
								{/each}
							</div>
						</div>

						{#if activeEventTab === 'overview'}
								<div class="rounded-[1.25rem] bg-white p-3.5 shadow-sm shadow-slate-200/60 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
									<div class="grid grid-cols-2 gap-3">
										<div class="min-w-0 border-r border-slate-100 pr-3 dark:border-slate-800">
											<div class="flex items-center gap-1.5 text-slate-400">
												<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25m10.5-2.25v2.25M3.75 8.25h16.5M5.25 5.25h13.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-12a1.5 1.5 0 0 1 1.5-1.5Z" />
												</svg>
												<p class="text-[10px] font-black uppercase tracking-[0.16em]">{i18n.t('date')}</p>
											</div>
											<p class="mt-1 truncate text-sm font-black text-slate-950 dark:text-slate-50">{formatShortDate(event.startAt)}</p>
											<p class="text-xs font-semibold text-slate-500 dark:text-slate-400">{formatShortTime(event.startAt)}</p>
										</div>
										<div class="min-w-0">
											<div class="flex items-center gap-1.5 text-slate-400">
												<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" d="M12 21s6-5.25 6-11a6 6 0 1 0-12 0c0 5.75 6 11 6 11Z" />
													<path stroke-linecap="round" stroke-linejoin="round" d="M12 10.5h.008" />
												</svg>
												<p class="text-[10px] font-black uppercase tracking-[0.16em]">{i18n.t('location')}</p>
											</div>
											<p class="mt-1 truncate text-sm font-black text-slate-950 dark:text-slate-50">{event.location.name}</p>
											<p class="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{event.location.address ?? formatPriceLabel(event)}</p>
										</div>
								</div>
							</div>

							<div class="rounded-[1.25rem] bg-white p-3.5 shadow-sm shadow-slate-200/60 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
								<div class="flex items-center justify-between gap-3">
									{#if event.hostType === 'organization'}
										<a href={resolve(`/organizations/${event.organizationId}`)} class="flex min-w-0 flex-1 items-center gap-3">
											<div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-lg font-black text-blue-600 dark:bg-slate-800 dark:text-blue-300">
												{#if event.organizationLogoURL}
													<img src={event.organizationLogoURL} alt={event.organizationName ?? 'Organization'} class="h-full w-full object-cover" />
												{:else}
													{event.organizationName?.charAt(0).toUpperCase() ?? 'O'}
												{/if}
											</div>
											<div class="min-w-0">
												<div class="flex items-center gap-1.5">
													<p class="truncate text-sm font-black text-slate-950 dark:text-slate-50">{event.organizationName ?? 'Organization'}</p>
													{#if event.organizationVerificationStatus === 'verified'}<span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white">✓</span>{/if}
												</div>
												<p class="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
													{formatReviewSummary()}
												</p>
											</div>
										</a>
									{:else if hostProfile}
										<a href={resolve(`/users/${hostProfile.id}`)} class="flex min-w-0 flex-1 items-center gap-3">
											<UserAvatar photoURL={hostProfile.photoURL} displayName={hostProfile.displayName} email={hostProfile.email} size="sm" />
											<div class="min-w-0">
												<p class="truncate text-sm font-black text-slate-950 dark:text-slate-50">{hostProfile.displayName}</p>
												<p class="text-xs font-semibold text-slate-500 dark:text-slate-400">{i18n.t('host')}</p>
											</div>
										</a>
									{/if}

									<div class="shrink-0 border-l border-slate-100 pl-3 text-right dark:border-slate-800">
										<p class="text-sm font-black text-blue-600 dark:text-blue-300">{participants.length}/{event.maxParticipants}</p>
										<p class="text-[11px] font-bold text-slate-500 dark:text-slate-400">{i18n.t('players')}</p>
									</div>
								</div>

								{#if canContactOrganizer}
									<button type="button" onclick={contactOrganizer} disabled={contactLoading} class="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
										{contactLoading ? i18n.t('opening') : i18n.t('message_organizer')}
									</button>
								{/if}

								{#if canPromoteThisEvent}
									{#if isPromotionActive(event)}
										<div class="mt-3 rounded-2xl bg-blue-50 p-4 dark:bg-blue-950/40">
											<div class="flex items-center justify-between gap-3">
												<div class="min-w-0">
													<p class="font-black text-xs text-blue-700 dark:text-blue-300">{i18n.t('promotion_active')}</p>
													{#if promotionStats}
														<p class="mt-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
															{promotionStats.views} views · {promotionStats.clicks} clicks
														</p>
													{/if}
												</div>
												<button
													type="button"
													onclick={handleStopPromotion}
													disabled={stoppingPromotion}
													class="rounded-xl bg-white px-3 py-1.5 text-xs font-black text-slate-800 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-60 dark:bg-slate-900 dark:text-slate-100"
												>
													{stoppingPromotion ? '...' : 'Stop'}
												</button>
											</div>
										</div>
									{:else}
										{@const isOrgVerified = event.organizationVerificationStatus === 'verified'}
										<button
											type="button"
											onclick={() => { if (isOrgVerified) showPromoteModal = true; }}
											disabled={!isOrgVerified}
											class={`mt-3 w-full rounded-2xl px-4 py-2.5 text-sm font-black text-white shadow-lg transition ${
												isOrgVerified 
													? 'bg-blue-600 shadow-blue-600/25 hover:bg-blue-700 cursor-pointer' 
													: 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60 shadow-none'
											}`}
										>
											{i18n.t('promote_event')}
										</button>
										{#if !isOrgVerified}
											<p class="mt-2 text-center text-xs font-semibold text-red-600 dark:text-red-400">
												{i18n.t('requires_verified_organization_promotion')}
											</p>
										{/if}
									{/if}
								{/if}
							</div>

							<div class="rounded-[1.25rem] bg-white p-3.5 shadow-sm shadow-slate-200/60 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
								<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
									<div class="min-w-0">
										<p class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{i18n.t('price')}</p>
										<p class="mt-1 text-sm font-black text-slate-950 dark:text-slate-50 break-words">{formatPriceLabel(event)}</p>
									</div>
									<span class="inline-block self-start rounded-full bg-green-50 px-3 py-1.5 text-xs font-black text-green-700 dark:bg-green-950 dark:text-green-300 sm:self-auto shrink-0">
										{effectiveStatus === 'full' ? i18n.t('event_full_msg') : i18n.t('spots_available')}
									</span>
								</div>
							</div>

							<div class="space-y-2 px-1">
								<p class="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{i18n.t('description')}</p>
								<p class="text-[14px] font-medium leading-6 text-slate-700 dark:text-slate-300">
									{event.description || i18n.t('no_description')}
								</p>
							</div>

							<div class="grid grid-cols-3 divide-x divide-slate-100 overflow-hidden rounded-[1.15rem] bg-white shadow-sm shadow-slate-200/60 ring-1 ring-slate-200/70 dark:divide-slate-800 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
								<div class="min-w-0 p-3 text-center">
									<p class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{i18n.t('skill')}</p>
									<p class="mt-1 truncate text-xs font-black text-slate-950 dark:text-slate-50">{getLevelLabel(event.level)}</p>
								</div>
								<div class="min-w-0 p-3 text-center">
									<p class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{i18n.t('weather')}</p>
									<div class="mt-1 flex justify-center"><EventWeather lat={event.location.lat} lng={event.location.lng} startAt={event.startAt} size="sm" /></div>
								</div>
								<div class="min-w-0 p-3 text-center">
									<p class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{i18n.t('duration')}</p>
									<p class="mt-1 truncate text-xs font-black text-slate-950 dark:text-slate-50">{formatEventDuration(event)}</p>
								</div>
								{#if event.routeDistanceKm !== null && event.routeDistanceKm !== undefined}
									<div class="min-w-0 p-3 text-center">
										<p class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Percurso</p>
										<p class="mt-1 truncate text-xs font-black text-slate-950 dark:text-slate-50">{event.routeDistanceKm.toFixed(2)} km</p>
									</div>
								{/if}
							</div>

							{#if event.whatToBring}
								<div class="rounded-[1.25rem] bg-white p-3.5 shadow-sm shadow-slate-200/60 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
									<p class="text-sm font-black text-slate-950 dark:text-slate-50">{i18n.t('what_to_bring')}</p>
									<p class="mt-1 whitespace-pre-line text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{event.whatToBring}</p>
								</div>
							{/if}

							{#if event?.eventKind !== 'tournament'}
								<div class="rounded-[1.25rem] bg-white p-4 shadow-sm shadow-slate-200/60 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
									<div class="flex items-center justify-between gap-4">
										<div>
											<p class="text-base font-black text-slate-950 dark:text-slate-50">{i18n.t('players')}</p>
											<p class="text-sm font-bold text-slate-500 dark:text-slate-400">{participants.length}/{event.maxParticipants} {i18n.t('confirmed')}</p>
										</div>
										<div class="flex -space-x-2 overflow-hidden pl-2">
											{#each participants.slice(0, 4) as participant (participant.id)}
												<UserAvatar photoURL={participant.photoURL} displayName={participant.displayName} email={participant.email} size="sm" />
											{/each}
											{#if participants.length > 4}<span class="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-xs font-black text-slate-600 dark:border-slate-950 dark:bg-slate-800 dark:text-slate-300">+{participants.length - 4}</span>{/if}
										</div>
									</div>
									<div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
										<div class="h-full rounded-full bg-blue-600" style={`width: ${Math.min(100, (participants.length / event.maxParticipants) * 100)}%`}></div>
									</div>
										<div class="mt-4 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
											{#if canAddToGoogleCalendar}
												<a
													href={googleCalendarUrl}
													target="_blank"
													rel="noopener noreferrer"
													aria-label={i18n.t('add_to_google_calendar_aria')}
													class="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-700 shadow-sm shadow-blue-100/70 transition active:scale-[0.98] dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200"
												>
													<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<rect x="3" y="5" width="18" height="16" rx="2" />
														<path d="M7 3v4M17 3v4M3 10h18M12 14v4M10 16h4" />
													</svg>
													{i18n.t('add_to_google_calendar')}
												</a>
											{/if}
											{#if event.location.lat && event.location.lng}
												<a
													href={`https://www.google.com/maps/dir/?api=1&destination=${event.location.lat},${event.location.lng}`}
													target="_blank"
													rel="noopener noreferrer"
													aria-label={i18n.t('get_directions_aria')}
													class="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm shadow-slate-200/50 transition active:scale-[0.98] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:shadow-none"
												>
													<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<path d="M12 21s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11Z" />
														<circle cx="12" cy="10" r="2.5" />
													</svg>
													{i18n.t('get_directions')}
												</a>
											{/if}
									{#if canInvite}<a href={resolve(`/events/${event.id}/invite`)} class="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-center text-sm font-black leading-tight text-slate-800 shadow-sm shadow-slate-200/50 transition active:scale-[0.98] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:shadow-none">{i18n.t('invite_people')}</a>{/if}
											{#if canJoin}
												<button onclick={handleJoinEvent} disabled={actionLoading} class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition active:scale-[0.98] disabled:opacity-60">{actionLoading ? i18n.t('joining') : i18n.t('join_event')}</button>
											{:else if canRequestJoin}
												<button onclick={handleRequestToJoin} disabled={actionLoading} class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition active:scale-[0.98] disabled:opacity-60">{actionLoading ? i18n.t('requesting') : i18n.t('request_to_join')}</button>
											{:else if hasPendingJoinRequest}
												<button disabled class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">{i18n.t('request_pending')}</button>
											{/if}
											{#if isParticipant && !isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}<button type="button" onclick={handleLeaveEvent} disabled={actionLoading} class="inline-flex min-h-11 items-center justify-center rounded-2xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-black text-red-700 transition active:scale-[0.98] disabled:opacity-60 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{actionLoading ? i18n.t('leaving') : i18n.t('leave_event')}</button>{/if}
											{#if isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
												<a href={resolve(`/events/${event.id}/edit`)} class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-950 px-3 py-2.5 text-center text-sm font-black leading-tight text-white shadow-lg shadow-slate-950/10 transition active:scale-[0.98] dark:bg-white dark:text-slate-950">{i18n.t('edit_event')}</a>
												<button type="button" onclick={handleFinishEvent} disabled={actionLoading} class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-blue-600 px-3 py-2.5 text-center text-sm font-black leading-tight text-white shadow-lg shadow-blue-600/20 transition active:scale-[0.98] disabled:opacity-60">{i18n.t('finish_event')}</button>
												<button type="button" onclick={handleCancelEvent} disabled={actionLoading} class="inline-flex min-h-11 items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 text-center text-sm font-black leading-tight text-red-700 transition active:scale-[0.98] disabled:opacity-60 min-[380px]:col-span-2 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{i18n.t('cancel_event')}</button>
											{/if}
										</div>
									</div>
								{/if}
							{:else if activeEventTab === 'players'}
								<div class="-mx-1 space-y-3">
									<div class="flex items-center justify-between px-1">
										<div>
											<p class="text-lg font-black text-slate-950 dark:text-slate-50">{i18n.t('players')}</p>
											<p class="text-sm font-bold text-slate-500 dark:text-slate-400">{participants.length}/{event.maxParticipants} {i18n.t('confirmed')}</p>
										</div>
										{#if canInvite}<a href={resolve(`/events/${event.id}/invite`)} class="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white">{i18n.t('invite_people')}</a>{/if}
									</div>

									{#if effectiveStatus === 'finished' && paymentSummary?.splitAmount != null}
										<div class="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/35">
											<div class="flex items-start justify-between gap-3">
												<div>
													<p class="text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Payments</p>
													<p class="mt-1 text-sm font-black text-slate-950 dark:text-slate-50">{formatPaymentAmount(paymentSummary.splitAmount)} split</p>
													<p class="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Host excluded from payment, included in the split.</p>
												</div>
												<div class="rounded-2xl bg-white px-3 py-2 text-right shadow-sm dark:bg-slate-900">
													<p class="text-base font-black text-emerald-700 dark:text-emerald-300">{paymentSummary.payerIds.length}</p>
													<p class="text-[10px] font-bold text-slate-500 dark:text-slate-400">pay</p>
												</div>
											</div>

											<div class="mt-3 space-y-2">
												{#each paymentSummary.payerIds as participantId}
													{@const participant = participantById[participantId]}
													{@const currentStatus = paymentSummary.statuses[participantId] === 'paid' ? 'paid' : 'pending'}
													<div class="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-sm dark:bg-slate-900">
														<div class="flex min-w-0 items-center gap-2.5">
															<UserAvatar
																photoURL={participant?.photoURL}
																displayName={participant?.displayName ?? participantId}
																email={participant?.email}
																size="sm"
															/>
															<div class="min-w-0">
																<p class="truncate text-sm font-black text-slate-950 dark:text-slate-50">
																	{participant?.displayName ?? participantId}
																</p>
																<p class="text-xs font-semibold text-slate-500 dark:text-slate-400">{formatPaymentAmount(paymentSummary.splitAmount)} due</p>
															</div>
														</div>

														<button
															type="button"
															onclick={() => handleToggleParticipantPayment(participantId, currentStatus)}
															disabled={paymentActionLoading}
															class={`rounded-full px-3 py-1.5 text-xs font-black transition disabled:opacity-60 ${currentStatus === 'paid'
																? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300'
																: 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300'}`}
														>
															{currentStatus === 'paid' ? 'Paid' : 'Pending'}
														</button>
													</div>
												{/each}
											</div>
										</div>
									{/if}
									<div class="divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white dark:divide-slate-800 dark:bg-slate-900">
										{#each participants as participant (participant.id)}
											<a href={resolve(`/users/${participant.id}`)} class="flex items-center gap-3 px-3 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800">
												<UserAvatar photoURL={participant.photoURL} displayName={participant.displayName} email={participant.email} size="sm" />
												<div class="min-w-0 flex-1">
													<p class="truncate text-sm font-black text-slate-950 dark:text-slate-50">{participant.displayName}</p>
													<p class="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">@{participant.rallyTag ?? participant.email}</p>
												</div>
												{#if participant.id === event.creatorId}<span class="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">{i18n.t('host')}</span>{/if}
											</a>
										{:else}
											<p class="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400">{i18n.t('no_players')}</p>
										{/each}
									</div>
								</div>
								{:else if activeEventTab === 'location'}
									<div class="-mx-1 space-y-4">
										<div class="flex items-start justify-between gap-3 px-1">
											<div class="min-w-0">
												<p class="truncate text-lg font-black text-slate-950 dark:text-slate-50">{event.location.name}</p>
												{#if event.location.address}<p class="mt-0.5 line-clamp-2 text-sm font-semibold leading-5 text-slate-500 dark:text-slate-400">{event.location.address}</p>{/if}
											</div>
											{#if event.location.lat && event.location.lng}
												<a href={`https://www.google.com/maps/dir/?api=1&destination=${event.location.lat},${event.location.lng}`} target="_blank" rel="noopener noreferrer" aria-label={i18n.t('get_directions_aria')} class="shrink-0 rounded-full bg-blue-50 px-3.5 py-2 text-xs font-black text-blue-600 transition active:scale-[0.98] dark:bg-blue-950 dark:text-blue-300">{i18n.t('get_directions')}</a>
											{/if}
										</div>
										<div class="overflow-hidden rounded-[1.35rem] bg-white shadow-sm shadow-slate-200/60 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
											<EventMap lat={event.location.lat ?? null} lng={event.location.lng ?? null} name={event.location.name} address={event.location.address ?? ''} route={event.route ?? []} compact={true} showHeader={false} />
										</div>
									</div>
								{:else if activeEventTab === 'chat'}
										{#if canAccessGroupChat && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
											<section class="-mx-5 -mb-6 flex min-h-[calc(100dvh-18rem)] flex-col bg-white dark:bg-slate-950">
											<div bind:this={messagesContainer} class="min-h-[20rem] flex-1 overflow-y-auto px-4 py-5">
												{#if groupChatLoading}
													<div class="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">{i18n.t('loading_group_chat')}</div>
												{:else if groupMessages.length === 0}
												<div class="flex h-full items-center justify-center text-center">
													<div class="flex flex-col items-center">
														<div class="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-2xl font-black text-blue-600 dark:bg-slate-800 dark:text-blue-300">
															{event.title.slice(0, 1).toUpperCase()}
														</div>
														<p class="mt-3 font-bold text-slate-700 dark:text-slate-200">{i18n.t('no_messages_yet')}</p>
														<p class="mt-1 max-w-[17rem] text-sm text-slate-500 dark:text-slate-400">{i18n.t('first_group_message')}</p>
													</div>
												</div>
											{:else}
													<ChatMessageList messages={groupMessages} currentUserId={auth.currentUser?.uid} getSenderProfile={(senderId) => participantById[senderId]} typingLabel={groupTypingLabel} showSenderName={true} />
												{/if}
											</div>
											<form class="sticky bottom-0 border-t border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950" onsubmit={(submitEvent) => { submitEvent.preventDefault(); handleSendGroupMessage(); }}>
												<div class="mx-auto flex max-w-3xl items-center gap-2 rounded-full bg-slate-100 px-3 py-2 dark:bg-slate-900">
													<input bind:value={groupMessageText} oninput={handleGroupTyping} maxlength={TEXT_LIMITS.chatMessage} placeholder={i18n.t('message_group_placeholder')} class="min-w-0 flex-1 border-0 bg-transparent px-2 text-sm text-slate-950 placeholder:text-slate-400 focus:ring-0 dark:text-white" />
													<button type="submit" disabled={groupChatSending || !groupMessageText.trim()} class="rounded-full bg-blue-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">{groupChatSending ? '...' : i18n.t('send')}</button>
												</div>
										</form>
									</section>
							{:else}
								<p class="rounded-2xl bg-white p-4 text-sm font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800">{i18n.t('join_to_access_chat')}</p>
							{/if}
						{/if}

						{#if error}
							<div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
								{error}
							</div>
						{/if}
					</section>

			<section
				class="hidden overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:block sm:rounded-4xl"
			>
					<div class="relative h-56 overflow-hidden bg-slate-950 lg:h-64">
					<img src={getEventHeroImage(event)} alt={event.title} class="h-full w-full object-cover" />
					<div class="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent"></div>

					<div class="absolute bottom-0 left-0 right-0 p-8">
						<div class="flex flex-wrap items-center gap-2">
							<span class="rounded-full bg-white/95 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-blue-600">
								{getSportLabel(event.sport)}
							</span>
							<span class="rounded-full bg-white/90 px-3 py-1 text-xs font-black capitalize text-slate-700">
								{getStatusLabel(effectiveStatus)}
							</span>
							<span class="rounded-full bg-white/90 px-3 py-1 text-xs font-black capitalize text-slate-700">
								{getLevelLabel(event.level)}
							</span>
							{#if isPromotionActive(event)}
								<span class="rounded-full bg-orange-500 px-3 py-1 text-xs font-black text-white">
									{i18n.t('event_promoted')}
								</span>
							{/if}
						</div>

						<h1 class="mt-4 max-w-3xl break-words text-4xl font-black tracking-tight text-white">
							{event.title}
						</h1>
					</div>

					{#if isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
						<label
							title="Edit group photo"
							class="absolute right-5 top-5 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white text-blue-600 shadow-lg transition hover:bg-blue-50"
						>
							{#if groupPhotoSaving}
								…
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.4" stroke="currentColor" class="h-5 w-5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18A2.25 2.25 0 0 0 4.5 20.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
								</svg>
							{/if}
							<input type="file" accept="image/*" class="hidden" onchange={handleGroupPhotoFileChange} />
						</label>
					{/if}
				</div>

				<div class="p-8">
					{#if event.recurringGroupId}
						<span
							class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300"
						>
							🔁 Part of a recurring series ({event.recurringIndex}/{event.recurringTotal})
						</span>
					{/if}

					<p class="text-slate-600 dark:text-slate-300 {event.recurringGroupId ? 'mt-4' : ''}">
						{event.description || i18n.t('no_description')}
					</p>

				<div class="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:grid-cols-3 sm:gap-4">
					<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
						<p class="text-sm font-medium text-slate-500 dark:text-slate-400">{i18n.t('date')}</p>
						<p class="mt-2 font-bold text-slate-950 dark:text-slate-50">
							{formatDate(event.startAt)}
						</p>
					</div>

					<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
						<p class="text-sm font-medium text-slate-500 dark:text-slate-400">{i18n.t('location')}</p>
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
								<img src="/map_location_icon.png" alt="Map icon" class="h-5 w-5 shrink-0 object-contain" />
								<span>{i18n.t('directions')}</span>
							</a>
						{/if}
					</div>

					<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
						<p class="text-sm font-medium text-slate-500 dark:text-slate-400">{i18n.t('skill')}</p>
						<p class="mt-2 font-bold capitalize text-slate-950 dark:text-slate-50">
							{getLevelLabel(event.level)}
						</p>
					</div>

					<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
						<p class="text-sm font-medium text-slate-500 dark:text-slate-400">{i18n.t('duration')}</p>
						<p class="mt-2 font-bold text-slate-950 dark:text-slate-50">
							{formatEventDuration(event)}
						</p>
					</div>

					{#if event.routeDistanceKm !== null && event.routeDistanceKm !== undefined}
						<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
							<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Percurso</p>
							<p class="mt-2 font-bold text-slate-950 dark:text-slate-50">{event.routeDistanceKm.toFixed(2)} km</p>
						</div>
					{/if}

					<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
						<p class="text-sm font-medium text-slate-500 dark:text-slate-400">{i18n.t('price')}</p>
						<p class="mt-2 font-bold text-slate-950 dark:text-slate-50">
							{formatPriceLabel(event)}
						</p>
					</div>

					<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800 flex flex-col justify-between">
						<p class="text-sm font-medium text-slate-500 dark:text-slate-400">{i18n.t('weather')}</p>
						<div class="mt-2.5">
							<EventWeather lat={event.location.lat} lng={event.location.lng} startAt={event.startAt} size="md" />
						</div>
					</div>
				</div>

				{#if event.whatToBring}
					<div class="mt-6 rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
						<p class="text-sm font-medium text-slate-500 dark:text-slate-400">{i18n.t('what_to_bring')}</p>
						<p class="mt-2 whitespace-pre-line font-bold text-slate-950 dark:text-slate-50">
							{event.whatToBring}
						</p>
					</div>
				{/if}

				</div>

				{#if event?.eventKind !== 'tournament'}
					<div
						class="mt-8 rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
					>
						<div class="flex items-center justify-between gap-4">
							<div>
								<p
									class="text-sm font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400"
								>
									{i18n.t('players')}
								</p>

								<h2 class="mt-2 text-2xl font-black text-slate-950 dark:text-slate-50">
									{i18n.t('people_in_this_event')}
								</h2>
							</div>

							<div class="rounded-2xl bg-blue-50 px-4 py-2 text-center dark:bg-blue-950">
								<p class="text-lg font-black text-blue-600 dark:text-blue-300">
									{participants.length}/{event.maxParticipants}
								</p>
								<p class="text-xs font-medium text-slate-500 dark:text-slate-400">{i18n.t('players_lowercase')}</p>
							</div>
						</div>

						{#if effectiveStatus === 'finished' && paymentSummary?.splitAmount != null}
							<div class="mt-5 rounded-2xl bg-emerald-50 p-5 dark:bg-emerald-950/35">
								<div class="flex items-start justify-between gap-4">
									<div>
										<p class="text-sm font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
											Payments
										</p>
										<h3 class="mt-1 text-lg font-black text-slate-950 dark:text-slate-50">
											Settled split
										</h3>
										<p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
											The host is included in the split but does not owe payment.
										</p>
									</div>
									<div class="rounded-2xl bg-white px-4 py-3 text-right shadow-sm dark:bg-slate-900">
										<p class="text-2xl font-black text-emerald-700 dark:text-emerald-300">
											{formatPaymentAmount(paymentSummary.splitAmount)}
										</p>
										<p class="text-xs font-semibold text-slate-500 dark:text-slate-400">
											{paymentSummary.payerIds.length} participants pay
										</p>
									</div>
								</div>

								<div class="mt-4 space-y-2">
									{#each paymentSummary.payerIds as participantId}
										{@const participant = participantById[participantId]}
										{@const currentStatus = paymentSummary.statuses[participantId] === 'paid' ? 'paid' : 'pending'}
										<div class="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-slate-900">
											<div class="flex min-w-0 items-center gap-3">
												<UserAvatar
													photoURL={participant?.photoURL}
													displayName={participant?.displayName ?? participantId}
													email={participant?.email}
													size="sm"
												/>
												<div class="min-w-0">
													<p class="truncate text-sm font-black text-slate-950 dark:text-slate-50">
														{participant?.displayName ?? participantId}
													</p>
													<p class="text-xs font-semibold text-slate-500 dark:text-slate-400">
														{formatPaymentAmount(paymentSummary.splitAmount)} due
													</p>
												</div>
											</div>

											<button
												type="button"
												onclick={() => handleToggleParticipantPayment(participantId, currentStatus)}
												disabled={paymentActionLoading}
												class={`rounded-full px-3 py-1.5 text-xs font-black transition disabled:opacity-60 ${currentStatus === 'paid'
													? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300'
													: 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300'}`}
											>
												{currentStatus === 'paid' ? 'Paid' : 'Pending'}
											</button>
										</div>
									{/each}
								</div>

								<div class="mt-4 grid gap-2 sm:grid-cols-3">
									<div class="rounded-2xl bg-white px-3 py-2 shadow-sm dark:bg-slate-900">
										<p class="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Paid</p>
										<p class="mt-1 text-sm font-black text-emerald-700 dark:text-emerald-300">{paymentSummary.paidCount}</p>
									</div>
									<div class="rounded-2xl bg-white px-3 py-2 shadow-sm dark:bg-slate-900">
										<p class="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Pending</p>
										<p class="mt-1 text-sm font-black text-amber-700 dark:text-amber-300">{paymentSummary.pendingCount}</p>
									</div>
									<div class="rounded-2xl bg-white px-3 py-2 shadow-sm dark:bg-slate-900">
										<p class="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Remaining</p>
										<p class="mt-1 text-sm font-black text-slate-950 dark:text-slate-50">
											{formatPaymentAmount((paymentSummary.splitAmount ?? 0) * paymentSummary.pendingCount)}
										</p>
									</div>
								</div>
							</div>
						{/if}

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
												{i18n.t('host')}
											</span>
										{:else if isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
											<button
												type="button"
												onclick={() => handleRemoveParticipant(participant.id)}
												disabled={actionLoading}
												class="rounded-full px-4 py-2 text-sm font-black text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950"
											>
												{i18n.t('remove_player')}
											</button>
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<div class="mt-5 rounded-2xl bg-slate-50 p-5 text-center dark:bg-slate-800">
								<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">
									{i18n.t('no_players')}
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

				{#if isCreator && event?.joinPolicy === 'approval' && activeEventTab === 'overview'}
				<section
					class="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-4xl sm:p-6 sm:shadow-xl sm:shadow-slate-200/70"
				>
					<div class="flex items-center justify-between gap-4">
						<div>
							<p
								class="text-sm font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400"
							>
								{i18n.t('requests')}
							</p>
							<h2 class="mt-2 text-xl font-black text-slate-950 dark:text-slate-50 sm:text-2xl">
								{i18n.t('join_requests')}
							</h2>
						</div>

						{#if pendingJoinRequests.length > 0}
							<div class="rounded-2xl bg-blue-50 px-4 py-2 text-center dark:bg-blue-950">
								<p class="text-lg font-black text-blue-600 dark:text-blue-300">
									{pendingJoinRequests.length}
								</p>
								<p class="text-xs font-medium text-slate-500 dark:text-slate-400">{i18n.t('pending')}</p>
							</div>
						{/if}
					</div>

					{#if pendingJoinRequests.length === 0}
						<div class="mt-5 rounded-2xl bg-slate-50 p-5 text-center dark:bg-slate-800">
							<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">
								{i18n.t('no_pending_requests')}
							</p>
						</div>
					{:else}
						<div class="mt-5 space-y-3">
							{#each pendingJoinRequests as request (request.id)}
								{@const requester = pendingRequesters.find((p) => p.id === request.userId)}
								<div
									class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4"
								>
									<UserAvatar
										photoURL={requester?.photoURL}
										displayName={requester?.displayName ?? i18n.t('rally_user')}
										email={requester?.email}
										size="md"
									/>

									<div class="min-w-0">
										<p class="truncate text-sm font-bold text-slate-950 dark:text-slate-50 sm:text-base">
											{requester?.displayName ?? i18n.t('rally_user')}
										</p>
										{#if requester?.rallyTag}
											<p class="truncate text-xs text-slate-500 dark:text-slate-400">
												@{requester.rallyTag}
											</p>
										{/if}
									</div>

									<div class="flex shrink-0 flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:gap-2">
										<button
											type="button"
											onclick={() => handleRespondToJoinRequest(request.id, 'declined')}
											disabled={joinRequestActionLoading}
											class="rounded-full px-2.5 py-1.5 text-xs font-black text-red-600 transition hover:bg-red-50 disabled:opacity-60 sm:px-3 sm:py-2 sm:text-sm dark:text-red-400 dark:hover:bg-red-950"
										>
											{i18n.t('decline')}
										</button>

										<button
											type="button"
											onclick={() => handleRespondToJoinRequest(request.id, 'accepted')}
											disabled={joinRequestActionLoading}
											class="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-black text-white transition hover:bg-blue-700 disabled:opacity-60 sm:px-4 sm:py-2 sm:text-sm"
										>
											{i18n.t('accept')}
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</section>
			{/if}

				{#if canManageTournament && event?.eventKind === 'tournament' && activeEventTab === 'overview' && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
					<a
						href={resolve(`/events/${event.id}/tournament/edit`)}
						class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-slate-950/10 transition active:scale-[0.98] dark:bg-white dark:text-slate-950 sm:hidden"
					>
						{i18n.t('edit_tournament')}
					</a>
				{/if}

				{#if event?.eventKind === 'tournament' && activeEventTab === 'overview'}
					<TournamentPanel {event} {currentUserId} canManage={canManageTournament} />
				{/if}

				{#if canAccessGroupChat && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
						<section
							class="hidden overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:block sm:rounded-4xl sm:shadow-xl sm:shadow-slate-200/70"
					>
						<div class="flex items-center gap-3 border-b border-slate-100 p-3 dark:border-slate-800 sm:gap-4 sm:p-5">
						{#if event.groupPhotoURL}
							<img
								src={event.groupPhotoURL}
								alt={event.title}
									class="h-9 w-9 rounded-full object-cover ring-2 ring-white dark:ring-slate-800 sm:h-12 sm:w-12"
							/>
						{:else}
							<div
									class="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-base font-black text-blue-600 ring-2 ring-white dark:bg-blue-950 dark:text-blue-300 dark:ring-slate-800 sm:h-12 sm:w-12 sm:text-lg"
							>
								{event.title.slice(0, 1).toUpperCase()}
							</div>
						{/if}

						<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-black text-slate-950 dark:text-white sm:text-lg">
								{event.title}
							</p>
								<p class="truncate text-[11px] text-slate-500 dark:text-slate-400 sm:text-sm">
								Group chat · {event.participantIds.length} members
							</p>
						</div>
					</div>

						<div
							bind:this={messagesContainer}
							class="h-[14rem] overflow-y-auto bg-slate-50 px-4 py-4 dark:bg-slate-950 sm:h-[22.5rem] sm:px-5 sm:py-5"
						>
						{#if groupChatLoading}
							<div
								class="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400"
							>
								{i18n.t('loading_group_chat')}
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
									<p class="text-3xl sm:text-4xl">💬</p>
									<p class="mt-2 text-sm font-black text-slate-700 dark:text-slate-200 sm:mt-3 sm:text-base">{i18n.t('no_messages_yet')}</p>
									<p class="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
										{i18n.t('first_group_message')}
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
						class="border-t border-slate-100 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900 sm:px-4 sm:py-3"
						onsubmit={(submitEvent) => {
							submitEvent.preventDefault();
							handleSendGroupMessage();
						}}
					>
						<div
							class="mx-auto flex max-w-3xl items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 dark:bg-slate-950 sm:py-2"
						>
							<input
								bind:value={groupMessageText}
								oninput={handleGroupTyping}
								placeholder={i18n.t('message_group_placeholder')}
								class="min-w-0 flex-1 border-0 bg-transparent px-2 text-sm text-slate-950 placeholder:text-slate-400 focus:ring-0 dark:text-white"
							/>

							<button
								type="submit"
								disabled={groupChatSending || !groupMessageText.trim()}
								class="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-50 sm:px-5"
							>
								{groupChatSending ? '...' : i18n.t('send')}
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
						{i18n.t('hosted_by')}
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

							<p class="text-xs text-slate-500 dark:text-slate-400">{i18n.t('official_organization_host')}</p>
						</div>
					</a>

					{#if canContactOrganizer}
						<button
							type="button"
							onclick={contactOrganizer}
							disabled={contactLoading}
							class="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 font-black text-slate-800 transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-blue-500 dark:hover:bg-slate-700"
						>
							{contactLoading ? i18n.t('opening_chat') : i18n.t('contact_organizer')}
						</button>
					{/if}

					{#if canPromoteThisEvent}
						{#if isPromotionActive(event)}
							<div class="mt-4 rounded-2xl bg-blue-50 p-4 dark:bg-blue-950/40">
								<div class="flex items-center justify-between gap-3">
									<div>
										<p class="font-black text-blue-700 dark:text-blue-300">{i18n.t('promotion_active')}</p>

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
										class="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-800 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-60 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-red-950 dark:hover:text-red-300 sm:px-4 sm:text-sm"
									>
										{stoppingPromotion ? 'Stopping...' : 'Stop'}
									</button>
								</div>
							</div>
						{:else}
							{@const isOrgVerified = event.organizationVerificationStatus === 'verified'}
							<button
								type="button"
								onclick={() => { if (isOrgVerified) showPromoteModal = true; }}
								disabled={!isOrgVerified}
								class={`mt-4 w-full rounded-2xl px-5 py-3 font-black text-white shadow-lg transition ${
									isOrgVerified 
										? 'bg-blue-600 shadow-blue-600/25 hover:bg-blue-700 cursor-pointer' 
										: 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60 shadow-none'
								}`}
							>
								{i18n.t('promote_event')}
							</button>
							{#if !isOrgVerified}
								<p class="mt-2 text-center text-xs font-semibold text-red-600 dark:text-red-400">
									{i18n.t('requires_verified_organization_promotion')}
								</p>
							{/if}
						{/if}
					{/if}
				</div>
			{/if}

			{#if event?.eventKind != 'tournament'}
				<div
					class="rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<div class="flex items-center justify-between gap-3">
						<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">{i18n.t('team_status')}</h2>

						{#if isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
							<div class="flex flex-wrap items-center justify-end gap-2">
								<button
									type="button"
									onclick={handleFinishEvent}
									disabled={actionLoading}
									title={i18n.t('finish_event')}
									aria-label={i18n.t('finish_event')}
									class="inline-flex min-h-10 items-center justify-center rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
								>
									{i18n.t('finish_event')}
								</button>

								<button
									type="button"
									onclick={handleCancelEvent}
									disabled={actionLoading}
									title={i18n.t('cancel_event')}
									aria-label={i18n.t('cancel_event')}
									class="inline-flex min-h-10 items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
								>
									{i18n.t('cancel_event')}
								</button>
							</div>
						{:else if isParticipant && !isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
							<button
								type="button"
								onclick={handleLeaveEvent}
								disabled={actionLoading}
								title={i18n.t('leave_event')}
								aria-label={i18n.t('leave_event')}
								class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 transition hover:bg-red-50 disabled:opacity-60 dark:bg-slate-800 dark:hover:bg-red-950"
							>
								<img src="/leave_icon.png" alt={i18n.t('leave_event')} class="h-5 w-5 object-contain" />
							</button>
						{/if}
					</div>

					<div class="mt-5 rounded-2xl bg-blue-50 p-5 dark:bg-blue-950">
						<p class="text-4xl font-black text-blue-600 dark:text-blue-300">
							{event.participantIds.length}/{event.maxParticipants}
						</p>
						<p class="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
							{i18n.t('confirmed_players')}
						</p>
					</div>

					{#if effectiveStatus === 'cancelled'}
						<div
							class="mt-5 rounded-2xl bg-red-50 px-5 py-4 text-center font-bold text-red-700 dark:bg-red-950 dark:text-red-300"
						>
							{i18n.t('event_cancelled_msg')}
						</div>
					{:else if effectiveStatus === 'finished'}
						<div
							class="mt-5 rounded-2xl bg-slate-100 px-5 py-4 text-center font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300"
						>
							{i18n.t('event_finished_msg')}
						</div>
					{:else if event.status === 'full'}
						<div
							class="mt-5 rounded-2xl bg-slate-100 px-5 py-4 text-center font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300"
						>
							{i18n.t('event_full_msg')}
						</div>
					{:else if canJoin}
						<button
							onclick={handleJoinEvent}
							disabled={actionLoading}
							class="mt-5 w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
						>
							{actionLoading ? i18n.t('joining') : i18n.t('join_event')}
						</button>
					{:else if canRequestJoin}
						<button
							onclick={handleRequestToJoin}
							disabled={actionLoading}
							class="mt-5 w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
						>
							{actionLoading ? i18n.t('requesting') : i18n.t('request_to_join')}
						</button>
					{:else if hasPendingJoinRequest}
						<button
							disabled
							class="mt-5 w-full rounded-2xl bg-slate-100 px-5 py-3 font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400"
						>
							{i18n.t('request_pending')}
						</button>
					{/if}

					{#if canAddToGoogleCalendar}
						<a
							href={googleCalendarUrl}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={i18n.t('add_to_google_calendar_aria')}
							class="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/60"
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect x="3" y="5" width="18" height="16" rx="2" />
								<path d="M7 3v4M17 3v4M3 10h18M12 14v4M10 16h4" />
							</svg>
							{i18n.t('add_to_google_calendar')}
						</a>
					{/if}

					{#if canInvite}
						<a
							href={resolve(`/events/${event.id}/invite`)}
							class="mt-3 block rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-400"
						>
							{i18n.t('invite_people')}
						</a>
					{/if}

					{#if isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
						<a
							href={resolve(`/events/${event.id}/edit`)}
							class="mt-3 block rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-400"
						>
							{i18n.t('edit_event')}
						</a>
					{/if}
				</div>
			{/if}

			{#if canManageTournament && event?.eventKind === 'tournament' && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
				<a
					href={resolve(`/events/${event.id}/tournament/edit`)}
					class="hidden rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-400 sm:block"
				>
					{i18n.t('edit_tournament')}
				</a>
			{/if}

			<EventMap
				lat={event.location.lat ?? null}
				lng={event.location.lng ?? null}
				name={event.location.name}
				address={event.location.address ?? ''}
				route={event.route ?? []}
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
								{i18n.t('promote_event')}
							</p>

							<h2 class="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50">
								{i18n.t('reach_more_people')}
							</h2>

							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								{i18n.t('promote_modal_desc')}
							</p>
						</div>

						<button
							type="button"
							onclick={() => (showPromoteModal = false)}
							class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
							aria-label={i18n.t('close_promote_modal')}
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
									{i18n.t(getPromotionPlanTranslationKey(plan, 'label'))}
								</p>

								<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
									{i18n.t(getPromotionPlanTranslationKey(plan, 'description'))}
								</p>

								<p class="mt-3 text-sm font-black text-blue-600 dark:text-blue-400">
									€{config.cpm} CPM
								</p>

								<p class="mt-1 text-xs font-bold text-slate-400 dark:text-slate-500">
									{i18n.t(getPromotionPlanTranslationKey(plan, 'placement'))}
								</p>
							</button>
						{/each}
					</div>

					<div class="mt-6 grid gap-3 md:grid-cols-3">
						<label class="block">
							<span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
								{i18n.t('budget_label')}
							</span>
							<input
								bind:value={promotionBudget}
								type="number"
								min="1"
								step="1"
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								placeholder="e.g. 25"
							/>
						</label>

						<label class="block">
							<span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
								{i18n.t('duration_label')}
							</span>
							<select
								bind:value={promotionDurationDays}
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							>
								<option value="3" class="text-slate-900 dark:text-slate-50 bg-white dark:bg-slate-800">3 {i18n.t('days')}</option>
								<option value="7" class="text-slate-900 dark:text-slate-50 bg-white dark:bg-slate-800">7 {i18n.t('days')}</option>
								<option value="14" class="text-slate-900 dark:text-slate-50 bg-white dark:bg-slate-800">14 {i18n.t('days')}</option>
								<option value="30" class="text-slate-900 dark:text-slate-50 bg-white dark:bg-slate-800">30 {i18n.t('days')}</option>
							</select>
						</label>

						<label class="block">
							<span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
								{i18n.t('target_country')}
							</span>
							<select
								bind:value={promotionTargetCountry}
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							>
								{#each PROMOTION_COUNTRIES as country}
									<option value={country.code} class="text-slate-900 dark:text-slate-50 bg-white dark:bg-slate-800">{country.label}</option>
								{/each}
							</select>
						</label>

						<label class="block md:col-span-3">
							<span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
								{i18n.t('target_city_region')}
							</span>
							<input
								bind:value={promotionTargetCity}
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								placeholder={i18n.t('optional_example', { value: event.location.name })}
							/>
							<span class="mt-1 block text-xs text-slate-500 dark:text-slate-400">
								{i18n.t('promote_target_help', { sport: event.sport })}
							</span>
						</label>
					</div>

					<div class="mt-6 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
						<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
							{i18n.t('estimated_campaign')}
						</p>

						<p class="mt-2 font-black text-slate-950 dark:text-slate-50">
							≈ {promotionImpressionsPreview} {i18n.t('impressions')} · €{selectedPromotionPlan.cpm} CPM
						</p>

						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
							{i18n.t('placement')}: {i18n.t(getPromotionPlanTranslationKey(promotionPlan, 'placement'))}
						</p>
					</div>

					<div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
						<button
							type="button"
							onclick={() => (showPromoteModal = false)}
							class="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
						>
							{i18n.t('cancel')}
						</button>

						<button
							type="button"
							onclick={handlePromoteEvent}
							disabled={promoting}
							class="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
						>
							{promoting ? i18n.t('starting_campaign') : i18n.t('start_promotion')}
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
		class="fixed inset-0 z-[120] m-0 flex h-full w-full max-w-none items-center justify-center border-0 bg-slate-950/60 px-4 backdrop-blur-sm"
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
					{i18n.t('keep_it')}
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

{#if showCropper && event}
	<ImageCropperModal
		imageSrc={cropperImageSrc}
		shape="rect"
		aspectRatio={16 / 9}
		onConfirm={(croppedFile) => {
			showCropper = false;
			const currentUser = auth.currentUser;
			const activeEvent = event;
			if (!currentUser || !activeEvent) return;

			groupPhotoSaving = true;
			error = '';

			setTimeout(async () => {
				try {
					const uploadedPhoto = await uploadEventGroupPhoto({
						eventId: activeEvent.id,
						userId: currentUser.uid,
						file: croppedFile
					});

					await updateEventGroupPhoto({
						eventId: activeEvent.id,
						userId: currentUser.uid,
						groupPhotoURL: uploadedPhoto.url,
						groupPhotoPath: uploadedPhoto.path
					});

					if (cropperInputRef) cropperInputRef.value = '';
					await reloadEvent();
				} catch (err) {
					console.error('Update group photo error:', err);
					error = getFriendlyErrorMessage(err, 'Could not update group photo.');
				} finally {
					groupPhotoSaving = false;
				}
			}, 50);
		}}
		onCancel={() => {
			showCropper = false;
			if (cropperInputRef) cropperInputRef.value = '';
		}}
	/>
{/if}
