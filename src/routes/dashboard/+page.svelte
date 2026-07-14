<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { onAuthStateChanged, type User } from 'firebase/auth';
	import {
		getEventsCreatedByUser,
		getEventsForUser,
		getUpcomingEvents,
		sortEventsByStartDate,
		isEventFinished,
		getEffectiveEventStatus,
		isPromotionActive,
		getEventById,
		notifyEventFinished
	} from '$lib/services/event.service';
	import { getInvitesForUser, respondToInvite } from '$lib/services/invite.service';
	import { ensureUserProfile, getUserProfile } from '$lib/services/user.service';
	import { getFriendsForUser } from '$lib/services/social.service';
	import {
		getVisibleEventsForUser,
		subscribeToPromotedEventsForUser
	} from '$lib/services/explore.service';
	import { getOrganizationsFollowedByUser } from '$lib/services/organization.service';
	import type { EventInvite, SportEvent, UserProfile } from '$lib/schema';
	import EventCard from '$lib/components/EventCard.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import PromotedEventCarousel from '$lib/components/PromotedEventCarousel.svelte';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import {
		subscribeToEventCatalogChanges,
		subscribeToUserActivityChanges
	} from '$lib/services/realtime.service';
	import { notificationState } from '$lib/notifications.svelte';

	let user = $state<User | null>(null);
	let profile = $state<UserProfile | null>(null);
	let loading = $state(true);
	let events = $state<SportEvent[]>([]);
	let joinedEvents = $state<SportEvent[]>([]);
	let allUserEvents = $state<SportEvent[]>([]);
	let invites = $state<EventInvite[]>([]);
	let inviteEventsById = $state<Record<string, SportEvent>>({});
	let promotedEvents = $state<SportEvent[]>([]);
	let publicEvents = $state<SportEvent[]>([]);
	let followedOrganizationIds = $state<string[]>([]);
	let friends = $state<UserProfile[]>([]);
	let invitePreviewEvent = $state<SportEvent | null>(null);
	let invitePreviewUser = $state<UserProfile | null>(null);
	let error = $state('');
	let inviteActionLoading = $state('');
	let activeTab = $state<'hosting' | 'joined'>('hosting');
	let showPastEvents = $state(false);
	let showCancelledEvents = $state(false);
	let showUpcomingRallies = $state(false);
	let showNotifications = $state(false);
	let nearbyIndex = $state(0);
	let radiusKm = $state(20);
	let discoverTab = $state<'nearby' | 'recommended' | 'following'>('nearby');
	let userDeviceLocation = $state<{ lat: number; lng: number } | null>(null);
	let locationStatus = $state<'idle' | 'loading' | 'ready' | 'blocked' | 'unsupported'>('idle');
	let scrollContainer = $state<HTMLDivElement>();

	let hostingEvents = $derived(
		events.filter((event) => !isEventFinished(event) && event.status !== 'cancelled')
	);
	let pastHostingEvents = $derived(events.filter((event) => isEventFinished(event)));
	let cancelledHostingEvents = $derived(events.filter((event) => event.status === 'cancelled'));
	let currentHostingEvents = $derived(showPastEvents ? pastHostingEvents : hostingEvents);

	let participantEvents = $derived(
		joinedEvents.filter((event) => !isEventFinished(event) && event.status !== 'cancelled')
	);
	let pastParticipantEvents = $derived(joinedEvents.filter((event) => isEventFinished(event)));
	let cancelledJoinedEvents = $derived(
		joinedEvents.filter((event) => event.status === 'cancelled')
	);
	let currentJoinedEvents = $derived(showPastEvents ? pastParticipantEvents : participantEvents);
	let cancelledEventsForActiveTab = $derived(
		activeTab === 'hosting' ? cancelledHostingEvents : cancelledJoinedEvents
	);
	let visiblePromotedEvents = $derived.by(() => {
		const eventsById = new Map<string, SportEvent>();

		for (const event of promotedEvents) {
			if (event.visibility === 'public' && isPromotionActive(event)) {
				eventsById.set(event.id, event);
			}
		}
		for (const event of allUserEvents) {
			if (event.visibility === 'public' && isPromotionActive(event)) {
				eventsById.set(event.id, event);
			}
		}

		return Array.from(eventsById.values());
	});

	let pendingInvites = $derived(
		invites.filter((invite) => invite.status === 'pending' && isInviteEventActive(inviteEventsById[invite.eventId]))
	);
	let notificationCount = $derived(notificationState.total);
	let upcomingRallies = $derived(getUpcomingEvents(allUserEvents));
	let nextEvent = $derived(upcomingRallies[0] ?? null);
	let userEventIds = $derived(new Set(allUserEvents.map((event) => event.id)));
	let userLocationAnchor = $derived(userDeviceLocation);
	let nearbyEvents = $derived.by(() => {
		return publicEvents
			.filter((event) => event.visibility === 'public')
			.filter((event) => !isEventFinished(event))
			.filter((event) => !userEventIds.has(event.id))
			.filter((event) => !event.participantIds.includes(user?.uid ?? ''))
			.filter((event) => event.creatorId !== user?.uid)
			.filter((event) => event.id !== nextEvent?.id)
			.map((event) => ({ event, distance: getDistanceKm(userLocationAnchor, event) }))
			.filter(({ distance }) => distance !== null && distance <= radiusKm)
			.sort((a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY))
			.map(({ event }) => event);
	});
	let currentNearbyEvent = $derived(
		nearbyEvents.length ? nearbyEvents[nearbyIndex % nearbyEvents.length] : null
	);
	let dashboardPromotedEvents = $derived.by(() => {
		const excluded = (event: SportEvent) =>
			userEventIds.has(event.id) ||
			event.participantIds.includes(user?.uid ?? '') ||
			event.creatorId === user?.uid ||
			isEventFinished(event);

		return visiblePromotedEvents.filter((event) => !excluded(event)).slice(0, 6);
	});
	let recommendedEvents = $derived.by(() => {
		const excluded = (event: SportEvent) =>
			userEventIds.has(event.id) ||
			event.participantIds.includes(user?.uid ?? '') ||
			event.creatorId === user?.uid ||
			isEventFinished(event);

		const sports = profile?.sports ?? [];
		const preferredEvents = publicEvents
			.filter((event) => event.visibility === 'public')
			.filter((event) => !excluded(event))
			.filter((event) => sports.includes(event.sport))
			.filter(
				(event) =>
					!dashboardPromotedEvents.some((promotedEvent) => promotedEvent.id === event.id)
			);

		return preferredEvents.slice(0, 8);
	});
	let followingEvents = $derived.by(() => {
		const followedIds = new Set(followedOrganizationIds);
		const excluded = (event: SportEvent) =>
			userEventIds.has(event.id) ||
			event.participantIds.includes(user?.uid ?? '') ||
			event.creatorId === user?.uid ||
			isEventFinished(event);

		if (followedIds.size === 0) return [];

		return publicEvents
			.filter((event) => event.visibility === 'public')
			.filter((event) => !excluded(event))
			.filter((event) => event.organizationId && followedIds.has(event.organizationId))
			.slice(0, 8);
	});
	let hasFavoriteSports = $derived((profile?.sports?.length ?? 0) > 0);

	function greeting() {
		const h = new Date().getHours();
		if (h < 12) return 'Good morning';
		if (h < 18) return 'Good afternoon';
		return 'Good evening';
	}

	function formatCompactDate(dateValue: unknown) {
		try {
			const ts = dateValue as { toDate?: () => Date };
			if (ts?.toDate) {
				return ts.toDate().toLocaleString('en-GB', {
					weekday: 'short',
					day: '2-digit',
					month: 'short',
					hour: '2-digit',
					minute: '2-digit'
				});
			}
		} catch {
			// fall through
		}

		return 'Date not set';
	}

	function formatBadge(value: number) {
		return value > 9 ? '9+' : String(value);
	}

	function getDistanceKm(anchor: { lat: number; lng: number } | null, event: SportEvent) {
		const lat = event.location?.lat;
		const lng = event.location?.lng;

		if (!anchor || typeof lat !== 'number' || typeof lng !== 'number') return null;

		const toRad = (value: number) => (value * Math.PI) / 180;
		const earthRadiusKm = 6371;
		const dLat = toRad(lat - anchor.lat);
		const dLng = toRad(lng - anchor.lng);
		const a =
			Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos(toRad(anchor.lat)) *
				Math.cos(toRad(lat)) *
				Math.sin(dLng / 2) *
				Math.sin(dLng / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

		return earthRadiusKm * c;
	}

	function requestDeviceLocation() {
		if (typeof navigator === 'undefined' || !navigator.geolocation) {
			locationStatus = 'unsupported';
			return;
		}

		locationStatus = 'loading';
		navigator.geolocation.getCurrentPosition(
			(position) => {
				userDeviceLocation = {
					lat: position.coords.latitude,
					lng: position.coords.longitude
				};
				locationStatus = 'ready';
				nearbyIndex = 0;
			},
			() => {
				locationStatus = 'blocked';
			},
			{
				enableHighAccuracy: true,
				timeout: 10000,
				maximumAge: 5 * 60 * 1000
			}
		);
	}

	function isInviteEventActive(event: SportEvent | null | undefined) {
		if (!event) return false;
		const status = getEffectiveEventStatus(event);
		return status !== 'finished' && status !== 'cancelled';
	}

	async function getActiveInvitesWithEvents(loadedInvites: EventInvite[]) {
		const inviteEntries = await Promise.all(
			loadedInvites.map(async (invite) => {
				const event = await getEventById(invite.eventId);
				return { invite, event };
			})
		);
		const activeInviteEvents: Record<string, SportEvent> = {};
		const activeInvites: EventInvite[] = [];

		for (const { invite, event } of inviteEntries) {
			if (!event || !isInviteEventActive(event)) continue;
			activeInviteEvents[invite.eventId] = event;
			activeInvites.push(invite);
		}

		return { activeInvites, activeInviteEvents };
	}

	async function loadInvitePreview(pending: EventInvite[]) {
		const invite = pending[0];

		if (!invite) {
			invitePreviewEvent = null;
			invitePreviewUser = null;
			return;
		}

		try {
			const [eventPreview, userPreview] = await Promise.all([
				Promise.resolve(inviteEventsById[invite.eventId] ?? getEventById(invite.eventId)),
				getUserProfile(invite.fromUserId)
			]);

			if (!isInviteEventActive(eventPreview)) {
				invitePreviewEvent = null;
				invitePreviewUser = null;
				return;
			}

			invitePreviewEvent = eventPreview;
			invitePreviewUser = userPreview;
		} catch (err) {
			console.error('Invite preview load error:', err);
			invitePreviewEvent = null;
			invitePreviewUser = null;
		}
	}

	async function handleInviteResponse(status: 'accepted' | 'declined') {
		const currentUser = auth.currentUser;
		const invite = pendingInvites[0];

		if (!currentUser || !invite) return;

		inviteActionLoading = status;
		error = '';

		try {
			await respondToInvite({
				inviteId: invite.id,
				eventId: invite.eventId,
				userId: currentUser.uid,
				status
			});

			await refreshDashboardData(currentUser.uid);
		} catch (err) {
			console.error('Dashboard invite response error:', err);
			error = getFriendlyErrorMessage(err, 'Could not update invitation.');
		} finally {
			inviteActionLoading = '';
		}
	}

	let touchStartX = 0;
	let touchEndX = 0;

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.changedTouches[0].screenX;
	}

	function handleTouchEnd(e: TouchEvent) {
		touchEndX = e.changedTouches[0].screenX;
		const diff = touchStartX - touchEndX;
		if (Math.abs(diff) > 50) {
			if (diff > 0) {
				showNearby(nearbyIndex + 1);
			} else {
				showNearby(nearbyIndex - 1);
			}
		}
	}

	function showNearby(index: number) {
		if (!nearbyEvents.length) return;
		nearbyIndex = (index + nearbyEvents.length) % nearbyEvents.length;
	}

	function changeRadius(radius: number) {
		radiusKm = radius;
		nearbyIndex = 0;
	}

	async function refreshDashboardData(userId: string) {
			const [
				createdEvents,
				participantEvents,
				loadedInvites,
				loadedPublicEvents,
				loadedFriends,
				followedOrganizations
			] = await Promise.all([
				getEventsCreatedByUser(userId),
				getEventsForUser(userId),
				getInvitesForUser(userId),
				getVisibleEventsForUser(userId),
				getFriendsForUser(userId),
				getOrganizationsFollowedByUser(userId)
			]);
		const eventsById = new SvelteMap<string, SportEvent>();
		for (const event of createdEvents) eventsById.set(event.id, event);
		for (const event of participantEvents) eventsById.set(event.id, event);
		allUserEvents = sortEventsByStartDate(Array.from(eventsById.values()));

		// Auto-detect and notify/mark finished events
		for (const event of allUserEvents) {
			if (isEventFinished(event) && event.status !== 'finished' && event.status !== 'cancelled') {
				void notifyEventFinished(event);
			}
		}

		events = allUserEvents.filter((event) => event.creatorId === userId);
		joinedEvents = allUserEvents.filter(
			(event) => event.creatorId !== userId && event.participantIds.includes(userId)
		);
		const { activeInvites, activeInviteEvents } = await getActiveInvitesWithEvents(loadedInvites);
		inviteEventsById = activeInviteEvents;
			invites = activeInvites;
			publicEvents = loadedPublicEvents;
			followedOrganizationIds = followedOrganizations.map((organization) => organization.id);
			friends = loadedFriends;
		await loadInvitePreview(activeInvites.filter((invite) => invite.status === 'pending'));
	}

	onMount(() => {
		let unsubscribePromotions = () => {};
		let unsubscribeEvents = () => {};
		let unsubscribeActivity = () => {};
		requestDeviceLocation();
		const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
			unsubscribePromotions();
			unsubscribeEvents();
			unsubscribeActivity();
			if (!currentUser) {
				await goto(resolve('/'));
				return;
			}

			user = currentUser;
			loading = true;
			error = '';

			try {
				profile = await ensureUserProfile(currentUser);
				await refreshDashboardData(currentUser.uid);
				unsubscribePromotions = subscribeToPromotedEventsForUser(
					currentUser.uid,
					profile,
					(loadedEvents) => (promotedEvents = loadedEvents),
					(err) => console.error('Promoted events listener error:', err)
				);
				unsubscribeEvents = subscribeToEventCatalogChanges(() => {
					void refreshDashboardData(currentUser.uid);
				});
				unsubscribeActivity = subscribeToUserActivityChanges(currentUser.uid, () => {
					void refreshDashboardData(currentUser.uid);
				});
			} catch (err) {
				console.error('Dashboard load error:', err);
				error = getFriendlyErrorMessage(err, 'Could not load your dashboard data.');
			} finally {
				loading = false;
			}
		});

		return () => {
			unsubscribe();
			unsubscribePromotions();
			unsubscribeEvents();
			unsubscribeActivity();
		};
	});
</script>

{#if loading}
	<div class="mx-auto max-w-6xl animate-pulse px-4 py-5 sm:px-5 sm:py-8">
		<!-- Header -->
		<div class="mb-7 flex items-start justify-between">
			<div>
				<div class="h-3 w-20 rounded-full bg-slate-200 dark:bg-slate-800"></div>
				<div class="mt-2 h-7 w-44 rounded-full bg-slate-200 dark:bg-slate-800"></div>
				<div class="mt-3 flex gap-4">
					<div class="h-3 w-24 rounded-full bg-slate-200 dark:bg-slate-800"></div>
					<div class="h-3 w-16 rounded-full bg-slate-200 dark:bg-slate-800"></div>
				</div>
			</div>
			<div class="flex items-center gap-3">
				<div class="h-10 w-32 rounded-full bg-slate-200 dark:bg-slate-800"></div>
				<div class="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800"></div>
			</div>
		</div>

		<div class="grid gap-6 lg:grid-cols-[1fr_300px]">
			<!-- Left column -->
			<div class="space-y-5">
				<!-- Next up card -->
				<div class="rounded-3xl bg-blue-50 p-6 dark:bg-blue-950/20">
					<div class="h-3 w-16 rounded-full bg-blue-100 dark:bg-blue-900/50"></div>
					<div class="mt-3 h-6 w-2/3 rounded-full bg-blue-100 dark:bg-blue-900/50"></div>
					<div class="mt-3 flex gap-5">
						<div class="h-3 w-28 rounded-full bg-blue-100 dark:bg-blue-900/50"></div>
						<div class="h-3 w-24 rounded-full bg-blue-100 dark:bg-blue-900/50"></div>
					</div>
					<div class="mt-4 flex items-center gap-3">
						<div class="h-1.5 flex-1 rounded-full bg-blue-100 dark:bg-blue-900/50"></div>
						<div class="h-3 w-20 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/50"></div>
					</div>
				</div>

				<!-- Sponsored section -->
				<div class="rounded-3xl border border-slate-200 p-5 dark:border-slate-800">
					<div class="mb-4 flex items-end justify-between">
						<div class="space-y-2">
							<div class="h-3 w-20 rounded-full bg-slate-200 dark:bg-slate-800"></div>
							<div class="h-5 w-48 rounded-full bg-slate-200 dark:bg-slate-800"></div>
						</div>
						<div class="h-3 w-14 rounded-full bg-slate-200 dark:bg-slate-800"></div>
					</div>
					<div class="h-28 rounded-2xl bg-slate-100 dark:bg-slate-800"></div>
				</div>

				<!-- Tabs + event card skeletons -->
				<div>
					<div class="mb-4 flex gap-6 border-b border-slate-200 pb-3 dark:border-slate-800">
						<div class="h-4 w-16 rounded-full bg-slate-200 dark:bg-slate-800"></div>
						<div class="h-4 w-14 rounded-full bg-slate-200 dark:bg-slate-800"></div>
					</div>
					<div class="space-y-3">
						{#each [0, 1, 2] as _}
							<div class="rounded-4xl border border-slate-200 p-5 dark:border-slate-800">
								<div class="flex items-start justify-between gap-4">
									<div class="min-w-0 flex-1 space-y-2.5">
										<div class="h-3 w-12 rounded-full bg-slate-200 dark:bg-slate-800"></div>
										<div class="h-5 w-3/4 rounded-full bg-slate-200 dark:bg-slate-800"></div>
										<div class="h-3 w-40 rounded-full bg-slate-200 dark:bg-slate-800"></div>
										<div class="h-3 w-32 rounded-full bg-slate-200 dark:bg-slate-800"></div>
									</div>
									<div class="h-14 w-14 shrink-0 rounded-2xl bg-slate-100 dark:bg-slate-800"></div>
								</div>
								<div class="mt-4">
									<div class="h-6 w-20 rounded-full bg-slate-100 dark:bg-slate-800"></div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- Right sidebar -->
			<div class="space-y-4">
				<div class="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800">
					<div
						class="flex justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800"
					>
						<div class="h-3 w-16 rounded-full bg-slate-200 dark:bg-slate-800"></div>
						<div class="h-3 w-12 rounded-full bg-slate-200 dark:bg-slate-800"></div>
					</div>
					<div class="h-44 bg-slate-100 dark:bg-slate-800"></div>
				</div>
				<div class="grid grid-cols-2 gap-2">
					<div
						class="h-20 rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
					></div>
					<div
						class="h-20 rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
					></div>
				</div>
			</div>
		</div>
	</div>
{:else}
	<div class="mx-auto max-w-7xl px-4 py-5 sm:px-5 sm:py-8">
		<header class="mb-5 flex items-center justify-between gap-4 sm:mb-7">
			<div class="min-w-0">
				<p class="text-sm font-black text-blue-600 dark:text-blue-400">Rally</p>
				<h1 class="mt-1 truncate text-2xl font-black tracking-tight text-slate-950 dark:text-slate-50 sm:text-4xl">
					{greeting()}, {profile?.displayName ?? user?.displayName ?? 'Athlete'}
				</h1>
				<p class="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
					What are you playing today?
				</p>
			</div>

			<div class="relative flex shrink-0 items-center gap-2 sm:gap-3">
				<button
					type="button"
					onclick={() => (showNotifications = !showNotifications)}
					class="relative grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
					aria-label="Notifications"
					aria-expanded={showNotifications}
				>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5" aria-hidden="true">
							<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
							<path d="M13.73 21a2 2 0 0 1-3.46 0" />
						</svg>
					{#if notificationCount > 0}
						<span class="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
							{formatBadge(notificationCount)}
						</span>
					{/if}
				</button>

				{#if showNotifications}
					<button
						type="button"
						class="fixed inset-0 z-30 cursor-default"
						aria-label="Close notifications"
						onclick={() => (showNotifications = false)}
					></button>
					<div
						class="absolute right-0 top-12 z-40 w-[min(18.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white p-2 text-left shadow-2xl shadow-slate-300/60 dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/30 sm:w-[23rem] sm:rounded-[1.5rem] sm:p-3"
					>
						<div class="flex items-center justify-between px-1 pb-2">
							<div>
								<p class="text-xs font-black text-slate-950 dark:text-slate-50 sm:text-sm">Notifications</p>
								<p class="text-xs font-semibold text-slate-500 dark:text-slate-400">
									{notificationCount > 0 ? `${notificationCount} new update${notificationCount === 1 ? '' : 's'}` : 'All caught up'}
								</p>
							</div>
							<span class="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-600 dark:bg-blue-950 dark:text-blue-300">
								{formatBadge(notificationCount)}
							</span>
						</div>

						<div class="max-h-[18rem] space-y-1.5 overflow-y-auto pr-1 sm:max-h-[24rem] sm:space-y-2">
							{#if notificationState.previews.length > 0}
								{#each notificationState.previews as item (item.id)}
								<a
									href={item.href}
									onclick={() => (showNotifications = false)}
									class="flex items-center gap-2 rounded-2xl bg-slate-50 p-2 transition hover:bg-blue-50 dark:bg-slate-900 dark:hover:bg-blue-950/30 sm:gap-3 sm:p-3"
								>
									{#if item.photoURL}
										<img src={item.photoURL} alt="" class="h-9 w-9 shrink-0 rounded-full object-cover sm:h-11 sm:w-11" />
									{:else}
										<span
											class={`grid h-9 w-9 shrink-0 place-items-center rounded-full sm:h-11 sm:w-11 ${
												item.type === 'message'
													? 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300'
													: item.type === 'invite'
														? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300'
														: 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-300'
											}`}
										>
											{#if item.type === 'message'}
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5" aria-hidden="true">
													<path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
												</svg>
											{:else if item.type === 'invite'}
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5" aria-hidden="true">
													<path d="M8 2v4" />
													<path d="M16 2v4" />
													<rect x="3" y="4" width="18" height="18" rx="2" />
													<path d="M3 10h18" />
												</svg>
											{:else}
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5" aria-hidden="true">
													<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
													<circle cx="9" cy="7" r="4" />
													<path d="M19 8v6" />
													<path d="M22 11h-6" />
												</svg>
											{/if}
										</span>
									{/if}
									<div class="min-w-0 flex-1">
										<p class="truncate text-xs font-black text-slate-950 dark:text-slate-50 sm:text-sm">
											{item.title}
										</p>
										<p class="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400 sm:text-xs">
											{item.body}
										</p>
									</div>
									<span class="hidden rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-400 dark:bg-slate-950 dark:text-slate-500 sm:inline-flex">
										{item.type === 'friend_request' ? 'friend' : item.type}
									</span>
								</a>
								{/each}
							{:else}
								<div class="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400">
									No new notifications right now.
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<a href={resolve('/profile')} class="rounded-full transition hover:opacity-80" aria-label="Profile">
					<UserAvatar photoURL={profile?.photoURL ?? user?.photoURL} displayName={profile?.displayName ?? user?.displayName} email={profile?.email ?? user?.email} size="md" />
				</a>
			</div>
		</header>

		{#if error}
			<div
				class="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
			>
				{error}
			</div>
		{/if}

			{#if pendingInvites.length > 0}
				<div class="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm dark:border-emerald-950/60 dark:bg-slate-900 sm:mb-7">
					<a
						href={resolve(invitePreviewEvent ? `/events/${invitePreviewEvent.id}` : '/messages')}
						class="flex min-w-0 flex-1 items-center gap-3 rounded-2xl transition hover:opacity-80"
					>
						<UserAvatar
							photoURL={invitePreviewUser?.photoURL}
							displayName={invitePreviewUser?.displayName ?? 'Rally user'}
							email={invitePreviewUser?.email}
							size="sm"
						/>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-black text-slate-950 dark:text-slate-50">
								{invitePreviewUser?.displayName ?? 'Someone'} invited you
								{#if pendingInvites.length > 1}
									<span class="font-semibold text-slate-400 dark:text-slate-500">
										+{pendingInvites.length - 1} more
									</span>
								{/if}
							</p>
							<p class="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
								{invitePreviewEvent?.title ?? 'Event invite'}
								{#if invitePreviewEvent}
									- {formatCompactDate(invitePreviewEvent.startAt)}
								{/if}
							</p>
						</div>
					</a>

					<div class="flex shrink-0 gap-2">
						<button
							type="button"
							onclick={() => handleInviteResponse('declined')}
							disabled={Boolean(inviteActionLoading)}
							class="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
							aria-label="Decline invite"
						>
							{#if inviteActionLoading === 'declined'}
								...
							{:else}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true">
									<path d="M18 6 6 18" />
									<path d="m6 6 12 12" />
								</svg>
							{/if}
						</button>
						<button
							type="button"
							onclick={() => handleInviteResponse('accepted')}
							disabled={Boolean(inviteActionLoading)}
							class="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500 font-black text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-600 disabled:opacity-60"
							aria-label="Accept invite"
						>
							{#if inviteActionLoading === 'accepted'}
								...
							{:else}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true">
									<path d="m20 6-11 11-5-5" />
								</svg>
							{/if}
						</button>
					</div>
				</div>
			{/if}

			<nav class="flex gap-2 overflow-x-auto pb-4 sm:pb-3">
				<a href={resolve('/explore')} class="inline-flex shrink-0 items-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true">
							<circle cx="11" cy="11" r="8" />
							<path d="m21 21-4.35-4.35" />
						</svg>
						Find events
					</a>
					<a href={resolve('/events/create')} class="inline-flex shrink-0 items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-slate-950/15 transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true">
							<path d="M12 5v14" />
							<path d="M5 12h14" />
						</svg>
						Create event
					</a>
					<a href={resolve('/profile')} class="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-800">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true">
							<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
							<circle cx="9" cy="7" r="4" />
							<path d="M19 8v6" />
							<path d="M22 11h-6" />
						</svg>
						Invite friends
					</a>
			</nav>

			<section class="mt-5 space-y-3">
				<div class="flex items-end justify-between gap-4">
					<div>
						<p class="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Featured event</p>
						<h2 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50">Your next rally</h2>
					</div>
					{#if upcomingRallies.length > 1}
						<button
							type="button"
							onclick={() => (showUpcomingRallies = !showUpcomingRallies)}
							class="shrink-0 text-sm font-black text-blue-600 dark:text-blue-400"
						>
							{showUpcomingRallies ? 'Hide' : 'View all'}
						</button>
					{:else}
						<a href={resolve('/explore')} class="shrink-0 text-sm font-black text-blue-600 dark:text-blue-400">Explore</a>
					{/if}
				</div>

				{#if nextEvent}
					<div class="max-w-2xl">
						<EventCard
							event={nextEvent}
							variant="hero"
							heroCtaLabel="Already in event"
							heroCtaTone="muted"
						/>
					</div>

					{#if showUpcomingRallies && upcomingRallies.length > 1}
						<div class="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
							{#each upcomingRallies.slice(1) as event (event.id)}
								<div class="w-[17rem] shrink-0 sm:w-[23rem]">
									<EventCard
										{event}
										variant="hero"
										miniHero
										heroCtaLabel="Already in event"
										heroCtaTone="muted"
									/>
								</div>
							{/each}
						</div>
					{/if}
				{:else}
					<div class="rounded-[1.5rem] border border-dashed border-blue-200 bg-white/80 p-5 dark:border-blue-900/60 dark:bg-slate-900/80">
						<p class="font-black text-slate-950 dark:text-slate-50">No upcoming games yet</p>
						<p class="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">Find something nearby to join.</p>
						<div class="mt-4">
							<a href={resolve('/explore')} class="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white transition hover:bg-blue-700">Explore</a>
						</div>
					</div>
				{/if}
			</section>

			{#if friends.length > 0}
				<section class="mt-6 space-y-3">
					<div class="flex items-end justify-between gap-4">
						<div>
							<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">
								Friends up for something
							</h2>
							<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">
								Invite someone to your next game.
							</p>
						</div>
						<a
							href={resolve('/profile')}
							class="shrink-0 text-sm font-black text-blue-600 dark:text-blue-400"
						>
							See all
						</a>
					</div>

					<div class="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
						{#each friends.slice(0, 8) as friend (friend.id)}
							<a
								href={resolve(`/users/${friend.id}`)}
								class="w-16 shrink-0 text-center transition hover:-translate-y-0.5 hover:opacity-90 sm:w-20"
							>
								<div class="flex justify-center">
									<UserAvatar
										photoURL={friend.photoURL}
										displayName={friend.displayName}
										email={friend.email}
										size="lg"
										plain
									/>
								</div>
								<p class="mt-2 truncate text-xs font-black text-slate-800 dark:text-slate-100">
									{friend.displayName}
								</p>
								<p class="text-[11px] font-bold text-slate-500 dark:text-slate-400">Friend</p>
							</a>
						{/each}

						<a
							href={resolve('/friends/add')}
							class="w-16 shrink-0 text-center transition hover:-translate-y-0.5 hover:opacity-90 sm:w-20"
						>
							<span class="mx-auto grid h-14 w-14 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 sm:h-16 sm:w-16">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5" aria-hidden="true">
									<path d="M12 5v14" />
									<path d="M5 12h14" />
								</svg>
							</span>
							<p class="mt-2 text-xs font-black text-slate-800 dark:text-slate-100">Invite</p>
							<p class="text-[11px] font-bold text-slate-500 dark:text-slate-400">Friends</p>
						</a>
					</div>
				</section>
			{/if}

			{#if dashboardPromotedEvents.length > 0}
				<section class="mt-6 space-y-3">
					<div class="flex items-end justify-between gap-4">
						<div>
							<p class="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
								Sponsored
							</p>
							<h2 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50">
								Promoted for you
							</h2>
						</div>
						<a
							href={resolve('/explore')}
							class="shrink-0 text-sm font-black text-blue-600 dark:text-blue-400"
						>
							View all
						</a>
					</div>

					<div class="max-w-2xl">
						<PromotedEventCarousel
							events={dashboardPromotedEvents}
							cardVariant="hero"
							compactHero
							heroCtaLabel="View event"
						/>
					</div>
				</section>
			{/if}

			<section class="mt-6 space-y-3">
				<div class="min-w-0 space-y-3">
					<div class="flex flex-wrap items-end justify-between gap-3">
						<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Discover</h2>

						<div class="flex flex-wrap items-center gap-2">
							{#if discoverTab === 'nearby'}
								{#if locationStatus === 'blocked' || locationStatus === 'idle' || locationStatus === 'unsupported'}
									<button
										type="button"
										onclick={requestDeviceLocation}
										class="rounded-full bg-white px-3 py-2 text-xs font-black text-blue-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 dark:hover:bg-slate-800"
									>
										Use my location
									</button>
								{/if}
								<div class="flex items-center gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
									{#each [10, 20, 50] as radius}
										<button
											type="button"
											onclick={() => changeRadius(radius)}
											class={`h-8 rounded-full px-3 text-xs font-black transition ${
												radiusKm === radius
													? 'bg-blue-600 text-white'
													: 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
											}`}
										>
											{radius} km
										</button>
									{/each}
								</div>
								{:else}
									<a href={resolve('/explore')} class="shrink-0 text-sm font-black text-blue-600 hover:text-blue-700 dark:text-blue-400">View all</a>
								{/if}
							</div>
						</div>

						<div class="flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
							<button
								type="button"
								onclick={() => (discoverTab = 'nearby')}
								class={`relative shrink-0 pb-3 pr-5 text-sm font-bold transition ${
									discoverTab === 'nearby'
										? 'text-slate-950 dark:text-slate-50'
										: 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
								}`}
						>
							Nearby
							{#if discoverTab === 'nearby'}
								<span class="absolute bottom-0 left-0 right-5 h-0.5 rounded-full bg-slate-950 dark:bg-white"></span>
							{/if}
						</button>

							<button
								type="button"
								onclick={() => (discoverTab = 'recommended')}
								class={`relative shrink-0 pb-3 pr-5 text-sm font-bold transition ${
									discoverTab === 'recommended'
										? 'text-slate-950 dark:text-slate-50'
										: 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
								}`}
						>
							For you
							{#if discoverTab === 'recommended'}
									<span class="absolute bottom-0 left-0 right-5 h-0.5 rounded-full bg-slate-950 dark:bg-white"></span>
								{/if}
							</button>

							<button
								type="button"
								onclick={() => (discoverTab = 'following')}
								class={`relative shrink-0 pb-3 pr-5 text-sm font-bold transition ${
									discoverTab === 'following'
										? 'text-slate-950 dark:text-slate-50'
										: 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
								}`}
							>
								Following
								{#if discoverTab === 'following'}
									<span class="absolute bottom-0 left-0 right-5 h-0.5 rounded-full bg-slate-950 dark:bg-white"></span>
								{/if}
							</button>
						</div>

					{#if discoverTab === 'nearby'}
						<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">
							{#if locationStatus === 'ready'}
								Within {radiusKm} km of your current location.
							{:else if locationStatus === 'loading'}
								Checking your location...
							{:else if locationStatus === 'blocked'}
								Location is blocked. Enable it in your browser to use the radius.
							{:else if locationStatus === 'unsupported'}
								Your browser does not support location for nearby events.
							{:else}
								Allow location to find events around you.
							{/if}
						</p>

						{#if nearbyEvents.length > 0}
							<div class="space-y-3">
								<div class="relative flex items-center group/carousel">
									{#if nearbyEvents.length > 2}
										<!-- Left Arrow Button (PC Only) -->
										<button
											type="button"
											onclick={() => showNearby(nearbyIndex - 1)}
											class="hidden md:grid absolute left-[-1.25rem] z-10 h-10 w-10 place-items-center rounded-full bg-white/95 text-slate-700 shadow-md ring-1 ring-slate-200 transition-all hover:scale-105 hover:bg-slate-50 dark:bg-slate-900/95 dark:text-slate-200 dark:ring-slate-800 dark:hover:bg-slate-800 active:scale-95"
											aria-label="Previous event"
										>
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5" aria-hidden="true">
												<path d="m15 18-6-6 6-6" />
											</svg>
										</button>

										<!-- Right Arrow Button (PC Only) -->
										<button
											type="button"
											onclick={() => showNearby(nearbyIndex + 1)}
											class="hidden md:grid absolute right-[-1.25rem] z-10 h-10 w-10 place-items-center rounded-full bg-white/95 text-slate-700 shadow-md ring-1 ring-slate-200 transition-all hover:scale-105 hover:bg-slate-50 dark:bg-slate-900/95 dark:text-slate-200 dark:ring-slate-800 dark:hover:bg-slate-800 active:scale-95"
											aria-label="Next event"
										>
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5" aria-hidden="true">
												<path d="m9 18 6-6-6-6" />
											</svg>
										</button>
									{/if}

									<!-- Mobile View: Exactly 1 card with swipe gestures -->
									<div
										class="block md:hidden w-full select-none"
										role="group"
										aria-label="Nearby events carousel"
										ontouchstart={handleTouchStart}
										ontouchend={handleTouchEnd}
									>
										{#if nearbyEvents[nearbyIndex]}
											<EventCard
												event={nearbyEvents[nearbyIndex]}
												variant="hero"
												compactHero
												heroCtaLabel="View event"
											/>
										{/if}
									</div>

									<!-- Desktop/PC View: Exactly 2 cards side-by-side -->
									<div class="hidden md:flex gap-4 w-full">
										{#if nearbyEvents[nearbyIndex]}
											<div class="w-1/2">
												<EventCard
													event={nearbyEvents[nearbyIndex]}
													variant="hero"
													compactHero
													heroCtaLabel="View event"
												/>
											</div>
										{/if}
										{#if nearbyEvents.length > 1}
											{@const nextIndex = (nearbyIndex + 1) % nearbyEvents.length}
											{#if nearbyEvents[nextIndex]}
												<div class="w-1/2">
													<EventCard
														event={nearbyEvents[nextIndex]}
														variant="hero"
														compactHero
														heroCtaLabel="View event"
													/>
												</div>
											{/if}
										{/if}
									</div>
								</div>

								<!-- Navigation Dots -->
								{#if nearbyEvents.length > 1}
									<div class="flex flex-wrap items-center justify-center gap-1.5 pt-1">
										{#each nearbyEvents as event, index (event.id)}
											<button
												type="button"
												onclick={() => showNearby(index)}
												class={`h-2 rounded-full transition-all ${index === nearbyIndex ? 'w-6 bg-blue-600' : 'w-2 bg-blue-200 dark:bg-blue-900'}`}
												aria-label={`Show nearby event ${index + 1}`}
											></button>
										{/each}
									</div>
								{/if}
							</div>
						{:else}
							<div class="rounded-[1.5rem] border border-dashed border-slate-200 bg-white/70 p-5 text-sm dark:border-slate-800 dark:bg-slate-900/70">
								<p class="font-black text-slate-800 dark:text-slate-100">
									{locationStatus === 'ready' ? 'No nearby events in this radius' : 'Location needed'}
								</p>
								<p class="mt-1 text-slate-500 dark:text-slate-400">
									{locationStatus === 'ready'
										? 'Try a bigger radius or explore all public events.'
										: 'Use your location so Rally can filter events by the selected radius.'}
								</p>
							</div>
						{/if}
						{:else if discoverTab === 'recommended'}
							{#if recommendedEvents.length > 0}
								<PromotedEventCarousel events={recommendedEvents} cardVariant="profile" />
							{:else}
								<div class="rounded-[1.5rem] border border-dashed border-slate-200 bg-white/70 p-5 text-sm dark:border-slate-800 dark:bg-slate-900/70">
									<p class="font-black text-slate-800 dark:text-slate-100">
										{hasFavoriteSports ? 'No recommendations right now' : 'Choose your favourite sports'}
									</p>
									<p class="mt-1 text-slate-500 dark:text-slate-400">
										{hasFavoriteSports
											? 'Events matching your favourite sports will appear here.'
											: 'Go to your profile and select sports so Rally can recommend better events.'}
									</p>
									{#if !hasFavoriteSports}
										<a href={resolve('/profile')} class="mt-3 inline-flex rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white transition hover:bg-blue-700">
											Update profile
										</a>
									{/if}
								</div>
							{/if}
						{:else}
							{#if followingEvents.length > 0}
								<PromotedEventCarousel events={followingEvents} cardVariant="profile" />
							{:else}
								<div class="rounded-[1.5rem] border border-dashed border-slate-200 bg-white/70 p-5 text-sm dark:border-slate-800 dark:bg-slate-900/70">
									<p class="font-black text-slate-800 dark:text-slate-100">
										{followedOrganizationIds.length > 0 ? 'No events from followed organizations' : 'Follow organizations to see their events'}
									</p>
									<p class="mt-1 text-slate-500 dark:text-slate-400">
										{followedOrganizationIds.length > 0
											? 'When clubs you follow create public events, they will appear here.'
											: 'Open an organization profile and follow it to keep its events close.'}
									</p>
									<a href={resolve('/explore')} class="mt-3 inline-flex rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white transition hover:bg-blue-700">
										Explore organizations
									</a>
								</div>
							{/if}
						{/if}
					</div>

			</section>

			<section class="mt-6 space-y-4">
				<div class="flex items-end justify-between gap-4">
					<div>
						<p class="text-xs font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Upcoming events</p>
						<h2 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50">Your activity</h2>
					</div>
				</div>

				<div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800">
					<div class="flex items-center gap-1">
						<button
							type="button"
							onclick={() => (activeTab = 'hosting')}
							class={`relative pb-3 pr-5 text-sm font-bold transition ${
								activeTab === 'hosting'
									? 'text-slate-950 dark:text-slate-50'
									: 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
							}`}
						>
							Hosting
							<span class="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
								{currentHostingEvents.length}
							</span>
							{#if activeTab === 'hosting'}
								<span class="absolute bottom-0 left-0 right-5 h-0.5 rounded-full bg-slate-950 dark:bg-white"></span>
							{/if}
						</button>

						<button
							type="button"
							onclick={() => (activeTab = 'joined')}
							class={`relative pb-3 pr-5 text-sm font-bold transition ${
								activeTab === 'joined'
									? 'text-slate-950 dark:text-slate-50'
									: 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
							}`}
						>
							Joined
							<span class="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
								{currentJoinedEvents.length}
							</span>
							{#if activeTab === 'joined'}
								<span class="absolute bottom-0 left-0 right-5 h-0.5 rounded-full bg-slate-950 dark:bg-white"></span>
							{/if}
						</button>
					</div>

					<button
						type="button"
						onclick={() => (showPastEvents = !showPastEvents)}
						class={`mb-3 rounded-full border px-4 py-1.5 text-xs font-bold shadow-sm transition active:scale-95 ${
							showPastEvents
								? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300'
								: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
						}`}
					>
						{showPastEvents ? 'View active events' : 'View past events'}
					</button>
				</div>

				{#if activeTab === 'hosting'}
					{#if currentHostingEvents.length === 0}
						<div class="rounded-[1.7rem] border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
							<p class="text-sm text-slate-500 dark:text-slate-400">
								{showPastEvents
									? 'No past events found.'
									: events.length === 0
										? 'No events created yet.'
										: 'No upcoming events right now. Create another one when you are ready.'}
							</p>
						</div>
					{:else}
						<div class="grid gap-3 lg:grid-cols-2">
							{#each currentHostingEvents as event (event.id)}
								<EventCard {event} variant="profile" />
							{/each}
						</div>
					{/if}
				{:else}
					{#if currentJoinedEvents.length === 0}
						<div class="rounded-[1.7rem] border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
							<p class="text-sm text-slate-500 dark:text-slate-400">
								{showPastEvents
									? 'No past joined events found.'
									: "You haven't joined any upcoming events yet."}
							</p>
							{#if !showPastEvents}
								<a href={resolve('/explore')} class="mt-3 inline-flex rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700">
									Find events near you
								</a>
							{/if}
						</div>
					{:else}
						<div class="grid gap-3 lg:grid-cols-2">
							{#each currentJoinedEvents as event (event.id)}
								<EventCard {event} variant="profile" />
							{/each}
						</div>
					{/if}

					{#if !showPastEvents && cancelledEventsForActiveTab.length > 0}
						<div class="mt-2">
							<button
								type="button"
								onclick={() => (showCancelledEvents = !showCancelledEvents)}
								class="flex items-center gap-1.5 text-sm font-bold text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.4"
									stroke-linecap="round"
									stroke-linejoin="round"
									class={`h-4 w-4 transition-transform ${showCancelledEvents ? 'rotate-90' : ''}`}
									aria-hidden="true"
								>
									<path d="m9 18 6-6-6-6" />
								</svg>
								Cancelled ({cancelledEventsForActiveTab.length})
							</button>

							{#if showCancelledEvents}
								<div class="mt-3 grid gap-3 opacity-70 lg:grid-cols-2">
									{#each cancelledEventsForActiveTab as event (event.id)}
										<EventCard {event} variant="profile" />
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				{/if}
			</section>
		</div>
{/if}
