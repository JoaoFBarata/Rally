<!--src/routes/users/[id]/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
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
	import EventCard from '$lib/components/EventCard.svelte';
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

			const [loadedTargetProfile, loadedCurrentProfile, allHosted, allParticipated] =
				await Promise.all([
					getUserProfile(targetUserId),
					getUserProfile(currentUserId),
					getEventsCreatedByUser(targetUserId),
					getEventsForUser(targetUserId)
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

			hostedEvents = sortEventsByStatusThenDate(allHosted.filter((e) => e.visibility === 'public'));
			participatedEvents = sortEventsByStatusThenDate(
				allParticipated.filter((e) => e.visibility === 'public' && e.creatorId !== targetUserId)
			);

			if (loadedCurrentProfile?.accountType === 'organization') {
				relationship = 'none';
				return;
			}

			relationship = await getRelationshipStatus({
				currentUserId,
				targetUserId
			});
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

<main class="mx-auto max-w-6xl px-5 py-8">
	<button
		type="button"
		onclick={() => goBack(resolve('/dashboard'))}
		class="inline-flex rounded-full bg-blue-50 px-5 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
	>
		← Back
	</button>

	{#if loading}
		<section
			class="mt-8 rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
		>
			<p class="text-slate-500 dark:text-slate-400">Loading user...</p>
		</section>
	{:else if error && !targetProfile}
		<section
			class="mt-8 rounded-4xl border border-red-200 bg-red-50 p-8 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
		>
			{error}
		</section>
	{:else if targetProfile}
		<div class="mt-6 grid min-w-0 gap-4 sm:mt-8 lg:grid-cols-[1.25fr_0.75fr] lg:gap-6">
			<section
				class="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<div class="h-24 bg-gradient-to-br from-blue-600 via-blue-500 to-sky-400 sm:h-32"></div>

				<div class="-mt-14 px-4 pb-5 sm:px-7 sm:pb-7">
					<div class="flex items-end justify-between gap-3 sm:gap-5">
						<div class="flex flex-col items-start">
							<div class="rounded-full bg-white p-1 dark:bg-slate-900">
								<UserAvatar
									photoURL={targetProfile.photoURL}
									displayName={targetProfile.displayName}
									email={targetProfile.email}
									size="xl"
								/>
							</div>

							<h1
								class="mt-3 max-w-[11rem] truncate text-2xl font-black tracking-tight text-slate-950 dark:text-slate-50 sm:mt-4 sm:max-w-none sm:text-4xl"
							>
								{targetProfile.displayName}
							</h1>

							<p class="mt-1 text-sm font-bold text-blue-600 dark:text-blue-400">
								@{targetProfile.rallyTag}
							</p>
						</div>

						<div class="flex min-w-0 max-w-[11rem] flex-wrap justify-end gap-1.5 sm:max-w-none sm:shrink-0 sm:gap-2">
							{#if isOrganizationViewer}
								<span
									class="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400"
								>
									Personal profile
								</span>

								<button
									type="button"
									onclick={handleMessage}
									disabled={actionLoading}
									class="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base"
								>
									{actionLoading ? 'Opening...' : 'Message'}
								</button>
							{:else if relationship === 'request_sent'}
								<button
									type="button"
									disabled
									class="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base"
								>
									Request Pending
								</button>
							{:else if relationship === 'request_received'}
								<a
									href={resolve('/messages')}
									class="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base"
								>
									Respond request
								</a>
							{:else if relationship === 'friends'}
								<button
									type="button"
									onclick={handleMessage}
									disabled={actionLoading}
									class="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base"
								>
									{actionLoading ? 'Opening...' : 'Message'}
								</button>

								<button
									type="button"
									onclick={handleRemoveFriend}
									disabled={actionLoading}
									class="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-red-950/40 dark:hover:text-red-300 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base"
								>
									<span class="sm:hidden">Remove</span>
									<span class="hidden sm:inline">Remove friend</span>
								</button>
							{:else}
								<button
									type="button"
									onclick={handleAddFriend}
									disabled={actionLoading}
									class="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base"
								>
									{actionLoading ? 'Sending...' : 'Add friend'}
								</button>
							{/if}
						</div>
					</div>

					<div class="mt-5 grid grid-cols-2 gap-2 sm:mt-7 sm:gap-3 xl:grid-cols-3">
						<div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
							<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Age</p>
							<p class="mt-2 font-black text-slate-950 dark:text-slate-50">
								{targetProfile.age !== null && targetProfile.age !== undefined
									? `${targetProfile.age} years`
									: 'Not set'}
							</p>
						</div>

						<div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
							<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">City</p>
							<p class="mt-2 font-black text-slate-950 dark:text-slate-50">
								{targetProfile.city || 'Not set'}
							</p>
						</div>

						<div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
							<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Friends</p>
							<p class="mt-2 font-black text-slate-950 dark:text-slate-50">Private</p>
						</div>
					</div>

					{#if targetProfile.bio}
						<div class="mt-7">
							<h2 class="text-lg font-black text-slate-950 dark:text-slate-50">Bio</h2>
							<p class="mt-2 leading-relaxed text-slate-600 dark:text-slate-300">
								{targetProfile.bio}
							</p>
						</div>
					{/if}

					<div class="mt-7">
						<h2 class="text-lg font-black text-slate-950 dark:text-slate-50">Sports</h2>

						{#if targetProfile.sports?.length}
							<div class="mt-3 flex flex-wrap gap-2">
								{#each targetProfile.sports as sport}
									<span
										class="rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300"
									>
										{formatSport(sport)}
									</span>
								{/each}
							</div>
						{:else}
							<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">No sports added yet.</p>
						{/if}
					</div>
				</div>
			</section>

			<aside class="space-y-6">
				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">In common</h2>

					{#if commonSports.length}
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">You both like:</p>

						<div class="mt-4 flex flex-wrap gap-2">
							{#each commonSports as sport}
								<span
									class="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200"
								>
									{formatSport(sport)}
								</span>
							{/each}
						</div>
					{:else}
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">No sports in common yet.</p>
					{/if}
				</section>
			</aside>
		</div>

		{#if hostedEvents.length > 0}
			<section class="mt-4 sm:mt-6">
				<h2 class="mb-4 text-xl font-black text-slate-950 dark:text-slate-50">Hosted events</h2>

				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each hostedEvents as event}
						<EventCard {event} showImage={false} />
					{/each}
				</div>
			</section>
		{/if}

		{#if participatedEvents.length > 0}
			<section class="mt-4 sm:mt-6">
				<h2 class="mb-4 text-xl font-black text-slate-950 dark:text-slate-50">
					Events participated in
				</h2>

				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each participatedEvents as event}
						<EventCard {event} showImage={false} />
					{/each}
				</div>
			</section>
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
