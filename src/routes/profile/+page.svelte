<!-- src/routes/profile/+page.svelte-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth } from '$lib/firebase';
	import { signOut } from 'firebase/auth';
	import type { Sport, SportLevel, UserProfile } from '$lib/schema';
	import {
		ensureUserProfile,
		updateUserProfileDetails
	} from '$lib/services/user.service';
	import {
		getFriendsForUser,
		sendFriendRequestByTag
	} from '$lib/services/social.service';

	const availableSports: Sport[] = [
		'football',
		'padel',
		'basketball',
		'running',
		'gym',
		'tennis',
		'cycling',
		'volleyball',
		'other'
	];

	let profile = $state<UserProfile | null>(null);
	let friends = $state<UserProfile[]>([]);

	let displayName = $state('');
	let bio = $state('');
	let city = $state('');
	let level = $state<SportLevel>('casual');
	let sports = $state<Sport[]>([]);

	let friendTag = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let logoutLoading = $state(false);
	let friendLoading = $state(false);
	let error = $state('');
	let success = $state('');

	async function loadProfile() {
		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto('/login');
			return;
		}

		loading = true;
		error = '';

		try {
			profile = await ensureUserProfile(currentUser);

			displayName = profile.displayName ?? '';
			bio = profile.bio ?? '';
			city = profile.city ?? '';
			level = profile.level ?? 'casual';
			sports = profile.sports ?? [];

			friends = await getFriendsForUser(currentUser.uid);
		} catch (err) {
			console.error('Profile load error:', err);
			error = err instanceof Error ? err.message : 'Could not load profile.';
		} finally {
			loading = false;
		}
	}

	function toggleSport(sport: Sport) {
		if (sports.includes(sport)) {
			sports = sports.filter((item) => item !== sport);
		} else {
			sports = [...sports, sport];
		}
	}

	async function handleSaveProfile() {
		const currentUser = auth.currentUser;

		if (!currentUser) return;

		saving = true;
		error = '';
		success = '';

		try {
			await updateUserProfileDetails(currentUser.uid, {
				displayName,
				bio,
				city,
				level,
				sports
			});

			success = 'Profile updated.';
			await loadProfile();
		} catch (err) {
			console.error('Save profile error:', err);
			error = err instanceof Error ? err.message : 'Could not update profile.';
		} finally {
			saving = false;
		}
	}

	async function handleAddFriend() {
		const currentUser = auth.currentUser;

		if (!currentUser) return;

		friendLoading = true;
		error = '';
		success = '';

		try {
			const target = await sendFriendRequestByTag({
				fromUserId: currentUser.uid,
				rallyTag: friendTag
			});

			success = `Friend request sent to ${target.displayName}.`;
			friendTag = '';
		} catch (err) {
			console.error('Friend request error:', err);
			error = err instanceof Error ? err.message : 'Could not send friend request.';
		} finally {
			friendLoading = false;
		}
	}

	async function copyTag() {
		if (!profile?.rallyTag) return;

		await navigator.clipboard.writeText(profile.rallyTag);
		success = 'Rally tag copied.';
	}

	async function handleLogout() {
		logoutLoading = true;

		try {
			await signOut(auth);
			await goto('/');
		} finally {
			logoutLoading = false;
		}
	}

	$effect(() => {
		loadProfile();
	});
</script>

<main class="mx-auto max-w-6xl px-5 py-6">
	<header class="mb-6">
		<p class="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">Rally</p>
		<h1 class="mt-2 text-3xl font-bold">Profile</h1>
		<p class="mt-1 text-slate-500">Manage your sports identity, friends and account.</p>
	</header>

	{#if loading}
		<div class="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
			Loading profile...
		</div>
	{:else if profile}
		{#if error}
			<div class="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
				{error}
			</div>
		{/if}

		{#if success}
			<div class="mb-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
				{success}
			</div>
		{/if}

		<div class="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
			<section class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
				<div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex items-center gap-4">
						<div class="flex h-20 w-20 items-center justify-center rounded-full bg-blue-600 text-3xl font-black uppercase text-white">
							{profile.displayName?.[0] ?? profile.email?.[0] ?? 'R'}
						</div>

						<div>
							<h2 class="text-2xl font-black text-slate-950">{profile.displayName}</h2>
							<p class="text-slate-500">{profile.email}</p>

							<button
								onclick={copyTag}
								class="mt-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
							>
								@{profile.rallyTag ?? 'creating-tag'} · copy
							</button>
						</div>
					</div>

					<div class="rounded-3xl bg-slate-50 p-4 text-center">
						<p class="text-3xl font-black text-blue-600">{friends.length}</p>
						<p class="text-sm font-semibold text-slate-500">friends</p>
					</div>
				</div>

				<div class="mt-8 grid gap-5">
					<div>
						<label for="name" class="text-sm font-bold text-slate-700">Name</label>
						<input
							id="name"
							bind:value={displayName}
							class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label for="city" class="text-sm font-bold text-slate-700">City</label>
						<input
							id="city"
							bind:value={city}
							placeholder="Lisbon, Portugal"
							class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label for="bio" class="text-sm font-bold text-slate-700">Bio</label>
						<textarea
							id="bio"
							bind:value={bio}
							rows="4"
							placeholder="Tell people what sports you like and when you usually play."
							class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500"
						></textarea>
					</div>

					<div>
						<label for="level" class="text-sm font-bold text-slate-700">Level</label>
						<select
							id="level"
							bind:value={level}
							class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500"
						>
							<option value="beginner">Beginner</option>
							<option value="casual">Casual</option>
							<option value="intermediate">Intermediate</option>
							<option value="advanced">Advanced</option>
						</select>
					</div>

					<div>
						<p class="text-sm font-bold text-slate-700">Sports</p>

						<div class="mt-3 flex flex-wrap gap-2">
							{#each availableSports as sport}
								<button
									type="button"
									onclick={() => toggleSport(sport)}
									class={`rounded-full px-4 py-2 text-sm font-bold transition ${
										sports.includes(sport)
											? 'bg-blue-600 text-white'
											: 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700'
									}`}
								>
									{sport}
								</button>
							{/each}
						</div>
					</div>

					<button
						onclick={handleSaveProfile}
						disabled={saving}
						class="rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
					>
						{saving ? 'Saving...' : 'Save profile'}
					</button>
				</div>
			</section>

			<aside class="space-y-6">
				<section class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
					<h2 class="text-xl font-black text-slate-950">Add friend</h2>
					<p class="mt-1 text-sm text-slate-500">
						Use the public Rally tag, not the Firebase ID.
					</p>

					<div class="mt-5 flex gap-2">
						<input
							bind:value={friendTag}
							placeholder="example: joao-8f3a1"
							class="min-w-0 flex-1 rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500"
						/>

						<button
							onclick={handleAddFriend}
							disabled={friendLoading || !friendTag}
							class="rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
						>
							{friendLoading ? 'Sending...' : 'Add'}
						</button>
					</div>
				</section>

				<section class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
					<div class="flex items-center justify-between">
						<h2 class="text-xl font-black text-slate-950">Friends</h2>
						<span class="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
							{friends.length}
						</span>
					</div>

					{#if friends.length === 0}
						<div class="mt-5 rounded-3xl border border-dashed border-slate-300 p-6 text-center">
							<p class="text-3xl">👥</p>
							<p class="mt-2 font-bold text-slate-700">No friends yet</p>
							<p class="mt-1 text-sm text-slate-500">Add people using their Rally tag.</p>
						</div>
					{:else}
						<div class="mt-5 space-y-3">
							{#each friends as friend}
								<div class="flex items-center justify-between rounded-3xl bg-slate-50 p-4">
									<div class="flex items-center gap-3">
										<div class="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 font-bold uppercase text-white">
											{friend.displayName?.[0] ?? 'R'}
										</div>

										<div>
											<p class="font-bold text-slate-950">{friend.displayName}</p>
											<p class="text-xs text-slate-500">@{friend.rallyTag}</p>
										</div>
									</div>

									<a
										href="/messages"
										class="rounded-full bg-white px-3 py-2 text-sm font-bold text-blue-600 shadow-sm"
									>
										Message
									</a>
								</div>
							{/each}
						</div>
					{/if}
				</section>

				<section class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
					<h2 class="text-xl font-black text-slate-950">Account</h2>
					<p class="mt-1 text-sm text-slate-500">Session and account actions.</p>

					<button
						onclick={handleLogout}
						disabled={logoutLoading}
						class="mt-5 w-full rounded-2xl bg-slate-950 px-5 py-3 font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
					>
						{logoutLoading ? 'Logging out...' : 'Log out'}
					</button>
				</section>
			</aside>
		</div>
	{/if}
</main>