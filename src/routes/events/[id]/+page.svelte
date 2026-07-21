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
		getEventsForUser,
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
	import { getCurrentLocale, formatSport, getCurrencySymbol, getSportBackgroundImage } from '$lib/utils/format.utils';
	import {
		getEventEndMs,
		getEventStartMs,
		getEventTemporalState,
		getMinParticipantsDeadlineMs,
		isMinParticipantsDeadlinePassed,
		isMinParticipantsRequirementMet
	} from '$lib/utils/event-lifecycle.utils';
	import { getOrCreateOrganizationConversation } from '$lib/services/chat.service';
	import {
		confirmEventPayment,
		confirmEventPromotionPayment,
		createEventPaymentCheckout,
		createEventPromotionCheckout,
		sendPaymentReminders
	} from '$lib/services/event-payment.service';
	import TournamentPanel from '$lib/components/tournaments/TournamentPanel.svelte';
	import { getOrganizationReviews } from '$lib/services/organization.service';
	import { TEXT_LIMITS } from '$lib/constants/text-limits';
	import {
		Calendar,
		Clock,
		MapPin,
		Users,
		MessageSquare,
		Share2,
		Bookmark,
		Sparkles,
		Trophy,
		ShieldCheck,
		ChevronRight,
		ArrowLeft,
		AlertCircle,
		CheckCircle2,
		CreditCard,
		Send,
		Camera,
		TrendingUp,
		Compass,
		SunMedium,
		Info,
		ExternalLink,
		X,
		Check,
		DollarSign,
		Zap,
		Briefcase,
		Flame,
		UserCheck,
		UserPlus,
		LogOut,
		Edit3,
		AlertTriangle,
		Bell
	} from '@lucide/svelte';

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
	let activeEventTab = $state<'overview' | 'players' | 'chat' | 'location' | 'tournament'>('overview');
	let isSavedEvent = $state(false);
	let currentUserProfile = $state<UserProfile | null>(null);
	let paymentConfirming = $state(false);
	let lastConfirmedPaymentSessionId = '';

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

	let priceTitleLabel = $derived.by(() => {
		return event?.paymentMode === 'split' ? i18n.t('estimated_price') : i18n.t('price');
	});

	let minParticipantsCount = $derived(event?.minParticipants ?? 0);
	let hasMinParticipantsReq = $derived(minParticipantsCount > 0);
	let minDeadlineMs = $derived(event ? getMinParticipantsDeadlineMs(event) : null);
	let minDeadlinePassed = $derived(event ? isMinParticipantsDeadlinePassed(event) : false);
	let minRequirementMet = $derived(event ? isMinParticipantsRequirementMet(event) : true);
	let minDeadlineFormatted = $derived.by(() => {
		if (!minDeadlineMs) return '';
		const d = new Date(minDeadlineMs);
		return d.toLocaleString(getCurrentLocale(), {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
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

	async function syncPaymentReturn(currentEvent: SportEvent) {
		const paymentSessionId = page.url.searchParams.get('paymentSessionId');
		const promotionSessionId = page.url.searchParams.get('promotionSessionId');

		if (promotionSessionId && promotionSessionId !== lastConfirmedPaymentSessionId) {
			lastConfirmedPaymentSessionId = promotionSessionId;
			paymentConfirming = true;
			error = '';

			try {
				await confirmEventPromotionPayment({
					eventId: currentEvent.id,
					sessionId: promotionSessionId
				});

				await reloadEvent();
				await goto(resolve(`/events/${currentEvent.id}`), { replaceState: true, noScroll: true });
			} catch (err) {
				lastConfirmedPaymentSessionId = '';
				console.error('Confirm promotion payment error:', err);
				error = getFriendlyErrorMessage(err, 'Could not confirm promotion payment.');
			} finally {
				paymentConfirming = false;
			}
			return;
		}

		if (!paymentSessionId || paymentSessionId === lastConfirmedPaymentSessionId) return;

		lastConfirmedPaymentSessionId = paymentSessionId;
		paymentConfirming = true;
		error = '';

		try {
			await confirmEventPayment({
				eventId: currentEvent.id,
				sessionId: paymentSessionId
			});

			await reloadEvent();
			await goto(resolve(`/events/${currentEvent.id}`), { replaceState: true, noScroll: true });
		} catch (err) {
			lastConfirmedPaymentSessionId = '';
			console.error('Confirm event payment error:', err);
			error = getFriendlyErrorMessage(err, 'Could not confirm the payment yet.');
		} finally {
			paymentConfirming = false;
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

			await syncPaymentReturn(loadedEvent);
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

	function eventsOverlap(a: SportEvent, b: SportEvent) {
		const aStart = getEventStartMs(a);
		const bStart = getEventStartMs(b);
		if (!aStart || !bStart) return false;

		const aEnd = getEventEndMs(a) || aStart;
		const bEnd = getEventEndMs(b) || bStart;

		return aStart < bEnd && bStart < aEnd;
	}

	async function confirmScheduleConflict(userId: string, targetEvent: SportEvent) {
		try {
			const userEvents = await getEventsForUser(userId);
			const conflictingEvent = userEvents.find((candidate) => {
				if (candidate.id === targetEvent.id) return false;
				if (candidate.status === 'cancelled') return false;
				if (getEventTemporalState(candidate) === 'finished') return false;
				return eventsOverlap(candidate, targetEvent);
			});

			if (!conflictingEvent) return true;

			return showConfirm({
				title: i18n.t('schedule_conflict_title'),
				message: i18n.t('schedule_conflict_message', { title: conflictingEvent.title }),
				confirmLabel: i18n.t('join_anyway')
			});
		} catch (err) {
			console.error('Schedule conflict check error:', err);
			return true;
		}
	}

	async function handleJoinEvent() {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		const canContinue = await confirmScheduleConflict(currentUser.uid, event);
		if (!canContinue) return;

		actionLoading = true;
		error = '';

		try {
			if (paymentSummary?.isUpfront) {
				const { checkoutUrl } = await createEventPaymentCheckout({
					eventId: event.id,
					isJoinPayment: true
				});
				window.location.assign(checkoutUrl);
				return;
			}

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

		const canContinue = await confirmScheduleConflict(currentUser.uid, event);
		if (!canContinue) return;

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

	async function handleSetParticipantPaymentPaid(participantId: string) {
		const currentUser = auth.currentUser;

		if (!currentUser || !event || !isCreator || !paymentSummary?.splitAmount) return;

		paymentActionLoading = true;
		error = '';

		try {
			await updateEventParticipantPaymentStatus({
				eventId: event.id,
				userId: currentUser.uid,
				participantId,
				status: 'paid'
			});
			await reloadEvent();
		} catch (err) {
			console.error('Update participant payment error:', err);
			error = getFriendlyErrorMessage(err, 'Could not update participant payment status.');
		} finally {
			paymentActionLoading = false;
		}
	}

	async function handlePayForCurrentUser(participantId: string) {
		const currentUser = auth.currentUser;

		if (!currentUser || !event || participantId !== currentUser.uid || !paymentSummary?.splitAmount) {
			return;
		}

		paymentActionLoading = true;
		error = '';

		try {
			const { checkoutUrl } = await createEventPaymentCheckout({ eventId: event.id });
			window.location.assign(checkoutUrl);
		} catch (err) {
			console.error('Create event payment checkout error:', err);
			error = getFriendlyErrorMessage(err, 'Could not start the payment flow.');
			paymentActionLoading = false;
		}
	}

	function formatPaymentAmount(amount: number) {
		return `${getCurrencySymbol(event?.currency)}${amount.toFixed(2)}`;
	}

	let reminderSending = $state(false);
	let reminderSuccess = $state('');

	async function handleSendReminders() {
		const currentUser = auth.currentUser;
		if (!currentUser || !event || !isCreator) return;

		reminderSending = true;
		error = '';
		reminderSuccess = '';

		try {
			const res = await sendPaymentReminders({ eventId: event.id });
			if (res.count > 0) {
				reminderSuccess = i18n.t('reminder_sent');
			} else {
				reminderSuccess = i18n.t('all_payments_settled');
			}
			await reloadEvent();
		} catch (err: any) {
			console.error('Send payment reminders error:', err);
			error = getFriendlyErrorMessage(err, i18n.t('reminder_cooldown'));
		} finally {
			reminderSending = false;
		}
	}

	async function handleRemoveParticipant(participantId: string) {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		const isPaid = paymentSummary?.statuses?.[participantId] === 'paid';
		const splitAmount = paymentSummary?.splitAmount;

		let title = i18n.t('remove_player_title');
		let message = i18n.t('remove_player_message');
		let confirmLabel = i18n.t('remove_player');

		if (isPaid && splitAmount != null) {
			const amountStr = formatPaymentAmount(splitAmount);
			title = 'Remove Paid Participant';
			message = `This player has already paid ${amountStr}. Removing them will issue a refund of ${amountStr}. Are you sure you want to proceed?`;
			confirmLabel = 'Refund & Remove';
		}

		const confirmed = await showConfirm({
			title,
			message,
			confirmLabel,
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
			const { checkoutUrl } = await createEventPromotionCheckout({
				eventId: event.id,
				budget: Number(promotionBudget) || 15,
				durationDays: Number(promotionDurationDays) || 7,
				plan: promotionPlan,
				targetCity: promotionTargetCity,
				targetCountry: promotionTargetCountry,
				targetSport: event.sport
			});

			showPromoteModal = false;
			window.location.assign(checkoutUrl);
		} catch (err) {
			console.error('Promote event error:', err);
			error = getFriendlyErrorMessage(err, 'Could not start promotion payment flow.');
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

<div class="min-h-screen bg-white text-black dark:bg-[#161616] dark:text-white pb-36">
	{#if loading}
		<div class="mx-auto max-w-5xl px-4 pt-12">
			<div class="relative overflow-hidden rounded-3xl bg-slate-50 p-12 text-center shadow-sm dark:bg-[#242424]">
				<div class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent dark:border-blue-400"></div>
				<p class="mt-4 font-semibold text-slate-500 dark:text-slate-400">{i18n.t('loading_event')}</p>
			</div>
		</div>
	{:else if error && !event}
		<div class="mx-auto max-w-4xl px-4 pt-12">
			<div class="rounded-3xl border border-red-200 bg-red-50/90 p-8 text-center shadow-sm dark:border-red-900/50 dark:bg-red-950/40">
				<AlertCircle class="mx-auto h-12 w-12 text-red-500" />
				<h3 class="mt-3 text-lg font-bold text-red-900 dark:text-red-200">{error}</h3>
				<button
					type="button"
					onclick={() => goBack(resolve('/dashboard'))}
					class="mt-6 inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-red-700 active:scale-95"
				>
					<ArrowLeft class="h-4 w-4" />
					<span>{i18n.t('back')}</span>
				</button>
			</div>
		</div>
	{:else if event}
		<!-- Main Header Hero Banner (Full width of content area up to sidebar) -->
		<div class="relative w-full -mx-4 sm:-mx-6 md:-mx-8 lg:-mx-12 xl:-mx-16 -mt-6 sm:-mt-0 mb-6 bg-slate-900 dark:bg-[#161616]">
			<!-- Hero Cover Image -->
			<div class="relative h-[260px] sm:h-[360px] w-full overflow-hidden">
				<img
					src={getEventHeroImage(event)}
					alt={event.title}
					class="h-full w-full object-cover object-center"
					loading="eager"
				/>
				<!-- Gradient Overlay matching exact page background color -->
				<div class="absolute inset-0 bg-gradient-to-t from-white via-white/60 to-transparent dark:from-[#161616] dark:via-[#161616]/60 dark:to-transparent"></div>

				<!-- Top Floating Glass Navigation Controls -->
				<div class="absolute top-4 inset-x-4 sm:inset-x-8 max-w-6xl mx-auto flex items-center justify-between z-10">
					<button
						type="button"
						onclick={() => goBack(resolve('/dashboard'))}
						class="flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-slate-900 shadow-md backdrop-blur-md transition hover:bg-white dark:bg-slate-900/80 dark:text-white dark:hover:bg-slate-900 active:scale-95"
						aria-label={i18n.t('back_aria')}
					>
						<ArrowLeft class="h-4 w-4 text-blue-600 dark:text-blue-400" />
						<span class="hidden sm:inline">{i18n.t('back')}</span>
					</button>

					<div class="flex items-center gap-2">
						{#if isCreator || isParticipant}
							<label class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/80 text-slate-900 shadow-md backdrop-blur-md transition hover:bg-white dark:bg-slate-900/80 dark:text-white dark:hover:bg-slate-900 active:scale-95">
								<Camera class="h-4 w-4 text-blue-600 dark:text-blue-400" />
								<input type="file" accept="image/*" class="hidden" onchange={handleGroupPhotoFileChange} disabled={groupPhotoSaving} />
							</label>
						{/if}
						<button
							type="button"
							onclick={shareEvent}
							class="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-900 shadow-md backdrop-blur-md transition hover:bg-white dark:bg-slate-900/80 dark:text-white dark:hover:bg-slate-900 active:scale-95"
							aria-label={i18n.t('share_event_aria')}
						>
							<Share2 class="h-4 w-4 text-blue-600 dark:text-blue-400" />
						</button>
						<button
							type="button"
							onclick={toggleSavedEvent}
							class={`flex h-10 w-10 items-center justify-center rounded-full shadow-md backdrop-blur-md transition active:scale-95 ${
								isSavedEvent
									? 'bg-amber-500 text-white'
									: 'bg-white/80 text-slate-900 hover:bg-white dark:bg-slate-900/80 dark:text-white dark:hover:bg-slate-900'
							}`}
							aria-label={isSavedEvent ? i18n.t('unsave_event_aria') : i18n.t('save_event_aria')}
						>
							<Bookmark class="h-4 w-4" fill={isSavedEvent ? 'currentColor' : 'none'} />
						</button>
					</div>
				</div>

				<!-- Hero Badges & Title Overlay -->
				<div class="absolute bottom-4 inset-x-4 sm:inset-x-8 max-w-6xl mx-auto flex flex-col gap-2 z-10">
					<div class="flex flex-wrap items-center gap-2">
						<span class="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md">
							<Flame class="h-3.5 w-3.5" />
							{event.eventKind === 'tournament' ? i18n.t('status_tournament') : formatSport(event.sport)}
						</span>

						<span class={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold capitalize ${
							effectiveStatus === 'cancelled'
								? 'bg-red-600 text-white'
								: effectiveStatus === 'finished'
									? 'bg-slate-700 text-slate-200'
									: effectiveStatus === 'full'
										? 'bg-purple-600 text-white'
										: 'bg-emerald-600 text-white'
						}`}>
							{effectiveStatus}
						</span>

						<span class="inline-flex items-center rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-900 dark:bg-slate-800 dark:text-white">
							{getLevelLabel(event.level)}
						</span>

						{#if isPromotionActive(event)}
							<span class="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-slate-950 shadow-md">
								<Zap class="h-3.5 w-3.5" />
								{i18n.t('event_promoted')}
							</span>
						{/if}
					</div>

					<h1 class="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
						{event.title}
					</h1>
				</div>
			</div>
		</div>

		<!-- Container -->
		<div class="mx-auto max-w-6xl px-4 space-y-6">

			<!-- Global Alerts -->
			{#if error}
				<div class="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300">
					<div class="flex items-center gap-2">
						<AlertTriangle class="h-5 w-5 shrink-0 text-red-500" />
						<span>{error}</span>
					</div>
					<button type="button" onclick={() => (error = '')} class="text-red-500 hover:text-red-700"><X class="h-4 w-4" /></button>
				</div>
			{/if}

			{#if reminderSuccess}
				<div class="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
					<div class="flex items-center gap-2">
						<CheckCircle2 class="h-5 w-5 shrink-0 text-emerald-500" />
						<span>{reminderSuccess}</span>
					</div>
					<button type="button" onclick={() => (reminderSuccess = '')} class="text-emerald-500 hover:text-emerald-700"><X class="h-4 w-4" /></button>
				</div>
			{/if}

			<!-- Navigation Tabs Bar -->
			<div class="sticky top-4 z-30">
				<div class="flex items-center gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1.5 shadow-sm dark:bg-[#242424] no-scrollbar">
					{#each [
						{ id: 'overview', label: i18n.t('overview'), icon: Compass },
						{ id: 'players', label: i18n.t('players'), icon: Users, badge: pendingJoinRequests.length },
						...(isTournament ? [{ id: 'tournament', label: 'Tournament', icon: Trophy }] : []),
						...(canAccessGroupChat ? [{ id: 'chat', label: i18n.t('chat'), icon: MessageSquare }] : []),
						{ id: 'location', label: i18n.t('location'), icon: MapPin }
					] as tab}
						<button
							type="button"
							onclick={() => (activeEventTab = tab.id as typeof activeEventTab)}
							class={`flex flex-1 items-center justify-center gap-2 min-w-[110px] rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition-all ${
								activeEventTab === tab.id
									? 'bg-blue-600 text-white shadow-md shadow-blue-600/25 scale-[1.02]'
									: 'text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
							}`}
						>
							<tab.icon class="h-4 w-4 shrink-0" />
							<span class="truncate">{tab.label}</span>
							{#if tab.badge}
								<span class="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-black text-white">
									{tab.badge}
								</span>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<!-- TAB CONTENTS -->
			{#if activeEventTab === 'overview'}
				<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
					<!-- Main Details Column (2 cols on lg) -->
					<div class="space-y-6 lg:col-span-2">
						<!-- Key Details Grid -->
						<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
							<!-- Date Card -->
							<div class="flex items-center gap-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 p-4 dark:bg-[#242424] dark:border-slate-800">
								<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
									<Calendar class="h-5 w-5" />
								</div>
								<div class="min-w-0">
									<p class="text-[10px] font-black uppercase tracking-wider text-slate-400">{i18n.t('date')}</p>
									<p class="truncate text-sm font-bold text-slate-900 dark:text-white">{formatShortDate(event.startAt)}</p>
									<p class="text-xs font-medium text-slate-500 dark:text-slate-400">{formatShortTime(event.startAt)}</p>
								</div>
							</div>

							<!-- Duration Card -->
							<div class="flex items-center gap-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 p-4 dark:bg-[#242424] dark:border-slate-800">
								<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
									<Clock class="h-5 w-5" />
								</div>
								<div class="min-w-0">
									<p class="text-[10px] font-black uppercase tracking-wider text-slate-400">{i18n.t('duration')}</p>
									<p class="truncate text-sm font-bold text-slate-900 dark:text-white">{formatEventDuration(event)}</p>
									<p class="text-xs font-medium text-slate-500 dark:text-slate-400">{getLevelLabel(event.level)}</p>
								</div>
							</div>

							<!-- Price / Entry Fee Card -->
							<div class="col-span-2 sm:col-span-1 flex items-center gap-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 p-4 dark:bg-[#242424] dark:border-slate-800">
								<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
									<DollarSign class="h-5 w-5" />
								</div>
								<div class="min-w-0">
									<p class="text-[10px] font-black uppercase tracking-wider text-slate-400">{priceTitleLabel}</p>
									<p class="truncate text-sm font-bold text-slate-900 dark:text-white">{formatPriceLabel(event)}</p>
									<span class="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
										{effectiveStatus === 'full' ? i18n.t('event_full_msg') : i18n.t('spots_available')}
									</span>
								</div>
							</div>
						</div>

						<!-- Minimum Threshold Countdown Widget -->
						{#if hasMinParticipantsReq}
							<div class="overflow-hidden rounded-2xl bg-slate-50 border border-slate-200/80 p-5 dark:bg-[#242424] dark:border-slate-800">
								<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
									<div>
										<div class="flex items-center gap-2">
											<Users class="h-4 w-4 text-blue-600 dark:text-blue-400" />
											<h4 class="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">{i18n.t('min_participants')}</h4>
										</div>
										<p class="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
											{participants.length} / {minParticipantsCount} {i18n.t('confirmed')}
										</p>
									</div>

									<span class={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold shrink-0 ${
										minRequirementMet
											? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
											: minDeadlinePassed
												? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
												: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
									}`}>
										{#if minRequirementMet}
											<CheckCircle2 class="h-4 w-4" />
											<span>{i18n.t('min_participants_met', { current: participants.length, min: minParticipantsCount })}</span>
										{:else if minDeadlinePassed}
											<AlertCircle class="h-4 w-4" />
											<span>{i18n.t('auto_cancelled_min_participants', { min: minParticipantsCount })}</span>
										{:else}
											<Clock class="h-4 w-4 animate-spin" />
											<span>{i18n.t('min_participants_unmet', { remaining: Math.max(0, minParticipantsCount - participants.length) })}</span>
										{/if}
									</span>
								</div>

								<!-- Progress bar -->
								<div class="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
									<div
										class={`h-full rounded-full transition-all duration-500 ${
											minRequirementMet ? 'bg-emerald-500' : minDeadlinePassed ? 'bg-red-500' : 'bg-amber-500'
										}`}
										style={`width: ${Math.min(100, (participants.length / minParticipantsCount) * 100)}%`}
									></div>
								</div>

								{#if minDeadlineFormatted && !minRequirementMet && !minDeadlinePassed}
									<div class="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
										<Clock class="h-4 w-4 text-amber-500" />
										<span>{i18n.t('cancellation_deadline')}: {minDeadlineFormatted} ({event.minParticipantsDeadlineHours ?? 8}h {i18n.t('hours_before_start', { hours: event.minParticipantsDeadlineHours ?? 8 })})</span>
									</div>
								{/if}
							</div>
						{/if}

						<!-- Description & Requirements Card -->
						<div class="space-y-4 rounded-2xl bg-slate-50 border border-slate-200/80 p-6 dark:bg-[#242424] dark:border-slate-800">
							<div>
								<h3 class="text-xs font-black uppercase tracking-widest text-slate-400">{i18n.t('description')}</h3>
								<p class="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line">
									{event.description || i18n.t('no_description')}
								</p>
							</div>

							{#if event.whatToBring}
								<div class="pt-4 border-t border-slate-200 dark:border-slate-800">
									<h4 class="text-xs font-black uppercase tracking-widest text-slate-400">{i18n.t('what_to_bring')}</h4>
									<p class="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400 whitespace-pre-line">
										{event.whatToBring}
									</p>
								</div>
							{/if}
						</div>

						<!-- Quick Actions & Links Bar -->
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
							{#if canAddToGoogleCalendar}
								<a
									href={googleCalendarUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
								>
									<Calendar class="h-4 w-4" />
									<span>{i18n.t('add_to_google_calendar')}</span>
								</a>
							{/if}

							{#if event.location.lat && event.location.lng}
								<a
									href={`https://www.google.com/maps/dir/?api=1&destination=${event.location.lat},${event.location.lng}`}
									target="_blank"
									rel="noopener noreferrer"
									class="flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
								>
									<Compass class="h-4 w-4" />
									<span>{i18n.t('get_directions')}</span>
								</a>
							{/if}
						</div>
					</div>

					<!-- Sidebar Column (Host, Roster Preview, Promotion) -->
					<div class="space-y-6">
						<!-- Organizer Card -->
						<div class="rounded-2xl bg-slate-50 border border-slate-200/80 p-5 dark:bg-[#242424] dark:border-slate-800 space-y-4">
							<p class="text-xs font-black uppercase tracking-widest text-slate-400">{i18n.t('host')}</p>

							{#if event.hostType === 'organization'}
								<a href={resolve(`/organizations/${event.organizationId}`)} class="flex items-center gap-3.5 group">
									<div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 font-bold text-blue-600 dark:bg-blue-950 dark:text-blue-300">
										{#if event.organizationLogoURL}
											<img src={event.organizationLogoURL} alt={event.organizationName ?? 'Organization'} class="h-full w-full object-cover" />
										{:else}
											{event.organizationName?.charAt(0).toUpperCase() ?? 'O'}
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-1.5">
											<p class="truncate text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition">{event.organizationName ?? 'Organization'}</p>
											{#if event.organizationVerificationStatus === 'verified'}
												<ShieldCheck class="h-4 w-4 text-blue-500 shrink-0" />
											{/if}
										</div>
										<p class="text-xs font-medium text-slate-500 dark:text-slate-400">{formatReviewSummary()}</p>
									</div>
								</a>
							{:else if hostProfile}
								<a href={resolve(`/users/${hostProfile.id}`)} class="flex items-center gap-3.5 group">
									<UserAvatar photoURL={hostProfile.photoURL} displayName={hostProfile.displayName} email={hostProfile.email} size="md" />
									<div class="min-w-0 flex-1">
										<p class="truncate text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition">{hostProfile.displayName}</p>
										<p class="text-xs font-medium text-slate-500 dark:text-slate-400">{i18n.t('host')}</p>
									</div>
								</a>
							{/if}

							{#if canContactOrganizer}
								<button
									type="button"
									onclick={contactOrganizer}
									disabled={contactLoading}
									class="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
								>
									<MessageSquare class="h-4 w-4" />
									<span>{contactLoading ? i18n.t('opening') : i18n.t('message_organizer')}</span>
								</button>
							{/if}

							<!-- Promotion Hub for Hosts -->
							{#if canPromoteThisEvent}
								<div class="pt-3 border-t border-slate-200 dark:border-slate-800">
									{#if isPromotionActive(event)}
										<div class="rounded-xl bg-blue-50 p-3.5 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/50">
											<div class="flex items-center justify-between gap-2">
												<div>
													<p class="text-xs font-black text-blue-700 dark:text-blue-300">{i18n.t('promotion_active')}</p>
													{#if promotionStats}
														<p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
															{promotionStats.views} views · {promotionStats.clicks} clicks
														</p>
													{/if}
												</div>
												<button
													type="button"
													onclick={handleStopPromotion}
													disabled={stoppingPromotion}
													class="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow hover:bg-red-50 hover:text-red-600 dark:bg-slate-900 dark:text-slate-300"
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
											class={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black text-white shadow-md transition ${
												isOrgVerified
													? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 cursor-pointer'
													: 'bg-slate-400 dark:bg-slate-800 cursor-not-allowed opacity-60'
											}`}
										>
											<Sparkles class="h-4 w-4" />
											<span>{i18n.t('promote_event')}</span>
										</button>
									{/if}
								</div>
							{/if}
						</div>

						<!-- Participant Roster Preview Card -->
						<div class="rounded-2xl bg-slate-50 border border-slate-200/80 p-5 dark:bg-[#242424] dark:border-slate-800 space-y-4">
							<div class="flex items-center justify-between">
								<div>
									<h4 class="text-sm font-bold text-slate-900 dark:text-white">{i18n.t('players')}</h4>
									<p class="text-xs font-medium text-slate-500 dark:text-slate-400">{participants.length}/{event.maxParticipants} {i18n.t('confirmed')}</p>
								</div>
								<button
									type="button"
									onclick={() => (activeEventTab = 'players')}
									class="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
								>
									View All
								</button>
							</div>

							<!-- Avatar Stack -->
							<div class="flex -space-x-2 overflow-hidden py-1">
								{#each participants.slice(0, 6) as participant (participant.id)}
									<UserAvatar photoURL={participant.photoURL} displayName={participant.displayName} email={participant.email} size="sm" />
								{/each}
								{#if participants.length > 6}
									<span class="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-xs font-black text-slate-700 dark:border-slate-900 dark:bg-slate-800 dark:text-slate-300">
										+{participants.length - 6}
									</span>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- PLAYERS & SETTLEMENT TAB -->
			{#if activeEventTab === 'players'}
				<div class="space-y-6">
					<!-- Cost Split / Upfront Payment Header -->
					{#if paymentSummary?.splitAmount != null && (effectiveStatus === 'finished' || paymentSummary.isUpfront || paymentSummary.isPricePerPerson)}
						<div class="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
							<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
								<div>
									<span class="text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
										{paymentSummary.isUpfront ? 'Upfront Entry Fee' : paymentSummary.isPricePerPerson ? 'Per Person Price' : 'Cost Settlement'}
									</span>
									<h3 class="text-xl font-black text-slate-900 dark:text-white mt-1">
										{formatPaymentAmount(paymentSummary.splitAmount)} <span class="text-sm font-normal text-slate-600 dark:text-slate-400">/ player</span>
									</h3>
									<p class="text-xs font-medium text-slate-600 dark:text-slate-300 mt-1">
										{paymentSummary.isUpfront
											? 'Entry fee must be settled upon joining.'
											: paymentSummary.isPricePerPerson
												? 'Fixed price per participant.'
												: 'Host excluded from split total; split equally among participants.'}
									</p>
								</div>

								{#if isCreator && !paymentSummary.isUpfront}
									<button
										type="button"
										onclick={handleSendReminders}
										disabled={reminderSending}
										class="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow transition hover:bg-emerald-800 disabled:opacity-60 shrink-0"
									>
										<Bell class="h-4 w-4" />
										<span>{reminderSending ? 'Sending...' : 'Send Reminders'}</span>
									</button>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Pending Approval Join Requests (Host view) -->
					{#if isCreator && pendingJoinRequests.length > 0}
						<div class="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 dark:border-amber-900/50 dark:bg-amber-950/30 space-y-4">
							<div class="flex items-center gap-2 text-amber-900 dark:text-amber-300">
								<UserPlus class="h-5 w-5" />
								<h3 class="text-sm font-black uppercase tracking-wider">Pending Join Requests ({pendingJoinRequests.length})</h3>
							</div>

							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
								{#each pendingJoinRequests as req (req.id)}
									{@const requester = pendingRequesters.find((p) => p.id === req.userId)}
									<div class="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-amber-200/50 dark:bg-slate-900 dark:ring-amber-900/40">
										<div class="flex items-center gap-2.5 min-w-0">
											<UserAvatar photoURL={requester?.photoURL} displayName={requester?.displayName} email={requester?.email} size="sm" />
											<span class="truncate text-sm font-bold text-slate-900 dark:text-white">{requester?.displayName ?? 'User'}</span>
										</div>

										<div class="flex items-center gap-1 shrink-0">
											<button
												type="button"
												onclick={() => handleRespondToJoinRequest(req.id, 'accepted')}
												disabled={joinRequestActionLoading}
												class="rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
											>
												Accept
											</button>
											<button
												type="button"
												onclick={() => handleRespondToJoinRequest(req.id, 'declined')}
												disabled={joinRequestActionLoading}
												class="rounded-lg bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-red-100 hover:text-red-700 dark:bg-slate-800 dark:text-slate-300"
											>
												Decline
											</button>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Roster List -->
					<div class="rounded-2xl bg-slate-50 border border-slate-200/80 p-6 dark:bg-[#242424] dark:border-slate-800 space-y-4">
						<div class="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
							<div>
								<h3 class="text-base font-bold text-slate-900 dark:text-white">{i18n.t('players')}</h3>
								<p class="text-xs font-medium text-slate-500 dark:text-slate-400">{participants.length} of {event.maxParticipants} confirmed participants</p>
							</div>

							{#if canInvite}
								<a
									href={resolve(`/events/${event.id}/invite`)}
									class="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md transition hover:bg-blue-700"
								>
									<UserPlus class="h-4 w-4" />
									<span>{i18n.t('invite_people')}</span>
								</a>
							{/if}
						</div>

						<div class="divide-y divide-slate-200 dark:divide-slate-800">
							{#each participants as participant (participant.id)}
								{@const isHost = participant.id === event.creatorId}
								{@const paymentStatus = paymentSummary?.statuses?.[participant.id]}
								{@const isSelf = participant.id === currentUserId}

								<div class="flex items-center justify-between py-3.5 gap-3">
									<a href={resolve(`/users/${participant.id}`)} class="flex items-center gap-3 min-w-0 group">
										<UserAvatar photoURL={participant.photoURL} displayName={participant.displayName} email={participant.email} size="md" />
										<div class="min-w-0">
											<div class="flex items-center gap-2">
												<span class="truncate text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition">{participant.displayName}</span>
												{#if isHost}
													<span class="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">
														HOST
													</span>
												{/if}
											</div>
											<p class="text-xs font-medium text-slate-500 dark:text-slate-400">
												{participant.sports?.[0] ? formatSport(participant.sports[0]) : 'Rally Member'}
											</p>
										</div>
									</a>

									<!-- Payment status & Actions -->
									<div class="flex items-center gap-2 shrink-0">
										{#if paymentSummary?.splitAmount != null && !isHost}
											{#if paymentStatus === 'paid'}
												<span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
													<CheckCircle2 class="h-3.5 w-3.5" />
													<span>Paid</span>
												</span>
											{:else if isSelf}
												<button
													type="button"
													onclick={() => handlePayForCurrentUser(participant.id)}
													disabled={paymentActionLoading}
													class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
												>
													Pay Now ({formatPaymentAmount(paymentSummary.splitAmount)})
												</button>
											{:else if isCreator}
												<button
													type="button"
													onclick={() => handleSetParticipantPaymentPaid(participant.id)}
													disabled={paymentActionLoading}
													class="rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
												>
													Mark Paid
												</button>
											{/if}
										{/if}

										{#if isCreator && !isHost}
											<button
												type="button"
												onclick={() => handleRemoveParticipant(participant.id)}
												disabled={actionLoading}
												class="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
												title="Remove participant"
											>
												<X class="h-4 w-4" />
											</button>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- TOURNAMENT TAB -->
			{#if activeEventTab === 'tournament' && isTournament}
				<div class="rounded-2xl bg-slate-50 border border-slate-200/80 p-6 dark:bg-[#242424] dark:border-slate-800">
					<TournamentPanel {event} {currentUserId} canManage={canManageTournament} />
				</div>
			{/if}

			<!-- CHAT TAB -->
			{#if activeEventTab === 'chat' && canAccessGroupChat}
				<div class="flex flex-col h-[550px] rounded-2xl bg-slate-50 border border-slate-200/80 dark:bg-[#242424] dark:border-slate-800 overflow-hidden">
					<!-- Chat Header -->
					<div class="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800 bg-white dark:bg-slate-900">
						<div class="flex items-center gap-3">
							<div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
								<MessageSquare class="h-5 w-5" />
							</div>
							<div>
								<h3 class="text-sm font-bold text-slate-900 dark:text-white">Event Group Chat</h3>
								<p class="text-xs font-medium text-slate-500 dark:text-slate-400">{participants.length} members</p>
							</div>
						</div>

						{#if groupTypingLabel}
							<span class="text-xs font-medium text-blue-600 animate-pulse dark:text-blue-400">{groupTypingLabel}</span>
						{/if}
					</div>

					<!-- Chat Body -->
					<div bind:this={messagesContainer} class="flex-1 overflow-y-auto p-6 space-y-4">
						{#if groupChatLoading}
							<div class="flex justify-center py-8">
								<div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent dark:border-blue-400"></div>
							</div>
						{:else if groupMessages.length === 0}
							<div class="flex flex-col items-center justify-center text-center h-full text-slate-400 space-y-2">
								<MessageSquare class="h-10 w-10 text-slate-300 dark:text-slate-700" />
								<p class="text-sm font-medium">No messages yet. Say hello to the team!</p>
							</div>
						{:else}
							<ChatMessageList messages={groupMessages} {currentUserId} getSenderProfile={(id) => participantById[id]} />
						{/if}
					</div>

					<!-- Chat Input Bar -->
					<form onsubmit={(e) => { e.preventDefault(); handleSendGroupMessage(); }} class="flex items-center gap-2 border-t border-slate-200 p-4 dark:border-slate-800 bg-white dark:bg-slate-900">
						<input
							type="text"
							bind:value={groupMessageText}
							oninput={handleGroupTyping}
							placeholder="Write a message..."
							class="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-600 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900 dark:focus:ring-blue-400"
						/>
						<button
							type="submit"
							disabled={groupChatSending || !groupMessageText.trim()}
							class="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50"
						>
							<Send class="h-4 w-4" />
						</button>
					</form>
				</div>
			{/if}

			<!-- LOCATION & WEATHER TAB -->
			{#if activeEventTab === 'location'}
				<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
					<div class="lg:col-span-2 space-y-6">
						<div class="h-[400px] overflow-hidden rounded-2xl bg-slate-50 border border-slate-200/80 dark:bg-[#242424] dark:border-slate-800">
							<EventMap lat={event.location.lat ?? null} lng={event.location.lng ?? null} name={event.location.name} address={event.location.address ?? ''} />
						</div>
					</div>

					<div class="space-y-6">
						<!-- Venue details card -->
						<div class="rounded-2xl bg-slate-50 border border-slate-200/80 p-5 dark:bg-[#242424] dark:border-slate-800 space-y-3">
							<div class="flex items-center gap-2 text-slate-400">
								<MapPin class="h-4 w-4 text-blue-600 dark:text-blue-400" />
								<h4 class="text-xs font-black uppercase tracking-wider">{i18n.t('location')}</h4>
							</div>
							<h3 class="text-base font-bold text-slate-900 dark:text-white">{event.location.name}</h3>
							{#if event.location.address}
								<p class="text-xs text-slate-500 dark:text-slate-400">{event.location.address}</p>
							{/if}

							{#if event.location.lat && event.location.lng}
								<a
									href={`https://www.google.com/maps/dir/?api=1&destination=${event.location.lat},${event.location.lng}`}
									target="_blank"
									rel="noopener noreferrer"
									class="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow transition hover:bg-blue-700"
								>
									<Compass class="h-4 w-4" />
									<span>{i18n.t('get_directions')}</span>
								</a>
							{/if}
						</div>

						<!-- Weather Card -->
						<div class="rounded-2xl bg-slate-50 border border-slate-200/80 p-5 dark:bg-[#242424] dark:border-slate-800 space-y-3">
							<div class="flex items-center gap-2 text-slate-400">
								<SunMedium class="h-4 w-4 text-amber-500" />
								<h4 class="text-xs font-black uppercase tracking-wider">{i18n.t('weather')}</h4>
							</div>
							<EventWeather lat={event.location.lat} lng={event.location.lng} startAt={event.startAt} size="md" />
						</div>
					</div>
				</div>
			{/if}

		</div>

		<!-- FLOATING BOTTOM ACTION BAR (Floating at screen bottom, responsive to sidebar) -->
		<div class="fixed bottom-20 inset-x-4 md:bottom-6 md:left-[calc(17.75rem+2rem)] md:right-8 lg:right-12 xl:right-16 z-40 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-[#161616]/95">
			<div class="mx-auto max-w-6xl flex items-center justify-between gap-4">
				<!-- Left info summary -->
				<div class="hidden sm:block">
					<p class="text-xs font-bold uppercase tracking-wider text-slate-400">{event.title}</p>
					<p class="text-sm font-black text-slate-900 dark:text-white">
						{formatPriceLabel(event)} · {participants.length}/{event.maxParticipants} players
					</p>
				</div>

				<!-- Right Action Buttons -->
				<div class="flex items-center gap-2.5 w-full sm:w-auto justify-end">
					{#if canJoin}
						<button
							type="button"
							onclick={handleJoinEvent}
							disabled={actionLoading}
							class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 active:scale-95 disabled:opacity-60"
						>
							<UserPlus class="h-4 w-4" />
							<span>{actionLoading ? i18n.t('joining') : (paymentSummary?.isUpfront && paymentSummary?.splitAmount != null ? `Pay & Join (${formatPaymentAmount(paymentSummary.splitAmount)})` : i18n.t('join_event'))}</span>
						</button>
					{:else if canRequestJoin}
						<button
							type="button"
							onclick={handleRequestToJoin}
							disabled={actionLoading}
							class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 active:scale-95 disabled:opacity-60"
						>
							<UserPlus class="h-4 w-4" />
							<span>{actionLoading ? i18n.t('requesting') : i18n.t('request_to_join')}</span>
						</button>
					{:else if hasPendingJoinRequest}
						<button disabled class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-6 py-3 text-sm font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
							<Clock class="h-4 w-4" />
							<span>{i18n.t('request_pending')}</span>
						</button>
					{/if}

					{#if isParticipant && !isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
						<button
							type="button"
							onclick={handleLeaveEvent}
							disabled={actionLoading}
							class="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 transition hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
						>
							<LogOut class="h-4 w-4" />
							<span class="hidden sm:inline">{i18n.t('leave_event')}</span>
						</button>
					{/if}

					{#if isCreator && effectiveStatus !== 'cancelled' && effectiveStatus !== 'finished'}
						<a
							href={resolve(`/events/${event.id}/edit`)}
							class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
						>
							<Edit3 class="h-4 w-4" />
							<span class="hidden sm:inline">{i18n.t('edit_event')}</span>
						</a>

						<button
							type="button"
							onclick={handleFinishEvent}
							disabled={actionLoading}
							class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-60"
						>
							<CheckCircle2 class="h-4 w-4" />
							<span>{i18n.t('finish_event')}</span>
						</button>

						<button
							type="button"
							onclick={handleCancelEvent}
							disabled={actionLoading}
							class="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
						>
							<X class="h-4 w-4" />
							<span class="hidden sm:inline">{i18n.t('cancel_event')}</span>
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- CONFIRM DIALOG MODAL -->
{#if confirmDialog}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in">
		<div class="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800 space-y-4">
			<div class="flex items-center gap-3">
				<div class={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${confirmDialog.danger ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400'}`}>
					<AlertTriangle class="h-5 w-5" />
				</div>
				<h3 class="text-base font-bold text-slate-900 dark:text-white">{confirmDialog.title}</h3>
			</div>

			<p class="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
				{confirmDialog.message}
			</p>

			<div class="flex justify-end gap-2 pt-2">
				<button
					type="button"
					onclick={() => dismissConfirm(false)}
					class="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={() => dismissConfirm(true)}
					class={`rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-md transition ${
						confirmDialog.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
					}`}
				>
					{confirmDialog.confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- EVENT PROMOTION MODAL -->
{#if showPromoteModal && event}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md animate-in fade-in">
		<div class="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 sm:p-8 shadow-2xl ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800 space-y-6">
			<div class="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
				<div class="flex items-center gap-2.5">
					<Sparkles class="h-6 w-6 text-blue-600 dark:text-blue-400" />
					<h3 class="text-lg font-black text-slate-900 dark:text-white">{i18n.t('promote_event')}</h3>
				</div>
				<button type="button" onclick={() => (showPromoteModal = false)} class="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X class="h-5 w-5" /></button>
			</div>

			<!-- Plan Selector -->
			<div class="space-y-3">
				<p class="text-xs font-black uppercase tracking-wider text-slate-400">Select Campaign Plan</p>
				<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
					{#each promotionPlanOptions as [planKey, planDef]}
						<button
							type="button"
							onclick={() => (promotionPlan = planKey as EventPromotionPlan)}
							class={`flex flex-col justify-between rounded-2xl p-4 text-left border-2 transition ${
								promotionPlan === planKey
									? 'border-blue-600 bg-blue-50/50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-500'
									: 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'
							}`}
						>
							<div>
								<span class="text-sm font-black block">{i18n.t(getPromotionPlanTranslationKey(planKey, 'label'))}</span>
								<span class="text-xs text-slate-500 mt-1 block leading-tight">{i18n.t(getPromotionPlanTranslationKey(planKey, 'description'))}</span>
							</div>
							<span class="text-xs font-bold text-blue-600 dark:text-blue-400 mt-3 block">${planDef.cpm.toFixed(2)} CPM</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- Budget & Duration -->
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="promotion-budget-input" class="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1.5">Budget (€)</label>
					<input
						id="promotion-budget-input"
						type="number"
						bind:value={promotionBudget}
						min="5"
						max="500"
						class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-blue-600 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-400"
					/>
				</div>
				<div>
					<label for="promotion-duration-input" class="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1.5">Duration (Days)</label>
					<input
						id="promotion-duration-input"
						type="number"
						bind:value={promotionDurationDays}
						min="1"
						max="30"
						class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-blue-600 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-400"
					/>
				</div>
			</div>

			<!-- Estimated Reach Card -->
			<div class="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white shadow-md space-y-1">
				<p class="text-xs font-bold uppercase tracking-wider text-blue-200">Estimated Reach</p>
				<p class="text-2xl font-black">{promotionImpressionsPreview.toLocaleString()} Impressions</p>
				<p class="text-xs text-blue-100">Estimated audience targeted across Rally network.</p>
			</div>

			<!-- Checkout Button -->
			<button
				type="button"
				onclick={handlePromoteEvent}
				disabled={promoting}
				class="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-black text-white shadow-md hover:bg-blue-700 disabled:opacity-60 transition"
			>
				{promoting ? 'Redirecting to Stripe...' : 'Proceed to Checkout'}
			</button>
		</div>
	</div>
{/if}

<!-- IMAGE CROPPER MODAL -->
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
