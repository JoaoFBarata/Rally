<!--src/routes/users/[id]/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth } from '$lib/firebase';
	import type { Sport, UserProfile } from '$lib/schema';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import RallyWordmark from '$lib/components/RallyWordmark.svelte';
	import { getUserProfile } from '$lib/services/user.service';
	import {
		getFriendsForUser,
		getRelationshipStatus,
		sendFriendRequestByTag,
		type RelationshipStatus
	} from '$lib/services/social.service';
	import { getOrCreateDirectConversation } from '$lib/services/chat.service';

	let targetProfile = $state<UserProfile | null>(null);
	let currentProfile = $state<UserProfile | null>(null);
	let relationship = $state<RelationshipStatus>('none');

	let friendsCount = $state(0);
	let loading = $state(true);
	let actionLoading = $state(false);
	let error = $state('');
	let success = $state('');

	let commonSports = $derived.by(() => {
		if (!targetProfile || !currentProfile) return [];

		const currentSports = new Set(currentProfile.sports ?? []);

		return (targetProfile.sports ?? []).filter((sport) => currentSports.has(sport));
	});

	function formatSport(sport: Sport) {
		return sport.charAt(0).toUpperCase() + sport.slice(1);
	}

	function formatLevel(level?: string | null) {
		if (!level) return 'Casual';

		return level.charAt(0).toUpperCase() + level.slice(1);
	}

	async function loadUserPage(currentUserId: string) {
		loading = true;
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

			if (loadedTargetProfile.accountType === 'organization' && loadedTargetProfile.activeOrganizationId) {
				await goto(resolve(`/organizations/${loadedTargetProfile.activeOrganizationId}`));
				return;
			}

			targetProfile = loadedTargetProfile;
			currentProfile = loadedCurrentProfile;

			const [targetFriends, loadedRelationship] = await Promise.all([
				getFriendsForUser(targetUserId),
				getRelationshipStatus({
					currentUserId,
					targetUserId
				})
			]);

			friendsCount = targetFriends.length;
			relationship = loadedRelationship;
		} catch (err) {
			console.error('Public user page error:', err);
			error = err instanceof Error ? err.message : 'Could not load user.';
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
			const conversationId = await getOrCreateDirectConversation(
				currentUser.uid,
				targetProfile.id
			);

			localStorage.setItem(`rally:last-read:${conversationId}`, String(Date.now()));
			await goto(resolve(`/messages/${conversationId}`));
		} catch (err) {
			console.error('Message user error:', err);
			error = err instanceof Error ? err.message : 'Could not open conversation.';
		} finally {
			actionLoading = false;
		}
	}

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, async (user) => {
			if (!user) {
				await goto(resolve('/login'));
				return;
			}

			await loadUserPage(user.uid);
		});

		return unsubscribe;
	});
</script>

<main class="mx-auto max-w-6xl px-5 py-8">
	<a
		href={resolve('/dashboard')}
		class="inline-flex rounded-full bg-blue-50 px-5 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
	>
		← Back
	</a>

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
		<div class="mt-8 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
			<section
				class="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<div class="h-32 bg-gradient-to-br from-blue-600 via-blue-500 to-sky-400"></div>

				<div class="-mt-14 px-7 pb-7">
					<div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
						<div class="flex flex-col items-start">
							<div class="rounded-full bg-white p-1 dark:bg-slate-900">
								<UserAvatar
									photoURL={targetProfile.photoURL}
									displayName={targetProfile.displayName}
									email={targetProfile.email}
									size="xl"
								/>
							</div>

							<h1 class="mt-4 text-4xl font-black tracking-tight text-slate-950 dark:text-slate-50">
								{targetProfile.displayName}
							</h1>

							<p class="mt-1 text-sm font-bold text-blue-600 dark:text-blue-400">
								@{targetProfile.rallyTag}
							</p>
						</div>

						<div class="flex flex-wrap gap-2">
							{#if relationship === 'friends'}
								<button
									type="button"
									onclick={handleMessage}
									disabled={actionLoading}
									class="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
								>
									{actionLoading ? 'Opening...' : 'Message'}
								</button>
							{:else if relationship === 'request_sent'}
								<button
									type="button"
									disabled
									class="rounded-2xl bg-slate-100 px-5 py-3 font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400"
								>
									Request sent
								</button>
							{:else if relationship === 'request_received'}
								<a
									href={resolve('/messages')}
									class="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
								>
									Respond request
								</a>
							{:else}
								<button
									type="button"
									onclick={handleAddFriend}
									disabled={actionLoading}
									class="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
								>
									{actionLoading ? 'Sending...' : 'Add friend'}
								</button>
							{/if}
						</div>
					</div>

					<div class="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                            <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                                Level
                            </p>
                            <p class="mt-2 font-black text-slate-950 dark:text-slate-50">
                                {formatLevel(targetProfile.level)}
                            </p>
                        </div>

                        <div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                            <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                                Age
                            </p>
                            <p class="mt-2 font-black text-slate-950 dark:text-slate-50">
                                {targetProfile.age !== null && targetProfile.age !== undefined
                                    ? `${targetProfile.age} years`
                                    : 'Not set'}
                            </p>
                        </div>

                        <div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                            <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                                City
                            </p>
                            <p class="mt-2 font-black text-slate-950 dark:text-slate-50">
                                {targetProfile.city || 'Not set'}
                            </p>
                        </div>

                        <div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                            <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                                Friends
                            </p>
                            <p class="mt-2 font-black text-slate-950 dark:text-slate-50">
                                {friendsCount}
                            </p>
                        </div>
                    </div>

					{#if targetProfile.bio}
						<div class="mt-7">
							<h2 class="text-lg font-black text-slate-950 dark:text-slate-50">
								Bio
							</h2>
							<p class="mt-2 leading-relaxed text-slate-600 dark:text-slate-300">
								{targetProfile.bio}
							</p>
						</div>
					{/if}

					<div class="mt-7">
						<h2 class="text-lg font-black text-slate-950 dark:text-slate-50">
							Sports
						</h2>

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
							<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
								No sports added yet.
							</p>
						{/if}
					</div>
				</div>
			</section>

			<aside class="space-y-6">
				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<RallyWordmark size="sm" />

					<h2 class="mt-6 text-xl font-black text-slate-950 dark:text-slate-50">
						Connection
					</h2>

					{#if relationship === 'friends'}
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
							You are already friends on Rally.
						</p>
					{:else if relationship === 'request_sent'}
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
							Your friend request is waiting for a response.
						</p>
					{:else if relationship === 'request_received'}
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
							This user has already sent you a friend request.
						</p>
					{:else}
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
							Add this user as a friend to start messaging and joining events together.
						</p>
					{/if}

					{#if success}
						<div
							class="mt-5 rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-700 dark:bg-green-950 dark:text-green-300"
						>
							{success}
						</div>
					{/if}

					{#if error}
						<div
							class="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
						>
							{error}
						</div>
					{/if}
				</section>

				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">
						In common
					</h2>

					{#if commonSports.length}
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
							You both like:
						</p>

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
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
							No sports in common yet.
						</p>
					{/if}
				</section>
			</aside>
		</div>
	{/if}
</main>