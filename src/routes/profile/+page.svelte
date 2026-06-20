<!-- src/routes/profile/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { signOut } from 'firebase/auth';
	import type { Sport, SportLevel, UserProfile } from '$lib/schema';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import RallyWordmark from '$lib/components/RallyWordmark.svelte';
	import {
		ensureUserProfile,
		updateUserProfileDetails,
		updateUserProfilePhoto
	} from '$lib/services/user.service';
	import { getFriendsForUser, sendFriendRequestByTag } from '$lib/services/social.service';
	import { getOrCreateDirectConversation } from '$lib/services/chat.service';
	import { uploadUserProfilePhoto } from '$lib/services/storage.service';
  import QRCode from 'qrcode';
  import { browser } from '$app/environment';

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
	let age = $state<string | number>('');
	let sports = $state<Sport[]>([]);
	let level = $state<SportLevel>('casual');

	let friendTag = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let photoSaving = $state(false);
	let logoutLoading = $state(false);
	let friendLoading = $state(false);
	let editMode = $state(false);
	let error = $state('');
	let success = $state('');
  let qrCodeDataUrl = $state('');
  let qrCodeLink = $state('');
  let showQrModal = $state(false);
		
	function sortByDisplayName(a: UserProfile, b: UserProfile) {
		return (a.displayName ?? '').localeCompare(b.displayName ?? '', undefined, {
			sensitivity: 'base'
		});
	}

	function resetFormFromProfile(nextProfile: UserProfile) {
		displayName = nextProfile.displayName ?? '';
		bio = nextProfile.bio ?? '';
		city = nextProfile.city ?? '';
		age = nextProfile.age ? String(nextProfile.age) : '';
		sports = nextProfile.sports ?? [];
		level = nextProfile.level ?? 'casual';
	}

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
			resetFormFromProfile(profile);
      await generateProfileQrCode(profile.id);
      await handleQrFriendRequestFromUrl();

			const rawFriends = await getFriendsForUser(currentUser.uid);
			friends = rawFriends.sort(sortByDisplayName);
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

	function cancelEdit() {
		if (profile) {
			resetFormFromProfile(profile);
		}

		editMode = false;
		error = '';
		success = '';
	}

	async function handleSaveProfile() {
		const currentUser = auth.currentUser;

		if (!currentUser) return;

		const cleanAge = String(age ?? '').trim();
        const parsedAge = cleanAge === '' ? null : Number(cleanAge);

        if (
            parsedAge !== null &&
            (!Number.isInteger(parsedAge) || parsedAge < 13 || parsedAge > 100)
        ) {
            error = 'Please enter a valid age between 13 and 100.';
            return;
        }

		saving = true;
		error = '';
		success = '';

		try {
			await updateUserProfileDetails(currentUser.uid, {
				displayName,
				bio,
				city,
				age: parsedAge,
				level,
				sports
			});

			success = 'Profile updated.';
			editMode = false;
			await loadProfile();
		} catch (err) {
			console.error('Save profile error:', err);
			error = err instanceof Error ? err.message : 'Could not update profile.';
		} finally {
			saving = false;
		}
	}

	async function handleProfilePhotoFileChange(fileEvent: Event) {
		const currentUser = auth.currentUser;

		if (!currentUser) return;

		const input = fileEvent.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		photoSaving = true;
		error = '';
		success = '';

		try {
			const uploadedPhoto = await uploadUserProfilePhoto({
				userId: currentUser.uid,
				file
			});

			await updateUserProfilePhoto({
				userId: currentUser.uid,
				photoURL: uploadedPhoto.url,
				profilePhotoPath: uploadedPhoto.path
			});

			input.value = '';
			success = 'Profile photo updated.';
			await loadProfile();
		} catch (err) {
			console.error('Profile photo error:', err);
			error = err instanceof Error ? err.message : 'Could not update profile photo.';
		} finally {
			photoSaving = false;
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

	async function startConversation(friendId: string) {
		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto('/login');
			return;
		}

		error = '';

		try {
			const conversationId = await getOrCreateDirectConversation(currentUser.uid, friendId);
			localStorage.setItem(`rally:last-read:${conversationId}`, String(Date.now()));
			await goto(`/messages/${conversationId}`);
		} catch (err) {
			console.error('Start conversation error:', err);
			error = err instanceof Error ? err.message : 'Could not start conversation.';
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

    async function generateProfileQrCode(userId: string) {
        if (!browser || !profile?.rallyTag) return;

        const link = `${window.location.origin}/profile?addFriend=${encodeURIComponent(profile.rallyTag)}`;

        qrCodeLink = link;
        qrCodeDataUrl = await QRCode.toDataURL(link, {
            width: 320,
            margin: 1,
            color: {
                dark: '#020617',
                light: '#ffffff'
            }
        });
    }

    async function handleQrFriendRequestFromUrl() {
        const currentUser = auth.currentUser;

        if (!currentUser || !browser) return;

        const tagFromQr = page.url.searchParams.get('addFriend');

        if (!tagFromQr) return;

        try {
            const target = await sendFriendRequestByTag({
                fromUserId: currentUser.uid,
                rallyTag: tagFromQr
            });

            success = `Friend request sent to ${target.displayName}.`;
            await goto('/profile', { replaceState: true });
        } catch (err) {
            console.error('QR friend request error:', err);
            error = err instanceof Error ? err.message : 'Could not send friend request.';
            await goto('/profile', { replaceState: true });
        }
    }

	onMount(() => {
		loadProfile();
	});
</script>

<main class="mx-auto max-w-6xl px-5 py-6">
	<header class="mb-6">
		<RallyWordmark size="sm" />
		<h1 class="mt-2 text-3xl font-black text-slate-950 dark:text-slate-50">Profile</h1>
		<p class="mt-1 text-slate-500 dark:text-slate-400">
			Your Rally identity, sports profile and friends.
		</p>
	</header>

	{#if loading}
		<div
			class="rounded-4xl border border-slate-200 bg-white p-8 text-slate-950 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
		>
			Loading profile...
		</div>
	{:else if profile}
		{#if error}
			<div
				class="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
			>
				{error}
			</div>
		{/if}

		{#if success}
			<div
				class="mb-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-300"
			>
				{success}
			</div>
		{/if}

		<div class="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
			<section
				class="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
			>
				<div class="flex flex-col gap-5 sm:flex-row sm:items-start">
					<div class="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
						<div class="relative h-21 w-21 shrink-0">
							<UserAvatar
								photoURL={profile.photoURL ?? auth.currentUser?.photoURL ?? null}
								displayName={profile.displayName}
								email={profile.email}
								size="xl"
							/>

							<label
								title="Edit profile photo"
								class="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-blue-600 text-sm text-white shadow-lg transition hover:bg-blue-700"
							>
								{photoSaving ? '…' : '✎'}
								<input
									type="file"
									accept="image/*"
									class="hidden"
									onchange={handleProfilePhotoFileChange}
								/>
							</label>
						</div>

						<div class="min-w-0">
							<h2 class="break-words text-3xl font-black text-slate-950 dark:text-slate-50">
								{profile.displayName}
							</h2>

							<p class="truncate text-slate-500 dark:text-slate-400">
								{profile.email}
							</p>

							<button
								onclick={copyTag}
								class="mt-2 max-w-full truncate rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
							>
								@{profile.rallyTag ?? 'creating-tag'} · copy
							</button>
						</div>
					</div>

					<div class="flex gap-2">
						{#if editMode}
							<button
								type="button"
								onclick={cancelEdit}
								class="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
							>
								Cancel
							</button>
						{:else}
							<button
								type="button"
								onclick={() => (editMode = true)}
								class="rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
							>
								Edit profile
							</button>
						{/if}
					</div>
				</div>

				{#if editMode}
					<div class="mt-8 grid gap-5">
						<div>
							<label for="name" class="text-sm font-bold text-slate-700 dark:text-slate-300">
								Name
							</label>
							<input
								id="name"
								bind:value={displayName}
								class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							/>
						</div>

						<div class="grid gap-5 md:grid-cols-2">
							<div>
								<label for="city" class="text-sm font-bold text-slate-700 dark:text-slate-300">
									City
								</label>
								<input
									id="city"
									bind:value={city}
									placeholder="Lisbon, Portugal"
									class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500"
								/>
							</div>

							<div>
								<label for="age" class="text-sm font-bold text-slate-700 dark:text-slate-300">
									Age
								</label>
								<input
									id="age"
									type="number"
									min="13"
									max="100"
									bind:value={age}
									placeholder="21"
									class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500"
								/>
							</div>
						</div>

						<div>
							<label for="bio" class="text-sm font-bold text-slate-700 dark:text-slate-300">
								Bio
							</label>
							<textarea
								id="bio"
								bind:value={bio}
								rows="4"
								placeholder="Tell people what sports you like and when you usually play."
								class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500"
							></textarea>
						</div>

						<div>
							<p class="text-sm font-bold text-slate-700 dark:text-slate-300">Sports</p>

							<div class="mt-3 flex flex-wrap gap-2">
								{#each availableSports as sport (sport)}
									<button
										type="button"
										onclick={() => toggleSport(sport)}
										class={`rounded-full px-4 py-2 text-sm font-bold transition ${
											sports.includes(sport)
												? 'bg-blue-600 text-white'
												: 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-blue-950 dark:hover:text-blue-300'
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
							class="rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60 dark:shadow-blue-950/40"
						>
							{saving ? 'Saving...' : 'Save profile'}
						</button>
					</div>
				{:else}
					<div class="mt-8 grid gap-4 md:grid-cols-2">
						<div class="rounded-3xl bg-slate-50 p-5 dark:bg-slate-800">
							<p class="text-sm font-bold text-slate-500 dark:text-slate-400">Location</p>
							<p class="mt-2 font-black text-slate-950 dark:text-slate-50">
								{profile.city || 'Not added yet'}
							</p>
						</div>

						<div class="rounded-3xl bg-slate-50 p-5 dark:bg-slate-800">
							<p class="text-sm font-bold text-slate-500 dark:text-slate-400">Age</p>
							<p class="mt-2 font-black text-slate-950 dark:text-slate-50">
								{profile.age ? `${profile.age} years old` : 'Not added yet'}
							</p>
						</div>

						<!-- <div class="rounded-3xl bg-slate-50 p-5 dark:bg-slate-800">
							<p class="text-sm font-bold text-slate-500 dark:text-slate-400">Level</p>
							<p class="mt-2 font-black capitalize text-slate-950 dark:text-slate-50">
								{profile.level ?? 'casual'}
							</p>
						</div> -->

						<div class="rounded-3xl bg-slate-50 p-5 dark:bg-slate-800">
							<p class="text-sm font-bold text-slate-500 dark:text-slate-400">Friends</p>
							<p class="mt-2 font-black text-slate-950 dark:text-slate-50">
								{friends.length}
							</p>
						</div>
					</div>

					<div class="mt-5 rounded-3xl bg-slate-50 p-5 dark:bg-slate-800">
						<p class="text-sm font-bold text-slate-500 dark:text-slate-400">About</p>
						<p class="mt-2 leading-7 text-slate-700 dark:text-slate-300">
							{profile.bio || 'No bio added yet.'}
						</p>
					</div>

					<div class="mt-5 rounded-3xl bg-slate-50 p-5 dark:bg-slate-800">
						<p class="text-sm font-bold text-slate-500 dark:text-slate-400">Sports</p>

						{#if profile.sports?.length}
							<div class="mt-3 flex flex-wrap gap-2">
								{#each profile.sports as sport (sport)}
									<span
										class="rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
									>
										{sport}
									</span>
								{/each}
							</div>
						{:else}
							<p class="mt-2 text-slate-500 dark:text-slate-400">
								No sports added yet.
							</p>
						{/if}
					</div>
				{/if}
			</section>

			<aside class="space-y-6">
				<section
                    class="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Add friend</h2>
                            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                Use a Rally tag or show your QR code.
                            </p>
                        </div>

                        <button
                            type="button"
                            onclick={() => (showQrModal = true)}
                            class="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition hover:bg-slate-200 hover:text-slate-950 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            aria-label="Show QR code"
                            title="Show QR code"
                        >
                            <img
                                src="/qr-code.png"
                                alt="QR code"
                                class="h-6 w-6 object-contain dark:invert"
                            />
                        </button>
                    </div>

                    <div class="mt-5 flex gap-2">
                        <input
                            bind:value={friendTag}
                            placeholder="example: joao-8f3a1"
                            class="min-w-0 flex-1 rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500"
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

				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
				>
					<div class="flex items-center justify-between">
						<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Friends</h2>
						<span
							class="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
						>
							{friends.length}
						</span>
					</div>

					{#if friends.length === 0}
						<div
							class="mt-5 rounded-3xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700"
						>
							<p class="text-3xl">👥</p>
							<p class="mt-2 font-bold text-slate-700 dark:text-slate-300">No friends yet</p>
							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								Add people using their Rally tag.
							</p>
						</div>
					{:else}
						<div class="mt-5 space-y-3">
							{#each friends as friend (friend.id)}
								<div
									class="flex items-center justify-between rounded-3xl bg-slate-50 p-4 dark:bg-slate-800"
								>
									<a
                                        href={resolve(`/users/${friend.id}`)}
                                        class="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                                    >
                                        <UserAvatar
                                            photoURL={friend.photoURL}
                                            displayName={friend.displayName}
                                            email={friend.email}
                                            size="md"
                                        />

                                        <div class="min-w-0">
                                            <p class="truncate font-bold text-slate-950 dark:text-slate-50">
                                                {friend.displayName}
                                            </p>
                                            <p class="truncate text-xs text-slate-500 dark:text-slate-400">
                                                @{friend.rallyTag}
                                            </p>
                                        </div>
                                    </a>

									<button
										type="button"
										onclick={() => startConversation(friend.id)}
										class="rounded-full bg-white px-3 py-2 text-sm font-bold text-blue-600 shadow-sm transition hover:bg-blue-600 hover:text-white dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-600 dark:hover:text-white"
									>
										Message
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</section>

				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
				>
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Account</h2>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Session and account actions.
					</p>

					<button
						onclick={handleLogout}
						disabled={logoutLoading}
						class="mt-5 w-full rounded-2xl bg-slate-950 px-5 py-3 font-bold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-950 dark:hover:bg-slate-200"
					>
						{logoutLoading ? 'Logging out...' : 'Log out'}
					</button>
				</section>
			</aside>
		</div>
	{/if}

	{#if showQrModal}
		<dialog
			open
			class="fixed inset-0 z-[120] m-0 flex h-full w-full max-w-none items-center justify-center border-0 bg-slate-950/60 px-5 backdrop-blur-sm"
			onclick={(event) => {
				if (event.target === event.currentTarget) showQrModal = false;
			}}
			aria-labelledby="profile-qr-title"
		>
			<div class="w-full max-w-sm rounded-[2rem] bg-white p-6 text-center shadow-2xl dark:bg-slate-900">
				<div class="flex items-start justify-between gap-4">
					<div class="text-left">
						<h2 id="profile-qr-title" class="text-2xl font-black text-slate-950 dark:text-slate-50">
							My QR code
						</h2>
						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
							Show this QR code to add you on Rally.
						</p>
					</div>

					<button
						type="button"
						onclick={() => (showQrModal = false)}
						class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
						aria-label="Close QR code"
					>
						×
					</button>
				</div>

				<div class="mt-6 flex justify-center">
					<div class="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-inner">
						{#if qrCodeDataUrl}
							<img src={qrCodeDataUrl} alt="Rally friend QR code" class="h-64 w-64 rounded-2xl" />
						{:else}
							<div class="flex h-64 w-64 items-center justify-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-500">
								Generating QR...
							</div>
						{/if}
					</div>
				</div>

				<p class="mt-5 text-sm text-slate-500 dark:text-slate-400">@{profile?.rallyTag}</p>
			</div>
		</dialog>
	{/if}
</main>
