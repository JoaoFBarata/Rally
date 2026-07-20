<!--src/routes/users/[id]/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { doc, getDoc } from 'firebase/firestore';
	import { FirebaseError } from 'firebase/app';
	import { auth, db } from '$lib/firebase';
	import type { SportEvent, UserProfile } from '$lib/schema';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import PublicProfileEventCard from '$lib/components/PublicProfileEventCard.svelte';
	import { getUserProfile } from '$lib/services/user.service';
	import {
		getFriendsForUser,
		getRelationshipStatus,
		removeFriend,
		sendFriendRequestByTag,
		type RelationshipStatus
	} from '$lib/services/social.service';
	import { getOrCreateDirectConversation } from '$lib/services/chat.service';
	import {
		getEventsCreatedByUser,
		getEventsForUser,
		isEventFinished,
		PROMOTION_COUNTRIES
	} from '$lib/services/event.service';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { goBack } from '$lib/utils/navigation';
	import {
		subscribeToUserActivityChanges,
		subscribeToUserChanges
	} from '$lib/services/realtime.service';
	import {
		formatCapacity,
		formatPrice,
		formatSport,
		getSportBackgroundImage
	} from '$lib/utils/format.utils';
	import { i18n } from '$lib/services/i18n.svelte';
	import { getEventTemporalState } from '$lib/utils/event-lifecycle.utils';

	let targetProfile = $state<UserProfile | null>(null);
	let currentProfile = $state<UserProfile | null>(null);
	let relationship = $state<RelationshipStatus>('none');

	let showAllSports = $state(false);
	let showAllUpcomingEvents = $state(false);
	let showAllRecentEvents = $state(false);
	let allHostedEvents = $state<SportEvent[]>([]);
	let allParticipatedEvents = $state<SportEvent[]>([]);
	let currentFriends = $state<UserProfile[]>([]);
	let targetFriends = $state<UserProfile[]>([]);

	let loading = $state(true);
	let actionLoading = $state(false);
	let isPrivateProfile = $state(false);
	let error = $state('');
	let success = $state('');
	let showRemoveConfirmModal = $state(false);
	let isOrganizationViewer = $derived(currentProfile?.accountType === 'organization');

	let visibleSports = $derived.by(() => {
		if (!targetProfile?.sports?.length) return [];
		return showAllSports ? targetProfile.sports : targetProfile.sports.slice(0, 3);
	});

	let mutualFriends = $derived.by(() => {
		const currentFriendIds = new Set(currentFriends.map((friend) => friend.id));
		return targetFriends.filter((friend) => currentFriendIds.has(friend.id));
	});

	let allPublicEvents = $derived.by(() => {
		const eventMap = new Map<string, SportEvent>();
		for (const event of [...allHostedEvents, ...allParticipatedEvents]) {
			eventMap.set(event.id, event);
		}
		return [...eventMap.values()];
	});

	let liveProfileEvents = $derived.by(() =>
		sortEventsByStatusThenDate(
			allPublicEvents.filter((event) => getEventTemporalState(event) === 'live')
		)
	);

	let allUpcomingProfileEvents = $derived.by(() =>
		sortEventsByStatusThenDate(
			allPublicEvents.filter(
				(event) =>
					!isEventFinished(event) &&
					event.status !== 'cancelled' &&
					getEventTemporalState(event) !== 'live'
			)
		)
	);

	let allRecentProfileEvents = $derived.by(() =>
		[...allPublicEvents]
			.filter((event) => isEventFinished(event) || event.status === 'cancelled')
			.sort((a, b) => getEventStartMs(b) - getEventStartMs(a))
	);

	let upcomingProfileEvents = $derived.by(() =>
		showAllUpcomingEvents ? allUpcomingProfileEvents : allUpcomingProfileEvents.slice(0, 3)
	);

	let recentProfileEvents = $derived.by(() =>
		showAllRecentEvents ? allRecentProfileEvents : allRecentProfileEvents.slice(0, 3)
	);

	function getEventStartMs(event: SportEvent): number {
		const ts = event.startAt as unknown as { toMillis?: () => number; toDate?: () => Date };
		return ts?.toMillis?.() ?? ts?.toDate?.()?.getTime() ?? 0;
	}

	function getEventDate(event: SportEvent) {
		const startMs = getEventStartMs(event);
		return startMs ? new Date(startMs) : null;
	}

	function getLocale() {
		return { en: 'en-GB', pt: 'pt-PT', es: 'es-ES', fr: 'fr-FR' }[i18n.currentLang];
	}

	function formatEventMonth(event: SportEvent) {
		const date = getEventDate(event);
		return date?.toLocaleDateString(getLocale(), { month: 'short' }).toUpperCase() ?? '—';
	}

	function formatEventDay(event: SportEvent) {
		const date = getEventDate(event);
		return date?.toLocaleDateString(getLocale(), { day: '2-digit' }) ?? '--';
	}

	function formatEventSchedule(event: SportEvent) {
		const date = getEventDate(event);
		if (!date) return i18n.t('date_not_set');
		return date.toLocaleDateString(getLocale(), {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getEventImage(event: SportEvent) {
		return event.groupPhotoURL || getSportBackgroundImage(event.sport);
	}

	function getEventLocation(event: SportEvent) {
		return event.location?.address || event.location?.name || i18n.t('location_not_set');
	}

	function formatCountryName(countryCode?: string | null) {
		if (!countryCode) return '';
		return PROMOTION_COUNTRIES.find((country) => country.code === countryCode)?.label ?? countryCode;
	}

	function formatProfileLocation(profile: UserProfile) {
		const countryName = formatCountryName(profile.country);
		return [profile.city, countryName].filter(Boolean).join(', ');
	}

	function formatProfileEventCapacity(event: SportEvent) {
		return formatCapacity({
			participantIds: event.participantIds,
			maxParticipants: event.maxParticipants,
			eventKind: event.eventKind,
			maxTournamentEntries: event.maxTournamentEntries ?? undefined
		});
	}

	function formatProfileEventPrice(event: SportEvent) {
		return formatPrice({
			pricePerPerson: event.pricePerPerson ?? undefined,
			entryFeeAmount: event.entryFeeAmount ?? undefined,
			priceTotal: event.priceTotal ?? undefined,
			maxParticipants: event.maxParticipants
		});
	}

	function getRecentActivityText(event: SportEvent) {
		if (event.creatorId === targetProfile?.id) return i18n.t('hosting').toLowerCase();
		return i18n.t('joined').toLowerCase();
	}

	function isEventActive(event: SportEvent): boolean {
		if (event.status === 'cancelled' || isEventFinished(event)) return false;
		const startMs = getEventStartMs(event);
		return startMs === 0 || startMs >= Date.now();
	}

	function sortEventsByStatusThenDate(events: SportEvent[]): SportEvent[] {
		return [...events].sort((a, b) => {
			const diff = (isEventActive(a) ? 0 : 1) - (isEventActive(b) ? 0 : 1);
			if (diff !== 0) return diff;
			return getEventStartMs(a) - getEventStartMs(b);
		});
	}

	async function loadUserPage(currentUserId: string, showLoading = true) {
		if (showLoading) loading = true;
		error = '';
		success = '';
		isPrivateProfile = false;

		try {
			const targetUserId = page.params.id;

			if (!targetUserId) {
				error = i18n.t('user_not_found');
				return;
			}

			if (targetUserId === currentUserId) {
				await goto(resolve('/profile'));
				return;
			}

			let targetProfileIsPrivate = false;

			const [loadedTargetProfile, loadedCurrentProfile] = await Promise.all([
				(async () => {
					try {
						const targetSnap = await getDoc(doc(db, 'users', targetUserId));
						return targetSnap.exists()
							? ({ ...targetSnap.data(), id: targetSnap.id } as UserProfile)
							: null;
					} catch (err) {
						if (err instanceof FirebaseError && err.code === 'permission-denied') {
							targetProfileIsPrivate = true;
							return null;
						}
						throw err;
					}
				})(),
				getUserProfile(currentUserId)
			]);

			if (targetProfileIsPrivate) {
				isPrivateProfile = true;
				return;
			}

			if (!loadedTargetProfile) {
				error = i18n.t('user_not_found');
				return;
			}

			if (
				loadedTargetProfile.accountType === 'organization' &&
				loadedTargetProfile.activeOrganizationId
			) {
				await goto(resolve(`/organizations/${loadedTargetProfile.activeOrganizationId}`));
				return;
			}

			targetProfile = loadedTargetProfile;
			currentProfile = loadedCurrentProfile;
			loading = false;

			const [allHosted, allParticipated, loadedRelationship, loadedCurrentFriends, loadedTargetFriends] =
				await Promise.all([
					getEventsCreatedByUser(targetUserId).catch((err) => {
						console.error('Could not load hosted events:', err);
						return [];
					}),
					getEventsForUser(targetUserId).catch((err) => {
						console.error('Could not load participated events:', err);
						return [];
					}),
					loadedCurrentProfile?.accountType === 'organization'
						? Promise.resolve<RelationshipStatus>('none')
						: getRelationshipStatus({
								currentUserId,
								targetUserId
							}).catch((err) => {
								console.error('Could not load relationship:', err);
								return 'none' as RelationshipStatus;
							}),
					loadedCurrentProfile?.accountType === 'organization'
						? Promise.resolve<UserProfile[]>([])
						: getFriendsForUser(currentUserId).catch((err) => {
								console.error('Could not load current friends:', err);
								return [];
							}),
					loadedCurrentProfile?.accountType === 'organization'
						? Promise.resolve<UserProfile[]>([])
						: getFriendsForUser(targetUserId).catch((err) => {
								console.error('Could not load target friends:', err);
								return [];
							})
				]);

			allHostedEvents = sortEventsByStatusThenDate(allHosted.filter((e) => e.visibility === 'public'));
			allParticipatedEvents = sortEventsByStatusThenDate(
				allParticipated.filter((e) => e.visibility === 'public' && e.creatorId !== targetUserId)
			);
			relationship = loadedRelationship;
			currentFriends = loadedCurrentFriends;
			targetFriends = loadedTargetFriends;
		} catch (err) {
			console.error('Public user page error:', err);
			error = i18n.t('public_profile_load_error');
		} finally {
			loading = false;
		}
	}

	async function handleAddFriend() {
		const currentUser = auth.currentUser;

		if (!currentUser || !targetProfile?.rallyTag) return;

		actionLoading = true;
		error = '';
		success = '';

		try {
			await sendFriendRequestByTag({
				fromUserId: currentUser.uid,
				rallyTag: targetProfile.rallyTag
			});

			relationship = 'request_sent';
			success = i18n.t('friend_request_sent', { name: targetProfile.displayName });
		} catch (err) {
			console.error('Add friend from public profile error:', err);
			error = getFriendlyErrorMessage(err, i18n.t('could_not_send_friend_request'));

			const updatedRelationship = await getRelationshipStatus({
				currentUserId: currentUser.uid,
				targetUserId: targetProfile.id
			});

			relationship = updatedRelationship;
		} finally {
			actionLoading = false;
		}
	}

	async function copyRallyTag() {
		if (!targetProfile?.rallyTag || typeof navigator === 'undefined') return;

		error = '';
		success = '';

		try {
			await navigator.clipboard.writeText(targetProfile.rallyTag);
			success = i18n.t('rally_tag_copied');
		} catch (err) {
			console.error('Copy rally tag error:', err);
			error = i18n.t('could_not_copy_tag');
		}
	}

	async function handleMessage() {
		const currentUser = auth.currentUser;

		if (!currentUser || !targetProfile) return;

		actionLoading = true;
		error = '';

		try {
			const conversationId = await getOrCreateDirectConversation(currentUser.uid, targetProfile.id);

			localStorage.setItem(`rally:last-read:${conversationId}`, String(Date.now()));
			await goto(resolve(`/messages/${conversationId}`));
		} catch (err) {
			console.error('Message user error:', err);
			error = getFriendlyErrorMessage(err, i18n.t('could_not_open_conversation'));
		} finally {
			actionLoading = false;
		}
	}

	function handleRemoveFriend() {
		showRemoveConfirmModal = true;
	}

	async function executeRemoveFriend() {
		const currentUser = auth.currentUser;

		if (!currentUser || !targetProfile) return;
		showRemoveConfirmModal = false;

		actionLoading = true;
		error = '';
		success = '';

		try {
			await removeFriend({
				currentUserId: currentUser.uid,
				friendId: targetProfile.id
			});

			relationship = 'none';
			success = i18n.t('friend_removed', { name: targetProfile.displayName });
		} catch (err) {
			console.error('Remove friend from public profile error:', err);
			error = getFriendlyErrorMessage(err, i18n.t('could_not_remove_friend'));
		} finally {
			actionLoading = false;
		}
	}

	let currentUserId = $state<string | null>(null);

	onMount(() => {
		const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
			if (!user) {
				await goto(resolve('/login'));
				return;
			}

			currentUserId = user.uid;
		});

		return () => unsubscribeAuth();
	});

	// Re-run whenever the viewed user (page.params.id) or the signed-in user
	// changes — SvelteKit reuses this component instance across navigations
	// between /users/[id] routes, so without this effect the page kept
	// showing the previous user's data until a hard refresh.
	$effect(() => {
		const targetUserId = page.params.id;
		const uid = currentUserId;
		if (!uid || !targetUserId) return;

		let unsubscribeTarget = () => {};
		let unsubscribeActivity = () => {};
		let cancelled = false;

		(async () => {
			await loadUserPage(uid);
			if (cancelled) return;

			unsubscribeTarget = subscribeToUserChanges(targetUserId, () => void loadUserPage(uid, false));
			if (currentProfile?.accountType !== 'organization') {
				unsubscribeActivity = subscribeToUserActivityChanges(
					uid,
					() => void loadUserPage(uid, false)
				);
			}
		})();

		return () => {
			cancelled = true;
			unsubscribeTarget();
			unsubscribeActivity();
		};
	});
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-4 pb-28 sm:px-5 sm:py-8">
	<button
		type="button"
		onclick={() => goBack(resolve('/dashboard'))}
		class="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-slate-950 transition hover:bg-white/80 dark:text-slate-50 dark:hover:bg-slate-900"
		aria-label={i18n.t('back_aria')}
	>
		<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8">
			<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
		</svg>
	</button>

	{#if loading}
		<section class="mt-8 rounded-[2rem] bg-white p-6 shadow-sm dark:bg-slate-900">
			<p class="font-bold text-slate-500 dark:text-slate-400">{i18n.t('loading_user')}</p>
		</section>
	{:else if isPrivateProfile}
		<section class="mt-8 rounded-[2rem] bg-white p-6 text-center shadow-sm dark:bg-slate-900">
			<p class="text-3xl">🔒</p>
			<p class="mt-3 font-black text-slate-950 dark:text-slate-50">{i18n.t('private_profile_title')}</p>
			<p class="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
				{i18n.t('private_profile_message')}
			</p>
		</section>
	{:else if error && !targetProfile}
		<section class="mt-8 rounded-[2rem] bg-red-50 p-6 font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
			{error}
		</section>
	{:else if targetProfile}
		<section class="mt-3 min-w-0 overflow-visible sm:mt-5">
			<div class="flex min-w-0 items-start gap-4 sm:gap-6">
				<div class="shrink-0">
					<UserAvatar
						photoURL={targetProfile.photoURL}
						displayName={targetProfile.displayName}
						email={targetProfile.email}
						size="xl"
						plain
					/>
				</div>

				<div class="min-w-0 flex-1 pt-0.5 sm:pt-1">
					<div class="flex min-w-0 items-center gap-2">
						<h1 class="line-clamp-2 text-2xl font-black tracking-tight text-slate-950 dark:text-slate-50 sm:text-4xl">
							{targetProfile.displayName}
						</h1>
					</div>

					{#if targetProfile.rallyTag}
						<button
							type="button"
							onclick={copyRallyTag}
							class="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700 ring-1 ring-blue-100 transition hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-900/60 dark:hover:bg-blue-900/50 sm:text-sm"
							title={i18n.t('copy_rally_tag')}
						>
							<span class="truncate">@{targetProfile.rallyTag}</span>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
								<rect x="9" y="9" width="13" height="13" rx="2" />
								<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
							</svg>
						</button>
					{:else if targetProfile.email}
						<p class="mt-1 truncate text-xs font-black text-blue-600 dark:text-blue-300 sm:text-sm">
							{targetProfile.email}
						</p>
					{/if}

					{#if targetProfile.bio}
						<div class="mt-2 max-w-2xl">
							<p class="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
								{i18n.t('bio')}
							</p>
							<p class="mt-1 line-clamp-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300 sm:text-base">
								{targetProfile.bio}
							</p>
						</div>
					{/if}

					{#if targetProfile.city || targetProfile.country}
						<p class="mt-2 flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 sm:text-sm">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 21s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11Z" />
								<circle cx="12" cy="10" r="2.5" />
							</svg>
							<span class="truncate">{formatProfileLocation(targetProfile)}</span>
						</p>
					{/if}
				</div>
			</div>

			<div class="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
				{#if targetProfile.sports?.length}
					{#each visibleSports as sport}
						<span class="shrink-0 rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-900/60">
							{formatSport(sport)}
						</span>
					{/each}
					{#if targetProfile.sports.length > 3}
						<button
							type="button"
							onclick={() => (showAllSports = !showAllSports)}
							class="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-800 dark:hover:bg-slate-800"
						>
							{showAllSports ? i18n.t('show_less') : `+${targetProfile.sports.length - 3}`}
						</button>
					{/if}
				{:else}
					<span class="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">{i18n.t('no_sports_yet')}</span>
				{/if}
			</div>

			<div class="mt-4 grid grid-cols-3 divide-x divide-slate-200 rounded-[1.5rem] bg-slate-50 px-2 py-3 text-center dark:divide-slate-800 dark:bg-slate-950/60 sm:mt-5 sm:max-w-xl sm:px-4 sm:py-4">
				<div>
					<p class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl">{allHostedEvents.length}</p>
					<p class="text-[11px] font-bold leading-tight text-slate-500 dark:text-slate-400 sm:text-xs">{i18n.t('events_hosted')}</p>
				</div>
				<div>
					<p class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl">{allParticipatedEvents.length}</p>
					<p class="text-[11px] font-bold leading-tight text-slate-500 dark:text-slate-400 sm:text-xs">{i18n.t('events_joined')}</p>
				</div>
				<div>
					<p class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl">{targetProfile.rallyPointsTotal ?? 0}</p>
					<p class="text-[11px] font-bold leading-tight text-slate-500 dark:text-slate-400 sm:text-xs">{i18n.t('points_label')}</p>
				</div>
			</div>

			<div class="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:flex sm:flex-wrap">
				{#if isOrganizationViewer}
					<span class="col-span-2 rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400 sm:col-span-1">
						{i18n.t('personal_profile')}
					</span>

					<button
						type="button"
						onclick={handleMessage}
						disabled={actionLoading}
						class="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60 sm:col-span-1"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
						</svg>
						{actionLoading ? i18n.t('opening') : i18n.t('message')}
					</button>
				{:else if relationship === 'request_sent'}
					<button
						type="button"
						disabled
						class="col-span-2 rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400 sm:col-span-1"
					>
						{i18n.t('request_sent')}
					</button>
				{:else if relationship === 'request_received'}
					<a
						href={resolve('/messages')}
						class="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 sm:col-span-1"
					>
						{i18n.t('respond_request')}
					</a>
				{:else if relationship === 'friends'}
					<button
						type="button"
						onclick={handleMessage}
						disabled={actionLoading}
						class="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
						</svg>
						{actionLoading ? i18n.t('opening') : i18n.t('message')}
					</button>

					<button
						type="button"
						onclick={handleRemoveFriend}
						disabled={actionLoading}
						class="rounded-2xl bg-slate-50 px-5 py-3 text-sm font-black text-slate-600 ring-1 ring-slate-200 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-red-950/40 dark:hover:text-red-300"
					>
						{i18n.t('remove_friend')}
					</button>
				{:else}
					<button
						type="button"
						onclick={handleAddFriend}
						disabled={actionLoading}
						class="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60 sm:col-span-1"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
							<circle cx="9" cy="7" r="4" />
							<path stroke-linecap="round" d="M19 8v6M22 11h-6" />
						</svg>
						{actionLoading ? i18n.t('sending') : i18n.t('add_friend')}
					</button>
				{/if}
			</div>
		</section>

		<div class="mt-5 min-w-0 max-w-full">
			<section class="min-w-0 max-w-full space-y-5 overflow-visible">
				{#if mutualFriends.length > 0}
					<section class="rounded-[2rem] bg-white p-4 shadow-sm shadow-slate-200/70 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800 sm:p-5">
						<div class="flex items-center justify-between gap-3">
							<h2 class="text-lg font-black text-slate-950 dark:text-slate-50">{i18n.t('mutual_friends')}</h2>
							<span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">
								{mutualFriends.length}
							</span>
						</div>

						<div class="mt-4 flex items-center gap-3">
							<div class="flex -space-x-3">
								{#each mutualFriends.slice(0, 4) as friend (friend.id)}
									<a href={resolve(`/users/${friend.id}`)} class="block transition hover:-translate-y-0.5" aria-label={i18n.t('view_profile_aria', { name: friend.displayName })}>
										<UserAvatar
											photoURL={friend.photoURL}
											displayName={friend.displayName}
											email={friend.email}
											size="lg"
										/>
									</a>
								{/each}
								{#if mutualFriends.length > 4}
									<span class="grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-sm font-black text-blue-600 ring-2 ring-white dark:bg-slate-800 dark:text-blue-300 dark:ring-slate-900">
										+{mutualFriends.length - 4}
									</span>
								{/if}
							</div>

							<p class="min-w-0 text-sm font-bold text-slate-500 dark:text-slate-400">
								{i18n.t('mutual_friends_summary', { name: targetProfile.displayName, count: mutualFriends.length, friends: i18n.t(mutualFriends.length === 1 ? 'mutual_friend' : 'mutual_friends_plural') })}
							</p>
						</div>
					</section>
				{/if}

				{#if liveProfileEvents.length > 0}
					<section>
						<div class="mb-3">
							<p class="text-xs font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">{i18n.t('live_and_soon')}</p>
							<h2 class="mt-1 text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl">{i18n.t('happening_around_you')}</h2>
						</div>
						<div class="-mx-1 space-y-3 px-1">
							{#each liveProfileEvents.slice(0, 2) as event (event.id)}
								<PublicProfileEventCard {event} />
							{/each}
						</div>
					</section>
				{/if}

				{#if upcomingProfileEvents.length > 0}
					<section>
						<div class="flex items-end justify-between gap-3">
							<div>
								<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl">{i18n.t('upcoming_events_profile')}</h2>
								<p class="text-sm font-bold text-slate-500 dark:text-slate-400">{i18n.t('upcoming_events_profile_sub')}</p>
							</div>
							{#if allUpcomingProfileEvents.length > 3}
								<button
									type="button"
									onclick={() => (showAllUpcomingEvents = !showAllUpcomingEvents)}
									class="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-black text-blue-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-blue-50 dark:bg-slate-950 dark:text-blue-300 dark:ring-slate-800 dark:hover:bg-blue-950/40"
								>
									{showAllUpcomingEvents ? i18n.t('show_less') : `${i18n.t('view_all')} (${allUpcomingProfileEvents.length})`}
								</button>
							{/if}
						</div>

						<div class="-mx-1 mt-3 space-y-3 px-1">
							{#each upcomingProfileEvents as event (event.id)}
								<a
									href={resolve(`/events/${event.id}`)}
									class="group flex min-w-0 gap-3 overflow-hidden rounded-[1.7rem] bg-white p-3 shadow-sm shadow-slate-200/70 ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-100 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800 dark:hover:shadow-none sm:gap-4 sm:p-4"
								>
									<div class="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800 sm:h-28 sm:w-36">
										<img
											src={getEventImage(event)}
											alt=""
											class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
											loading="lazy"
										/>
										<div class="absolute left-2 top-2 rounded-xl bg-blue-600 px-2 py-1 text-center text-white shadow-lg shadow-blue-950/20">
											<p class="text-[10px] font-black uppercase leading-none">{formatEventMonth(event)}</p>
											<p class="text-lg font-black leading-none">{formatEventDay(event)}</p>
										</div>
									</div>

									<div class="min-w-0 flex-1 py-0.5">
										<div class="flex min-w-0 items-center gap-2">
											<p class="truncate text-xs font-black uppercase tracking-wide text-blue-600 dark:text-blue-300">
												{formatSport(event.sport)}
											</p>
											{#if event.status}
												<span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black capitalize text-slate-500 dark:bg-slate-800 dark:text-slate-300">
													{i18n.t('status_' + event.status)}
												</span>
											{/if}
										</div>

										<h3 class="mt-1 line-clamp-1 text-lg font-black text-slate-950 dark:text-slate-50 sm:text-xl">
											{event.title}
										</h3>
										<p class="mt-1 line-clamp-1 text-xs font-bold text-slate-500 dark:text-slate-400 sm:text-sm">
											📅 {formatEventSchedule(event)}
										</p>
										<p class="mt-1 line-clamp-1 text-xs font-bold text-slate-500 dark:text-slate-400 sm:text-sm">
											📍 {getEventLocation(event)}
										</p>

										<div class="mt-3 flex min-w-0 items-center gap-2 text-xs font-black">
											<span class="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
												{formatProfileEventCapacity(event)}
											</span>
											<span class="min-w-0 truncate rounded-full bg-slate-100 px-3 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
												{formatProfileEventPrice(event)}
											</span>
										</div>
									</div>

									<div class="hidden shrink-0 place-items-center text-slate-300 transition group-hover:text-blue-600 sm:grid">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
											<path stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6" />
										</svg>
									</div>
								</a>
							{/each}
						</div>
					</section>
				{/if}

				{#if recentProfileEvents.length > 0}
					<section>
						<div class="flex items-center justify-between gap-3">
							<div>
								<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl">{i18n.t('recent_activity')}</h2>
								<p class="text-sm font-bold text-slate-500 dark:text-slate-400">{i18n.t('recent_activity_sub')}</p>
							</div>
							{#if allRecentProfileEvents.length > 3}
								<button
									type="button"
									onclick={() => (showAllRecentEvents = !showAllRecentEvents)}
									class="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-black text-blue-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-blue-50 dark:bg-slate-950 dark:text-blue-300 dark:ring-slate-800 dark:hover:bg-blue-950/40"
								>
									{showAllRecentEvents ? i18n.t('show_less') : `${i18n.t('view_all')} (${allRecentProfileEvents.length})`}
								</button>
							{/if}
						</div>

						<div class="-mx-1 mt-3 space-y-3 px-1">
							{#each recentProfileEvents as event (event.id)}
								<a
									href={resolve(`/events/${event.id}`)}
									class="group flex items-center gap-3 rounded-[1.5rem] bg-white p-3 shadow-sm shadow-slate-200/70 ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-100 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800"
								>
									<img
										src={getEventImage(event)}
										alt=""
										class="h-14 w-14 shrink-0 rounded-2xl object-cover"
										loading="lazy"
									/>
									<div class="min-w-0 flex-1">
										<p class="line-clamp-1 text-sm font-bold text-slate-500 dark:text-slate-400">
											{targetProfile.displayName} {getRecentActivityText(event)}
										</p>
										<h3 class="line-clamp-1 text-base font-black text-slate-950 dark:text-slate-50">
											{event.title}
										</h3>
										<p class="mt-0.5 line-clamp-1 text-xs font-bold text-slate-500 dark:text-slate-400">
											{formatEventSchedule(event)}
										</p>
									</div>
								</a>
							{/each}
						</div>
					</section>
				{/if}

				{#if upcomingProfileEvents.length === 0 && recentProfileEvents.length === 0}
					<section class="rounded-[2rem] bg-white p-8 text-center shadow-sm dark:bg-slate-900">
						<p class="text-4xl">🏟️</p>
						<p class="mt-3 font-black text-slate-950 dark:text-slate-50">{i18n.t('no_public_events')}</p>
						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{i18n.t('no_public_events_sub')}</p>
					</section>
				{/if}
			</section>
		</div>

		{#if error}
			<p class="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>
		{/if}

		{#if success}
			<p class="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{success}</p>
		{/if}

		{#if showRemoveConfirmModal && targetProfile}
			<dialog
				open
				class="fixed inset-0 z-[120] m-0 flex h-full w-full max-w-none items-end justify-center border-0 bg-slate-950/60 px-0 backdrop-blur-sm sm:items-center sm:px-5"
				onclick={(event) => {
					if (event.target === event.currentTarget) showRemoveConfirmModal = false;
				}}
				aria-labelledby="confirm-remove-title"
			>
				<div
					class="max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-[2rem] bg-white p-6 text-center shadow-2xl dark:bg-slate-900 sm:rounded-[2rem] sm:p-8"
				>
					<div class="flex flex-col items-center">
						<div class="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-7 w-7">
								<path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
							</svg>
						</div>

						<h2 id="confirm-remove-title" class="mt-4 text-xl font-black text-slate-950 dark:text-slate-50">
							{i18n.t('remove_friend_title')}
						</h2>
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
							{i18n.t('remove_friend_message', { name: targetProfile.displayName })}
						</p>

						<div class="mt-6 flex w-full flex-col gap-2 sm:flex-row">
							<button
								type="button"
								onclick={executeRemoveFriend}
								class="w-full rounded-2xl bg-red-600 py-3 font-bold text-white transition hover:bg-red-700 active:scale-95"
							>
								{i18n.t('remove')}
							</button>
							<button
								type="button"
								onclick={() => (showRemoveConfirmModal = false)}
								class="w-full rounded-2xl bg-slate-100 py-3 font-bold text-slate-700 transition hover:bg-slate-200 active:scale-95 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
							>
								{i18n.t('cancel')}
							</button>
						</div>
					</div>
				</div>
			</dialog>
		{/if}
	{/if}
</main>
