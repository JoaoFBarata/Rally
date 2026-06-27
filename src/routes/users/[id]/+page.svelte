<!--src/routes/users/[id]/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import { auth } from '$lib/firebase';
	import type { Sport, SportEvent, UserProfile } from '$lib/schema';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import RallyWordmark from '$lib/components/RallyWordmark.svelte';
	import { getUserProfile } from '$lib/services/user.service';
	import {
		getRelationshipStatus,
		removeFriend,
		sendFriendRequestByTag,
		type RelationshipStatus
	} from '$lib/services/social.service';
	import { getOrCreateDirectConversation } from '$lib/services/chat.service';
	import { getEventsCreatedByUser, getEventsForUser } from '$lib/services/event.service';
	import { goBack } from '$lib/utils/navigation';
	import {
		subscribeToUserActivityChanges,
		subscribeToUserChanges
	} from '$lib/services/realtime.service';

	let targetProfile = $state<UserProfile | null>(null);
	let currentProfile = $state<UserProfile | null>(null);
	let relationship = $state<RelationshipStatus>('none');

	let hostedEvents = $state<SportEvent[]>([]);
	let participatedEvents = $state<SportEvent[]>([]);

	let loading = $state(true);
	let actionLoading = $state(false);
	let error = $state('');
	let success = $state('');
	let showRemoveConfirmModal = $state(false);
	let isOrganizationViewer = $derived(currentProfile?.accountType === 'organization');

	let commonSports = $derived.by(() => {
		if (!targetProfile || !currentProfile) return [];

		const currentSports = new Set(currentProfile.sports ?? []);

		return (targetProfile.sports ?? []).filter((sport) => currentSports.has(sport));
	});

	function formatSport(sport: Sport) {
		return sport.charAt(0).toUpperCase() + sport.slice(1);
	}


	function formatDate(dateValue: unknown) {
		try {
			const timestamp = dateValue as { toDate?: () => Date };
			if (!timestamp?.toDate) return 'Date not set';
			return timestamp.toDate().toLocaleString('en-GB', {
				day: '2-digit',
				month: 'short',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return 'Date not set';
		}
	}

	function formatShortDate(dateValue: unknown) {
		try {
			const timestamp = dateValue as { toDate?: () => Date };
			if (!timestamp?.toDate) return 'Soon';
			return timestamp.toDate().toLocaleDateString('en-GB', {
				day: '2-digit',
				month: 'short'
			});
		} catch {
			return 'Soon';
		}
	}

	function formatPrice(event: SportEvent) {
		if (event.entryFeeAmount && event.entryFeeAmount > 0) return `€${event.entryFeeAmount}`;
		if (event.pricePerPerson && event.pricePerPerson > 0) return `€${event.pricePerPerson}`;
		if (event.priceTotal && event.priceTotal > 0) return `€${event.priceTotal}`;
		return 'Free';
	}

	function formatCapacity(event: SportEvent) {
		if (event.eventKind === 'tournament') {
			return `${event.participantIds?.length ?? 0}/${event.maxTournamentEntries ?? event.maxParticipants} entries`;
		}
		return `${event.participantIds?.length ?? 0}/${event.maxParticipants} joined`;
	}

	function getStatusLabel(event: SportEvent) {
		if (event.status === 'cancelled') return 'Cancelled';
		if (event.status === 'finished') return 'Finished';
		if (event.eventKind === 'tournament') return 'Tournament';
		return isEventActive(event) ? 'Upcoming' : 'Past';
	}

	function getMiniMapUrl(event: SportEvent) {
		const lat = event.location?.lat;
		const lng = event.location?.lng;
		if (!PUBLIC_MAPBOX_ACCESS_TOKEN || typeof lat !== 'number' || typeof lng !== 'number') return '';
		const marker = `pin-s+2563eb(${lng},${lat})`;
		return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${marker}/${lng},${lat},13,0/144x104@2x?access_token=${PUBLIC_MAPBOX_ACCESS_TOKEN}`;
	}

	function getEventStartMs(event: SportEvent): number {
		const ts = event.startAt as unknown as { toMillis?: () => number; toDate?: () => Date };
		return ts?.toMillis?.() ?? ts?.toDate?.()?.getTime() ?? 0;
	}

	function isEventActive(event: SportEvent): boolean {
		if (event.status === 'cancelled' || event.status === 'finished') return false;
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

		try {
			const targetUserId = page.params.id;

			if (!targetUserId) {
				error = 'User not found.';
				return;
			}

			if (targetUserId === currentUserId) {
				await goto(resolve('/profile'));
				return;
			}

			const [loadedTargetProfile, loadedCurrentProfile] = await Promise.all([
				getUserProfile(targetUserId),
				getUserProfile(currentUserId)
			]);

			if (!loadedTargetProfile) {
				error = 'User not found.';
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

			const [allHosted, allParticipated, loadedRelationship] = await Promise.all([
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
						})
			]);

			hostedEvents = sortEventsByStatusThenDate(allHosted.filter((e) => e.visibility === 'public'));
			participatedEvents = sortEventsByStatusThenDate(
				allParticipated.filter((e) => e.visibility === 'public' && e.creatorId !== targetUserId)
			);
			relationship = loadedRelationship;
		} catch (err) {
			console.error('Public user page error:', err);
			error = 'Some profile information could not be loaded. Please try again.';
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
			success = `Friend request sent to ${targetProfile.displayName}.`;
		} catch (err) {
			console.error('Add friend from public profile error:', err);
			error = err instanceof Error ? err.message : 'Could not send friend request.';

			const updatedRelationship = await getRelationshipStatus({
				currentUserId: currentUser.uid,
				targetUserId: targetProfile.id
			});

			relationship = updatedRelationship;
		} finally {
			actionLoading = false;
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
			error = err instanceof Error ? err.message : 'Could not open conversation.';
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
			success = `${targetProfile.displayName} removed from your friends.`;
		} catch (err) {
			console.error('Remove friend from public profile error:', err);
			error = err instanceof Error ? err.message : 'Could not remove friend.';
		} finally {
			actionLoading = false;
		}
	}

	onMount(() => {
		let unsubscribeTarget = () => {};
		let unsubscribeActivity = () => {};
		const unsubscribe = onAuthStateChanged(auth, async (user) => {
			unsubscribeTarget();
			unsubscribeActivity();
			if (!user) {
				await goto(resolve('/login'));
				return;
			}

			await loadUserPage(user.uid);
			const targetUserId = page.params.id;
			if (targetUserId) {
				unsubscribeTarget = subscribeToUserChanges(
					targetUserId,
					() => void loadUserPage(user.uid, false)
				);
				if (currentProfile?.accountType !== 'organization') {
					unsubscribeActivity = subscribeToUserActivityChanges(
						user.uid,
						() => void loadUserPage(user.uid, false)
					);
				}
			}
		});

		return () => {
			unsubscribe();
			unsubscribeTarget();
			unsubscribeActivity();
		};
	});
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-5 pb-28 sm:px-5 sm:py-8">
	<button
		type="button"
		onclick={() => goBack(resolve('/dashboard'))}
		class="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
	>
		<span class="leading-none">←</span>
		<span>Back</span>
	</button>

	{#if loading}
		<section class="mt-8 rounded-[2rem] bg-white p-6 shadow-sm dark:bg-slate-900">
			<p class="font-bold text-slate-500 dark:text-slate-400">Loading user...</p>
		</section>
	{:else if error && !targetProfile}
		<section class="mt-8 rounded-[2rem] bg-red-50 p-6 font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
			{error}
		</section>
	{:else if targetProfile}
		<section class="mt-6 min-w-0 overflow-hidden">
			<div class="flex min-w-0 items-start gap-4 sm:gap-5">
				<div class="shrink-0 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
					<UserAvatar
						photoURL={targetProfile.photoURL}
						displayName={targetProfile.displayName}
						email={targetProfile.email}
						size="xl"
					/>
				</div>

				<div class="min-w-0 flex-1 pt-1">
					<div class="flex min-w-0 items-center gap-2">
						<h1 class="truncate text-2xl font-black tracking-tight text-slate-950 dark:text-slate-50 sm:text-4xl">
							{targetProfile.displayName}
						</h1>
						<span class="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-600 text-[11px] font-black text-white sm:h-6 sm:w-6">✓</span>
					</div>

					<p class="mt-1 truncate text-sm font-bold text-slate-500 dark:text-slate-400">
						{targetProfile.rallyTag ? `@${targetProfile.rallyTag}` : targetProfile.email}
					</p>
					<p class="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">
						{targetProfile.city || 'Rally player'}{#if targetProfile.country} · {targetProfile.country}{/if}
					</p>
				</div>
			</div>

			<div class="mt-5 flex flex-wrap gap-2">
				{#if targetProfile.sports?.length}
					{#each targetProfile.sports.slice(0, 4) as sport}
						<span class="rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800">
							{formatSport(sport)}
						</span>
					{/each}
					{#if targetProfile.sports.length > 4}
						<span class="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">+{targetProfile.sports.length - 4}</span>
					{/if}
				{:else}
					<span class="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">No sports yet</span>
				{/if}
			</div>

			<div class="mt-5 grid max-w-xl grid-cols-3 divide-x divide-slate-200 border-y border-slate-200 py-4 text-center dark:divide-slate-800 dark:border-slate-800">
				<div>
					<p class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl">{hostedEvents.length}</p>
					<p class="text-xs font-bold text-slate-500 dark:text-slate-400">Hosted</p>
				</div>
				<div>
					<p class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl">{participatedEvents.length}</p>
					<p class="text-xs font-bold text-slate-500 dark:text-slate-400">Joined</p>
				</div>
				<div>
					<p class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl">{targetProfile.rallyPointsTotal ?? 0}</p>
					<p class="text-xs font-bold text-slate-500 dark:text-slate-400">Points</p>
				</div>
			</div>

			{#if targetProfile.bio}
				<div class="mt-5 max-w-2xl">
					<h2 class="text-sm font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">About</h2>
					<p class="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
						{targetProfile.bio}
					</p>
				</div>
			{/if}

			<div class="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
				{#if isOrganizationViewer}
					<span class="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">
						Personal profile
					</span>

					<button
						type="button"
						onclick={handleMessage}
						disabled={actionLoading}
						class="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
					>
						{actionLoading ? 'Opening...' : 'Message'}
					</button>
				{:else if relationship === 'request_sent'}
					<button
						type="button"
						disabled
						class="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400"
					>
						Request Pending
					</button>
				{:else if relationship === 'request_received'}
					<a
						href={resolve('/messages')}
						class="rounded-2xl bg-slate-950 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
					>
						Respond request
					</a>
				{:else if relationship === 'friends'}
					<button
						type="button"
						onclick={handleMessage}
						disabled={actionLoading}
						class="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
					>
						{actionLoading ? 'Opening...' : 'Message'}
					</button>

					<button
						type="button"
						onclick={handleRemoveFriend}
						disabled={actionLoading}
						class="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-red-950/40 dark:hover:text-red-300"
					>
						Remove friend
					</button>
				{:else}
					<button
						type="button"
						onclick={handleAddFriend}
						disabled={actionLoading}
						class="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
					>
						{actionLoading ? 'Sending...' : 'Add friend'}
					</button>
				{/if}
			</div>
		</section>

		<div class="mt-6 grid min-w-0 max-w-full gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
			<section class="min-w-0 max-w-full space-y-5 overflow-hidden">
				{#if hostedEvents.length > 0}
					<section>
						<div class="flex items-end justify-between gap-3">
							<div>
								<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl">Hosted events</h2>
								<p class="text-sm font-bold text-slate-500 dark:text-slate-400">Public events created by {targetProfile.displayName}</p>
							</div>
						</div>

						<div class="mt-3 space-y-3">
							{#each hostedEvents as event (event.id)}
								<a href={resolve(`/events/${event.id}`)} class="group flex max-w-full gap-3 overflow-hidden rounded-[1.45rem] bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900 sm:p-4">
									<div class="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800 sm:h-24 sm:w-32">
										{#if getMiniMapUrl(event)}
											<img src={getMiniMapUrl(event)} alt={event.location.name} class="h-full w-full object-cover" />
										{:else if event.groupPhotoURL}
											<img src={event.groupPhotoURL} alt={event.title} class="h-full w-full object-cover" />
										{:else}
											<div class="grid h-full w-full place-items-center text-2xl font-black text-blue-600 dark:text-blue-300">{event.title.charAt(0).toUpperCase()}</div>
										{/if}
										<span class="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-slate-700 shadow-sm dark:bg-slate-950/90 dark:text-slate-200">{formatShortDate(event.startAt)}</span>
									</div>

									<div class="min-w-0 flex-1 py-1">
										<div class="flex min-w-0 items-center gap-2">
											<p class="min-w-0 flex-1 truncate text-sm font-black text-slate-950 dark:text-slate-50 sm:text-base">{event.title}</p>
											<span class="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">{getStatusLabel(event)}</span>
										</div>
										<p class="mt-1 truncate text-xs font-bold text-slate-500 dark:text-slate-400">{formatSport(event.sport)} · {event.location.name}</p>
										<p class="mt-2 truncate text-xs font-black text-slate-400 dark:text-slate-500">{formatDate(event.startAt)} · {formatCapacity(event)} · {formatPrice(event)}</p>
									</div>
								</a>
							{/each}
						</div>
					</section>
				{/if}

				{#if participatedEvents.length > 0}
					<section>
						<div>
							<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl">Joined events</h2>
							<p class="text-sm font-bold text-slate-500 dark:text-slate-400">Public events this player joined</p>
						</div>

						<div class="mt-3 space-y-3">
							{#each participatedEvents as event (event.id)}
								<a href={resolve(`/events/${event.id}`)} class="group flex max-w-full gap-3 overflow-hidden rounded-[1.45rem] bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900 sm:p-4">
									<div class="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800 sm:h-24 sm:w-32">
										{#if getMiniMapUrl(event)}
											<img src={getMiniMapUrl(event)} alt={event.location.name} class="h-full w-full object-cover" />
										{:else if event.groupPhotoURL}
											<img src={event.groupPhotoURL} alt={event.title} class="h-full w-full object-cover" />
										{:else}
											<div class="grid h-full w-full place-items-center text-2xl font-black text-blue-600 dark:text-blue-300">{event.title.charAt(0).toUpperCase()}</div>
										{/if}
										<span class="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-slate-700 shadow-sm dark:bg-slate-950/90 dark:text-slate-200">{formatShortDate(event.startAt)}</span>
									</div>

									<div class="min-w-0 flex-1 py-1">
										<div class="flex min-w-0 items-center gap-2">
											<p class="min-w-0 flex-1 truncate text-sm font-black text-slate-950 dark:text-slate-50 sm:text-base">{event.title}</p>
											<span class="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{getStatusLabel(event)}</span>
										</div>
										<p class="mt-1 truncate text-xs font-bold text-slate-500 dark:text-slate-400">{formatSport(event.sport)} · {event.location.name}</p>
										<p class="mt-2 truncate text-xs font-black text-slate-400 dark:text-slate-500">{formatDate(event.startAt)} · {formatCapacity(event)} · {formatPrice(event)}</p>
									</div>
								</a>
							{/each}
						</div>
					</section>
				{/if}

				{#if hostedEvents.length === 0 && participatedEvents.length === 0}
					<section class="rounded-[2rem] bg-white p-8 text-center shadow-sm dark:bg-slate-900">
						<p class="text-4xl">🏟️</p>
						<p class="mt-3 font-black text-slate-950 dark:text-slate-50">No public events yet</p>
						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Events from this player will appear here when public.</p>
					</section>
				{/if}
			</section>

			<aside class="min-w-0 max-w-full space-y-4 overflow-hidden">
				<section class="rounded-[1.7rem] bg-white p-4 shadow-sm dark:bg-slate-900">
					<h2 class="font-black text-slate-950 dark:text-slate-50">In common</h2>

					{#if commonSports.length}
						<p class="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">Sports you both like</p>
						<div class="mt-3 flex flex-wrap gap-2">
							{#each commonSports as sport}
								<span class="rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">
									{formatSport(sport)}
								</span>
							{/each}
						</div>
					{:else}
						<p class="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">No sports in common yet.</p>
					{/if}
				</section>

				<section class="rounded-[1.7rem] bg-white p-4 shadow-sm dark:bg-slate-900">
					<h2 class="font-black text-slate-950 dark:text-slate-50">Player info</h2>
					<div class="mt-3 space-y-3 text-sm font-bold text-slate-500 dark:text-slate-400">
						<p>Age · {targetProfile.age !== null && targetProfile.age !== undefined ? `${targetProfile.age} years` : 'Not set'}</p>
						<p>City · {targetProfile.city || 'Not set'}</p>
						<p>Sports · {targetProfile.sports?.length ?? 0}</p>
					</div>
				</section>
			</aside>
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
							Remove friend?
						</h2>
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
							Are you sure you want to remove <span class="font-bold text-slate-800 dark:text-slate-200">{targetProfile.displayName}</span> from your friends?
						</p>

						<div class="mt-6 flex w-full flex-col gap-2 sm:flex-row">
							<button
								type="button"
								onclick={executeRemoveFriend}
								class="w-full rounded-2xl bg-red-600 py-3 font-bold text-white transition hover:bg-red-700 active:scale-95"
							>
								Remove
							</button>
							<button
								type="button"
								onclick={() => (showRemoveConfirmModal = false)}
								class="w-full rounded-2xl bg-slate-100 py-3 font-bold text-slate-700 transition hover:bg-slate-200 active:scale-95 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
							>
								Cancel
							</button>
						</div>
					</div>
				</div>
			</dialog>
		{/if}
	{/if}
</main>
