<!-- src/routes/profile/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { authService } from '$lib/services/auth.service';
	import type { Sport, UserProfile } from '$lib/schema';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import RallyWordmark from '$lib/components/RallyWordmark.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import {
		ensureUserProfile,
		updateUserProfileDetails,
		updateUserProfilePhoto
	} from '$lib/services/user.service';
	import {
		getFriendsForUser,
		removeFriend,
		sendFriendRequestByTag
	} from '$lib/services/social.service';
	import { getOrCreateDirectConversation } from '$lib/services/chat.service';
	import { uploadUserProfilePhoto } from '$lib/services/storage.service';
	import QRCode from 'qrcode';
	import { browser } from '$app/environment';
	import { PROMOTION_COUNTRIES } from '$lib/services/event.service';
	import {
		subscribeToUserActivityChanges,
		subscribeToUserChanges
	} from '$lib/services/realtime.service';
	import { getUserPointTransactions, RALLY_POINTS_CONFIG } from '$lib/services/points.service';
	import {
		canFastSwitchDeviceAccount,
		getDeviceAccounts,
		rememberDeviceAccount,
		removeDeviceAccount,
		type DeviceAccount
	} from '$lib/services/device-accounts.service';
	import type { RallyPointTransaction } from '$lib/schema';
	import { createAppUrl } from '$lib/utils/app-url';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';

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
	let country = $state('PT');
	let age = $state<string | number>('');
	let sports = $state<Sport[]>([]);

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
	let pointTransactions = $state<RallyPointTransaction[]>([]);
	let showPointsBreakdown = $state(false);
	let showSettingsModal = $state(false);
	let notificationsEnabled = $state(true);
	let selectedLanguage = $state('en');
	let showAccountSwitcher = $state(false);
	let deviceAccounts = $state<DeviceAccount[]>([]);
	let switchingAccountId = $state<string | null>(null);

	let showPhotoModal = $state(false);
	let avatarSelectionMode = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let friendToRemove = $state<UserProfile | null>(null);

	const appAvatars = [
		'/avatars/avatar_1.png',
		'/avatars/avatar_2.png',
		'/avatars/avatar_3.png',
		'/avatars/avatar_4.png'
	];

	function sortByDisplayName(a: UserProfile, b: UserProfile) {
		return (a.displayName ?? '').localeCompare(b.displayName ?? '', undefined, {
			sensitivity: 'base'
		});
	}

	function resetFormFromProfile(nextProfile: UserProfile) {
		displayName = nextProfile.displayName ?? '';
		bio = nextProfile.bio ?? '';
		city = nextProfile.city ?? '';
		country = nextProfile.country ?? 'PT';
		age = nextProfile.age ? String(nextProfile.age) : '';
		sports = nextProfile.sports ?? [];
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
			deviceAccounts = rememberDeviceAccount(profile, currentUser);
			resetFormFromProfile(profile);
			await generateProfileQrCode(profile.id);

			const rawFriends = await getFriendsForUser(currentUser.uid);
			friends = rawFriends.sort(sortByDisplayName);

			pointTransactions = await getUserPointTransactions(currentUser.uid, 5);
			deviceAccounts = getDeviceAccounts();
		} catch (err) {
			console.error('Profile load error:', err);
			error = getFriendlyErrorMessage(err, 'Could not load profile.');
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

		if (parsedAge !== null && (!Number.isInteger(parsedAge) || parsedAge < 13 || parsedAge > 100)) {
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
				country,
				age: parsedAge,
				sports
			});

			success = 'Profile updated.';
			editMode = false;
			await loadProfile();
		} catch (err) {
			console.error('Save profile error:', err);
			error = getFriendlyErrorMessage(err, 'Could not update profile.');
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
			error = getFriendlyErrorMessage(err, 'Could not update profile photo.');
		} finally {
			photoSaving = false;
		}
	}

	async function selectAppAvatar(avatarPath: string) {
		const currentUser = auth.currentUser;

		if (!currentUser) return;

		photoSaving = true;
		error = '';
		success = '';
		showPhotoModal = false;
		avatarSelectionMode = false;

		try {
			await updateUserProfilePhoto({
				userId: currentUser.uid,
				photoURL: avatarPath,
				profilePhotoPath: null
			});

			success = 'Profile photo updated.';
			await loadProfile();
		} catch (err) {
			console.error('Select avatar error:', err);
			error = getFriendlyErrorMessage(err, 'Could not update profile photo.');
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
			error = getFriendlyErrorMessage(err, 'Could not send friend request.');
		} finally {
			friendLoading = false;
		}
	}

	function handleRemoveFriend(friend: UserProfile) {
		friendToRemove = friend;
	}

	async function executeRemoveFriend(friend: UserProfile) {
		const currentUser = auth.currentUser;

		if (!currentUser) return;

		friendToRemove = null;
		error = '';
		success = '';

		try {
			await removeFriend({
				currentUserId: currentUser.uid,
				friendId: friend.id
			});

			success = `${friend.displayName} removed from friends.`;
			await loadProfile();
		} catch (err) {
			console.error('Remove friend error:', err);
			error = getFriendlyErrorMessage(err, 'Could not remove friend.');
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
			error = getFriendlyErrorMessage(err, 'Could not start conversation.');
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
			await authService.logout();
			await goto('/');
		} finally {
			logoutLoading = false;
		}
	}

	async function handleAddAccount() {
		logoutLoading = true;

		try {
			if (profile) deviceAccounts = rememberDeviceAccount(profile, auth.currentUser);
			await authService.logout();
			showSettingsModal = false;
			showAccountSwitcher = false;
			await goto('/login?returnTo=/profile&mode=addAccount');
		} finally {
			logoutLoading = false;
		}
	}

	async function handleSwitchAccount(account: DeviceAccount) {
		if (account.id === auth.currentUser?.uid) {
			showAccountSwitcher = false;
			return;
		}

		logoutLoading = true;
		switchingAccountId = account.id;
		error = '';

		try {
			if (profile) deviceAccounts = rememberDeviceAccount(profile, auth.currentUser);

			if (canFastSwitchDeviceAccount(account)) {
				await authService.logout();
				const switchedUser = await authService.signInWithGoogle();

				if (switchedUser.uid !== account.id) {
					deviceAccounts = getDeviceAccounts();
					error = `You signed in as ${switchedUser.email ?? 'another account'}. Choose ${account.email} to switch to ${account.displayName}.`;
					return;
				}

				showSettingsModal = false;
				showAccountSwitcher = false;
				await goto('/profile');
				return;
			}

			await authService.logout();
			showSettingsModal = false;
			showAccountSwitcher = false;
			await goto(`/login?returnTo=/profile&email=${encodeURIComponent(account.email)}&switchAccount=${encodeURIComponent(account.id)}`);
		} catch (err) {
			console.error('Switch account error:', err);
			error = getFriendlyErrorMessage(err, 'Could not switch account.');
		} finally {
			logoutLoading = false;
			switchingAccountId = null;
		}
	}

	function handleForgetDeviceAccount(accountId: string) {
		deviceAccounts = removeDeviceAccount(accountId);
	}

	async function generateProfileQrCode(userId: string) {
		if (!browser || !profile?.rallyTag) return;

		const link = createAppUrl(`/friends/add?tag=${encodeURIComponent(profile.rallyTag)}`);

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

	onMount(() => {
		void loadProfile();
		const userId = auth.currentUser?.uid;
		if (!userId) return;
		const unsubscribeUser = subscribeToUserChanges(userId, () => void loadProfile());
		const unsubscribeActivity = subscribeToUserActivityChanges(userId, () => void loadProfile());
		return () => {
			unsubscribeUser();
			unsubscribeActivity();
		};
	});
</script>

<main class="mx-auto w-full max-w-6xl px-5 py-5 sm:px-5 sm:py-6">
	<header class="mb-4 md:mb-6">
		<div class="hidden md:block">
			<div class="flex items-center justify-between gap-3">
				<RallyWordmark size="sm" />
				<button
					type="button"
					onclick={() => (showSettingsModal = true)}
					class="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800 dark:hover:bg-slate-800"
				>
					Settings
				</button>
			</div>
			<h1 class="mt-2 text-3xl font-black text-slate-950 dark:text-slate-50">Profile</h1>
			<p class="mt-1 text-slate-500 dark:text-slate-400">
				Your Rally identity, sports profile and friends.
			</p>
		</div>

		<div class="flex items-center justify-between md:hidden">
			<p class="text-base font-black text-slate-950 dark:text-slate-50">Profile</p>

			<button
				type="button"
				onclick={() => (showSettingsModal = true)}
				class="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800"
				aria-label="Open settings"
			>
				⚙
			</button>
		</div>
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

		<section class="space-y-6 pb-6 md:hidden">
			{#if editMode}
				<div class="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
					<div class="flex items-center justify-between gap-3">
						<div>
							<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Edit profile</h2>
							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Keep your Rally profile fresh.</p>
						</div>
						<button
							type="button"
							onclick={cancelEdit}
							class="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
						>
							Cancel
						</button>
					</div>

					<div class="mt-5 grid gap-4">
						<div>
							<label for="mobile-name" class="text-sm font-bold text-slate-700 dark:text-slate-300">Name</label>
							<input
								id="mobile-name"
								bind:value={displayName}
								class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							/>
						</div>

						<div class="grid grid-cols-2 gap-3">
							<div>
								<label for="mobile-city" class="text-sm font-bold text-slate-700 dark:text-slate-300">City</label>
								<input
									id="mobile-city"
									bind:value={city}
									class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								/>
							</div>
							<div>
								<label for="mobile-age" class="text-sm font-bold text-slate-700 dark:text-slate-300">Age</label>
								<input
									id="mobile-age"
									type="number"
									min="13"
									max="100"
									bind:value={age}
									class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								/>
							</div>
						</div>

						<div>
							<label for="mobile-bio" class="text-sm font-bold text-slate-700 dark:text-slate-300">Bio</label>
							<textarea
								id="mobile-bio"
								bind:value={bio}
								rows="3"
								class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							></textarea>
						</div>

						<div>
							<p class="text-sm font-bold text-slate-700 dark:text-slate-300">Sports</p>
							<div class="mt-3 flex flex-wrap gap-2">
								{#each availableSports as sport (sport)}
									<button
										type="button"
										onclick={() => toggleSport(sport)}
										class={`rounded-full px-3 py-2 text-xs font-bold transition ${
											sports.includes(sport)
												? 'bg-blue-600 text-white'
												: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
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
							class="rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/20 transition active:scale-[0.98] disabled:opacity-60"
						>
							{saving ? 'Saving...' : 'Save profile'}
						</button>
					</div>
				</div>
			{:else}
			    <div class="px-2">
			        <div class="flex items-center gap-4">
						<div class="relative h-20 w-20 shrink-0">
						    <UserAvatar
						        photoURL={profile.photoURL ?? auth.currentUser?.photoURL ?? null}
						        displayName={profile.displayName}
						        email={profile.email}
						        size="xl"
						    />
						    <button
						        type="button"
						        onclick={() => (showPhotoModal = true)}
						        class="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-white text-blue-600 shadow-lg ring-2 ring-white transition active:scale-95 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-950"
						        aria-label="Edit profile photo"
						    >
						        {#if photoSaving}
						            <span class="text-sm font-black">…</span>
						        {:else}
						            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="h-4 w-4">
						                <path stroke-linecap="round" stroke-linejoin="round" d="M6.8 6.2A2.3 2.3 0 0 1 5.2 7.2c-.38.05-.76.11-1.14.18A2.25 2.25 0 0 0 2.25 9.6V18A2.25 2.25 0 0 0 4.5 20.25h15A2.25 2.25 0 0 0 21.75 18V9.6a2.25 2.25 0 0 0-1.81-2.21c-.38-.07-.76-.13-1.14-.18a2.3 2.3 0 0 1-1.6-1l-.82-1.32a2.2 2.2 0 0 0-1.74-1.04 49 49 0 0 0-5.28 0 2.2 2.2 0 0 0-1.74 1.04L6.8 6.2Z" />
						                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 13a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
						            </svg>
						        {/if}
						    </button>
						    <input bind:this={fileInput} type="file" accept="image/*" class="hidden" onchange={handleProfilePhotoFileChange} />
						</div>

						<div class="min-w-0 flex-1">
						    <div class="flex items-start justify-between gap-3">
						        <div class="min-w-0">
									<h2 class="truncate text-2xl font-black leading-tight text-slate-950 dark:text-slate-50">
									    {profile.displayName}
									</h2>
									<button
									    type="button"
									    onclick={copyTag}
									    class="mt-1 block max-w-full truncate text-left text-sm font-bold text-blue-600 dark:text-blue-400"
									>
									    @{profile.rallyTag ?? 'creating-tag'}
									</button>
						        </div>

						        <button
									type="button"
									onclick={() => (editMode = true)}
									class="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200"
						        >
									Edit
						        </button>
						    </div>

						    {#if profile.city || profile.age}
						        <p class="mt-2 truncate text-sm text-slate-500 dark:text-slate-400">
									{profile.city || 'No city'}{profile.age ? ` · ${profile.age} years old` : ''}
						        </p>
						    {/if}
						</div>
			        </div>

			        <div class="mt-5 flex flex-wrap gap-2">
						{#if profile.sports?.length}
						    {#each profile.sports as sport (sport)}
						        <span class="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{sport}</span>
						    {/each}
						{:else}
						    <span class="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">No sports yet</span>
						{/if}
			        </div>

			        <div class="mt-5 grid grid-cols-2 divide-x divide-slate-200 rounded-[1.5rem] bg-slate-50 p-4 dark:divide-slate-700 dark:bg-slate-800/70">
						<div class="text-center">
						    <p class="text-2xl font-black text-slate-950 dark:text-slate-50">{friends.length}</p>
						    <p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">Friends</p>
						</div>
						<div class="text-center">
						    <p class="text-2xl font-black text-slate-950 dark:text-slate-50">{(profile.rallyPointsTotal ?? 0).toLocaleString()}</p>
						    <p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">Points</p>
						</div>
			        </div>

			        {#if profile.bio}
						<div class="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
							<p class="text-xs font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">About</p>
							<p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{profile.bio}</p>
						</div>
			        {/if}
			    </div>

			    <button
			        type="button"
			        onclick={() => (showQrModal = true)}
			        class="flex w-full items-center justify-between rounded-[1.6rem] bg-blue-600 p-4 text-left text-white shadow-lg shadow-blue-600/20 active:scale-[0.99]"
			    >
			        <span>
						<span class="block text-sm font-black">Rally QR</span>
						<span class="block text-xs text-blue-100">Share your code to connect</span>
			        </span>
			        <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
						<img src="/qr-code.png" alt="QR code" class="h-6 w-6 object-contain invert" />
			        </span>
			    </button>
			{/if}

			<section class="overflow-hidden rounded-[1.7rem] bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
			    <div class="bg-gradient-to-r from-slate-950 to-slate-800 p-4">
			        <div class="flex items-center justify-between gap-3">
						<div class="flex items-center gap-2.5">
						    <svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5 text-yellow-400" aria-hidden="true">
						        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
						    </svg>
						    <h2 class="text-lg font-black text-white">Rally Points</h2>
						</div>

						<button
						    type="button"
						    onclick={() => (showPointsBreakdown = !showPointsBreakdown)}
						    class="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/70"
						>
						    {showPointsBreakdown ? 'Hide' : 'How it works'}
						</button>
			        </div>

			        <p class="mt-3 text-4xl font-black text-white">
						{(profile.rallyPointsTotal ?? 0).toLocaleString()}
						<span class="text-base font-semibold text-white/50">pts</span>
			        </p>

			        <p class="mt-1 text-sm text-white/50">
						{(profile.rallyPointsTotal ?? 0) === 0 ? 'Play at a Rally Verified venue to start earning.' : 'Your total Rally Points balance.'}
			        </p>
			    </div>

			    {#if showPointsBreakdown}
			        <div class="border-b border-slate-100 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
						<p class="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
						    Earn per event at a Verified venue
						</p>
						<div class="space-y-2 text-sm">
						    {#each [{ label: 'Participating', pts: RALLY_POINTS_CONFIG.BASE_PARTICIPATION }, { label: 'First visit to venue', pts: RALLY_POINTS_CONFIG.FIRST_VENUE_BONUS }, { label: `Per other player (max ${RALLY_POINTS_CONFIG.PER_PARTICIPANT_CAP})`, pts: RALLY_POINTS_CONFIG.PER_PARTICIPANT }, { label: 'Organising the event', pts: RALLY_POINTS_CONFIG.ORGANIZER_BONUS }, { label: 'Event at full capacity', pts: RALLY_POINTS_CONFIG.FULL_EVENT_BONUS }] as row}
						        <div class="flex items-center justify-between gap-3">
									<span class="text-slate-600 dark:text-slate-400">{row.label}</span>
									<span class="font-bold text-slate-900 dark:text-slate-50">+{row.pts} pts</span>
						        </div>
						    {/each}
						</div>
			        </div>
			    {/if}

			    {#if pointTransactions.length > 0}
			        <div class="p-4">
						<p class="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Recent activity</p>
						<div class="space-y-2">
						    {#each pointTransactions as tx (tx.id)}
						        <div class="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
									<div class="min-w-0">
									    <p class="truncate text-sm font-bold text-slate-900 dark:text-slate-50">{tx.eventTitle}</p>
									    <p class="truncate text-xs text-slate-500 dark:text-slate-400">{tx.venueName}</p>
									</div>
									<span class="ml-3 shrink-0 font-black text-yellow-500">+{tx.amount}</span>
						        </div>
						    {/each}
						</div>
			        </div>
			    {/if}
			</section>

			<div class="px-2">
			    <div class="flex items-center justify-between gap-3">
			        <h2 class="text-lg font-black text-slate-950 dark:text-slate-50">Friends</h2>
			        <span class="text-xs font-black text-blue-600 dark:text-blue-400">{friends.length}</span>
			    </div>

			    {#if friends.length === 0}
			        <p class="mt-3 text-sm text-slate-500 dark:text-slate-400">Add friends using a Rally tag.</p>
			    {:else}
			        <div class="mt-4 flex gap-3 overflow-x-auto pb-1">
						{#each friends as friend (friend.id)}
						    <a href={resolve(`/users/${friend.id}`)} class="w-16 shrink-0 text-center">
						        <div class="mx-auto h-12 w-12">
									<UserAvatar photoURL={friend.photoURL} displayName={friend.displayName} email={friend.email} size="md" />
						        </div>
						        <p class="mt-2 truncate text-xs font-bold text-slate-700 dark:text-slate-300">{friend.displayName}</p>
						    </a>
						{/each}
			        </div>
			    {/if}
			</div>

			<div class="px-2">
			    <h2 class="text-lg font-black text-slate-950 dark:text-slate-50">Add friend</h2>
			    <div class="mt-3 flex gap-2">
			        <input
						bind:value={friendTag}
						placeholder="rally-tag"
						class="min-w-0 flex-1 rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-950 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
			        />
			        <button
						onclick={handleAddFriend}
						disabled={friendLoading || !friendTag}
						class="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
			        >
						{friendLoading ? '...' : 'Add'}
			        </button>
			    </div>
			</div>
		</section>

		<div class="hidden min-w-0 items-start gap-4 md:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-6">
			<section
				class="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-4xl sm:p-6"
			>
				<div class="flex min-w-0 items-start justify-between gap-3 sm:gap-5">
					<div class="flex min-w-0 items-center gap-3 sm:gap-4">
						<div class="relative h-20 w-20 shrink-0 sm:h-21 sm:w-21">
							<UserAvatar
								photoURL={profile.photoURL ?? auth.currentUser?.photoURL ?? null}
								displayName={profile.displayName}
								email={profile.email}
								size="xl"
							/>

							<button
								type="button"
								onclick={() => (showPhotoModal = true)}
								title="Edit profile photo"
								class="absolute -bottom-1 -right-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-blue-600 shadow-lg ring-2 ring-white transition hover:scale-105 hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-950 dark:hover:bg-slate-800"
							>
								{#if photoSaving}
									<span class="text-sm font-black">…</span>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="h-4 w-4">
										<path stroke-linecap="round" stroke-linejoin="round" d="M6.8 6.2A2.3 2.3 0 0 1 5.2 7.2c-.38.05-.76.11-1.14.18A2.25 2.25 0 0 0 2.25 9.6V18A2.25 2.25 0 0 0 4.5 20.25h15A2.25 2.25 0 0 0 21.75 18V9.6a2.25 2.25 0 0 0-1.81-2.21c-.38-.07-.76-.13-1.14-.18a2.3 2.3 0 0 1-1.6-1l-.82-1.32a2.2 2.2 0 0 0-1.74-1.04 49 49 0 0 0-5.28 0 2.2 2.2 0 0 0-1.74 1.04L6.8 6.2Z" />
										<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 13a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
									</svg>
								{/if}
							</button>
							<input
								bind:this={fileInput}
								type="file"
								accept="image/*"
								class="hidden"
								onchange={handleProfilePhotoFileChange}
							/>
						</div>

						<div class="min-w-0">
							<h2 class="truncate text-xl font-black text-slate-950 dark:text-slate-50 sm:text-3xl">
								{profile.displayName}
							</h2>

							<p class="truncate text-xs text-slate-500 dark:text-slate-400 sm:text-base">
								{profile.email}
							</p>

							<button
								onclick={copyTag}
								class="mt-2 max-w-full truncate rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900 sm:px-3 sm:text-sm"
							>
								@{profile.rallyTag ?? 'creating-tag'} · copy
							</button>
						</div>
					</div>

					<div class="flex shrink-0 gap-1 sm:gap-2">
						{#if editMode}
							<button
								type="button"
								onclick={cancelEdit}
								class="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 sm:px-4 sm:text-sm"
							>
								Cancel
							</button>
						{:else}
							<button
								type="button"
								onclick={() => (editMode = true)}
								class="rounded-full bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 sm:px-4 sm:text-sm"
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

						<div class="grid grid-cols-2 gap-3 md:gap-5">
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
								<label for="country" class="text-sm font-bold text-slate-700 dark:text-slate-300"
									>Country</label
								>
								<select
									id="country"
									bind:value={country}
									class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								>
									{#each PROMOTION_COUNTRIES as option}
										<option value={option.code}>{option.label}</option>
									{/each}
								</select>
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
					<div class="mt-6 grid grid-cols-3 gap-2 sm:mt-8 sm:gap-4">
						<div
							class="min-w-0 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800 sm:rounded-3xl sm:p-5"
						>
							<p class="text-sm font-bold text-slate-500 dark:text-slate-400">Location</p>
							<p
								class="mt-2 truncate text-sm font-black text-slate-950 dark:text-slate-50 sm:text-base"
							>
								{profile.city || 'Not added yet'}
							</p>
						</div>

						<div
							class="min-w-0 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800 sm:rounded-3xl sm:p-5"
						>
							<p class="text-sm font-bold text-slate-500 dark:text-slate-400">Age</p>
							<p class="mt-2 text-sm font-black text-slate-950 dark:text-slate-50 sm:text-base">
								{profile.age ? `${profile.age} years old` : 'Not added yet'}
							</p>
						</div>

						<div
							class="min-w-0 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800 sm:rounded-3xl sm:p-5"
						>
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
							<p class="mt-2 text-slate-500 dark:text-slate-400">No sports added yet.</p>
						{/if}
					</div>
				{/if}
			</section>

			<aside class="grid min-w-0 grid-cols-2 gap-3 lg:block lg:space-y-6">
				<section
					class="col-span-2 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6 lg:rounded-4xl"
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
							<img src="/qr-code.png" alt="QR code" class="h-6 w-6 object-contain dark:invert" />
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
					class="col-span-2 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6 lg:rounded-[2rem]"
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
						<div class="mt-5 max-h-[24rem] space-y-3 overflow-y-auto pr-1">
							{#each friends as friend (friend.id)}
								<div
									class="flex items-center justify-between rounded-3xl bg-slate-50 p-4 dark:bg-slate-800"
								>
									<a
										href={resolve(`/users/${friend.id}`)}
										class="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-2 transition hover:bg-slate-100 dark:hover:bg-slate-800"
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

									<div class="flex items-center gap-2">
										<button
											type="button"
											onclick={() => startConversation(friend.id)}
											class="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-bold text-blue-600 shadow-sm transition hover:bg-blue-600 hover:text-white dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-600 dark:hover:text-white sm:text-sm"
										>
											Message
										</button>

										<button
											type="button"
											onclick={() => handleRemoveFriend(friend)}
											class="flex h-8 w-8 items-center justify-center shrink-0 rounded-full bg-white text-slate-400 shadow-sm transition hover:bg-red-50 hover:text-red-600 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
											title="Remove friend"
											aria-label="Remove friend"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-4 w-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
											</svg>
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</section>

				<!-- ─── Rally Points ─── -->
				<section
					class="col-span-2 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:rounded-[2rem]"
				>
					<!-- Header gradient bar -->
					<div class="bg-gradient-to-r from-slate-900 to-slate-800 p-4 sm:p-6">
						<div class="flex items-center justify-between gap-3">
							<div class="flex items-center gap-2.5">
								<svg
									viewBox="0 0 24 24"
									fill="currentColor"
									class="h-5 w-5 text-yellow-400"
									aria-hidden="true"
								>
									<polygon
										points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
									/>
								</svg>
								<h2 class="text-lg font-black text-white">Rally Points</h2>
							</div>

							<button
								type="button"
								onclick={() => (showPointsBreakdown = !showPointsBreakdown)}
								class="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/70 transition hover:bg-white/20 hover:text-white"
							>
								{showPointsBreakdown ? 'Hide' : 'How it works'}
							</button>
						</div>

						<p class="mt-3 text-4xl font-black text-white">
							{(profile.rallyPointsTotal ?? 0).toLocaleString()}
							<span class="text-base font-semibold text-white/50">pts</span>
						</p>

						{#if (profile.rallyPointsTotal ?? 0) === 0}
							<p class="mt-1 text-sm text-white/50">
								Play at a Rally Verified venue to start earning.
							</p>
						{:else}
							<p class="mt-1 text-sm text-white/50">Your total Rally Points balance.</p>
						{/if}
					</div>

					<!-- How it works breakdown (collapsible) -->
					{#if showPointsBreakdown}
						<div
							class="border-b border-slate-100 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60 sm:px-6"
						>
							<p
								class="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400"
							>
								Earn per event at a Verified venue
							</p>
							<div class="space-y-2 text-sm">
								{#each [{ label: 'Participating', pts: RALLY_POINTS_CONFIG.BASE_PARTICIPATION }, { label: 'First visit to venue', pts: RALLY_POINTS_CONFIG.FIRST_VENUE_BONUS }, { label: `Per other player (max ${RALLY_POINTS_CONFIG.PER_PARTICIPANT_CAP})`, pts: RALLY_POINTS_CONFIG.PER_PARTICIPANT }, { label: 'Organising the event', pts: RALLY_POINTS_CONFIG.ORGANIZER_BONUS }, { label: 'Event at full capacity', pts: RALLY_POINTS_CONFIG.FULL_EVENT_BONUS }] as row}
									<div class="flex items-center justify-between">
										<span class="text-slate-600 dark:text-slate-400">{row.label}</span>
										<span class="font-bold text-slate-900 dark:text-slate-50">+{row.pts} pts</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Recent transactions -->
					{#if pointTransactions.length > 0}
						<div class="p-4 sm:p-6">
							<p
								class="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400"
							>
								Recent activity
							</p>
							<div class="space-y-2">
								{#each pointTransactions as tx (tx.id)}
									<div
										class="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800"
									>
										<div class="min-w-0">
											<p class="truncate text-sm font-bold text-slate-900 dark:text-slate-50">
												{tx.eventTitle}
											</p>
											<p class="truncate text-xs text-slate-500 dark:text-slate-400">
												{tx.venueName}
											</p>
										</div>
										<span class="ml-3 shrink-0 font-black text-yellow-500">+{tx.amount}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</section>

			</aside>
		</div>
	{/if}

	{#if showQrModal}
		<dialog
			open
			class="fixed inset-0 z-[120] m-0 flex h-full w-full max-w-none items-end justify-center border-0 bg-slate-950/60 px-0 backdrop-blur-sm sm:items-center sm:px-5"
			onclick={(event) => {
				if (event.target === event.currentTarget) showQrModal = false;
			}}
			aria-labelledby="profile-qr-title"
		>
			<div
				class="max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-[2rem] bg-white p-4 text-center shadow-2xl dark:bg-slate-900 sm:rounded-[2rem] sm:p-6"
			>
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
					<div class="rounded-[2rem] border border-slate-200 bg-white p-3 shadow-inner sm:p-4">
						{#if qrCodeDataUrl}
							<img
								src={qrCodeDataUrl}
								alt="Rally friend QR code"
								class="h-56 w-56 rounded-2xl sm:h-64 sm:w-64"
							/>
						{:else}
							<div
								class="flex h-56 w-56 items-center justify-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-500 sm:h-64 sm:w-64"
							>
								Generating QR...
							</div>
						{/if}
					</div>
				</div>

				<p class="mt-5 text-sm text-slate-500 dark:text-slate-400">@{profile?.rallyTag}</p>

				{#if qrCodeLink}
					<p class="mt-2 break-all text-xs text-slate-400 dark:text-slate-500">{qrCodeLink}</p>
				{/if}
			</div>
		</dialog>
	{/if}

	{#if showPhotoModal}
		<dialog
			open
			class="fixed inset-0 z-[120] m-0 flex h-full w-full max-w-none items-end justify-center border-0 bg-slate-950/60 px-0 backdrop-blur-sm sm:items-center sm:px-5"
			onclick={(event) => {
				if (event.target === event.currentTarget) {
					showPhotoModal = false;
					avatarSelectionMode = false;
				}
			}}
			aria-labelledby="profile-photo-title"
		>
			<div
				class="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[2rem] bg-white p-6 shadow-2xl dark:bg-slate-900 sm:rounded-[2rem] sm:p-8"
			>
				<div class="flex items-start justify-between gap-4">
					<div class="text-left">
						<h2 id="profile-photo-title" class="text-2xl font-black text-slate-950 dark:text-slate-50">
							{avatarSelectionMode ? 'Choose App Avatar' : 'Edit profile photo'}
						</h2>
						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
							{avatarSelectionMode ? 'Select one of the Rally sports avatars' : 'Select how you want to update your profile photo.'}
						</p>
					</div>

					<button
						type="button"
						onclick={() => {
							showPhotoModal = false;
							avatarSelectionMode = false;
						}}
						class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
						aria-label="Close dialog"
					>
						×
					</button>
				</div>

				{#if !avatarSelectionMode}
					<div class="mt-6 grid gap-4">
						<button
							type="button"
							onclick={() => {
								showPhotoModal = false;
								fileInput?.click();
							}}
							class="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800"
						>
							<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="h-6 w-6">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
								</svg>
							</div>
							<div>
								<p class="font-bold text-slate-900 dark:text-slate-50">Upload from Camera/Gallery</p>
								<p class="text-xs text-slate-500 dark:text-slate-400">Take a photo or choose from your files</p>
							</div>
						</button>

						<button
							type="button"
							onclick={() => (avatarSelectionMode = true)}
							class="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800"
						>
							<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="h-6 w-6">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
								</svg>
							</div>
							<div>
								<p class="font-bold text-slate-900 dark:text-slate-50">Choose App Avatar</p>
								<p class="text-xs text-slate-500 dark:text-slate-400">Select one of our blue sports avatars</p>
							</div>
						</button>
					</div>
				{:else}
					<div class="mt-6">
						<div class="grid grid-cols-3 gap-3">
							{#each appAvatars as avatar}
								<button
									type="button"
									onclick={() => selectAppAvatar(avatar)}
									class="relative aspect-square overflow-hidden rounded-2xl border-2 border-slate-100 bg-slate-50 transition hover:scale-105 hover:border-blue-500 active:scale-95 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-blue-400"
								>
									<img src={avatar} alt="App Avatar" class="h-full w-full object-cover" />
								</button>
							{/each}
						</div>

						<button
							type="button"
							onclick={() => (avatarSelectionMode = false)}
							class="mt-6 w-full rounded-2xl bg-slate-100 py-3 font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
						>
							Back to options
						</button>
					</div>
				{/if}
			</div>
		</dialog>
	{/if}

	{#if showSettingsModal}
		<dialog
			open
			class="fixed inset-0 z-[120] m-0 flex h-full w-full max-w-none items-end justify-center border-0 bg-slate-950/60 px-0 backdrop-blur-sm sm:items-center sm:px-5"
			onclick={(event) => {
				if (event.target === event.currentTarget) {
					showSettingsModal = false;
					showAccountSwitcher = false;
				}
			}}
			aria-labelledby="profile-settings-title"
		>
			<div
				class="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl dark:bg-slate-900 sm:rounded-[2rem] sm:p-6"
			>
				<div class="flex items-start justify-between gap-4">
					<div>
						<h2 id="profile-settings-title" class="text-2xl font-black text-slate-950 dark:text-slate-50">Settings</h2>
						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Notifications, appearance, language and account.</p>
					</div>
					<button
						type="button"
						onclick={() => {
							showSettingsModal = false;
							showAccountSwitcher = false;
						}}
						class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
						aria-label="Close settings"
					>
						×
					</button>
				</div>

				<div class="mt-6 space-y-5">
					<section>
						<p class="mb-2 text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">App</p>

						<div class="divide-y divide-slate-200 overflow-hidden rounded-3xl bg-slate-50 dark:divide-slate-700 dark:bg-slate-800">
							<div class="flex items-center justify-between gap-4 p-4">
								<div>
									<p class="font-black text-slate-950 dark:text-slate-50">Notifications</p>
									<p class="text-xs text-slate-500 dark:text-slate-400">Event invites, messages and friend requests.</p>
								</div>
								<button
									type="button"
									onclick={() => (notificationsEnabled = !notificationsEnabled)}
									class={`relative h-7 w-12 rounded-full transition ${notificationsEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
									aria-label="Toggle notifications"
								>
									<span class={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${notificationsEnabled ? 'left-6' : 'left-1'}`}></span>
								</button>
							</div>

							<div class="flex items-center justify-between gap-4 p-4">
								<div>
									<p class="font-black text-slate-950 dark:text-slate-50">Appearance</p>
									<p class="text-xs text-slate-500 dark:text-slate-400">Switch light or dark mode.</p>
								</div>
								<ThemeToggle />
							</div>

							<label class="flex items-center justify-between gap-4 p-4">
								<div>
									<p class="font-black text-slate-950 dark:text-slate-50">Language</p>
									<p class="text-xs text-slate-500 dark:text-slate-400">App language.</p>
								</div>
								<select
									bind:value={selectedLanguage}
									class="rounded-2xl border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
								>
									<option value="en">English</option>
									<option value="pt">Português</option>
								</select>
							</label>
						</div>
					</section>

					<section>
						<div class="mb-2 flex items-center justify-between gap-3">
							<p class="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Account</p>
							{#if showAccountSwitcher}
								<button
									type="button"
									onclick={() => (showAccountSwitcher = false)}
									class="text-xs font-black text-blue-600 dark:text-blue-400"
								>
									Back
								</button>
							{/if}
						</div>

						{#if showAccountSwitcher}
							<div class="overflow-hidden rounded-3xl bg-slate-50 dark:bg-slate-800">
								<div class="divide-y divide-slate-200 dark:divide-slate-700">
									{#each deviceAccounts as account (account.id)}
										<div class="flex items-center gap-3 p-4">
											<button
												type="button"
												onclick={() => handleSwitchAccount(account)}
												disabled={logoutLoading}
												class="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
											>
												<UserAvatar
													photoURL={account.photoURL}
													displayName={account.displayName}
													email={account.email}
													size="md"
												/>
												<div class="min-w-0 flex-1">
													<div class="flex min-w-0 items-center gap-2">
														<p class="truncate font-black text-slate-950 dark:text-slate-50">{account.displayName}</p>
														{#if account.accountType === 'organization'}
															<span class="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[0.65rem] font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">Org</span>
														{/if}
													</div>
													<p class="truncate text-xs text-slate-500 dark:text-slate-400">
														{account.rallyTag ? `@${account.rallyTag}` : account.email}
													</p>
													{#if account.id !== auth.currentUser?.uid}
														<p class="mt-0.5 text-[0.68rem] font-bold text-slate-400 dark:text-slate-500">
															{#if switchingAccountId === account.id}
																Switching...
															{:else if canFastSwitchDeviceAccount(account)}
																Quick switch with Google
															{:else}
																Password required
															{/if}
														</p>
													{/if}
												</div>
											</button>

											{#if account.id === auth.currentUser?.uid}
												<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">✓</span>
											{:else}
												<button
													type="button"
													onclick={() => handleForgetDeviceAccount(account.id)}
													class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-red-500 dark:hover:bg-slate-900"
													aria-label="Forget account on this device"
												>
													×
												</button>
											{/if}
										</div>
									{/each}
								</div>

								<button
									type="button"
									onclick={handleAddAccount}
									disabled={logoutLoading}
									class="flex w-full items-center gap-3 border-t border-slate-200 p-4 text-left transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-700"
								>
									<span class="flex h-11 w-11 items-center justify-center rounded-full bg-white text-2xl font-light text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">+</span>
									<span>
										<span class="block font-black text-slate-950 dark:text-slate-50">Add another account</span>
										<span class="block text-xs text-slate-500 dark:text-slate-400">It will be saved on this device.</span>
									</span>
								</button>

								<div class="px-4 pb-4 pt-1">
									<p class="text-[0.7rem] leading-relaxed text-slate-400 dark:text-slate-500">
										Google accounts can quick switch. Email/password accounts still require the password for security.
									</p>
								</div>
							</div>
						{:else}
							<div class="overflow-hidden rounded-3xl bg-slate-50 dark:bg-slate-800">
								<div class="flex items-center gap-3 p-4">
									<UserAvatar
										photoURL={profile?.photoURL ?? auth.currentUser?.photoURL ?? null}
										displayName={profile?.displayName ?? ''}
										email={profile?.email}
										size="md"
									/>
									<div class="min-w-0 flex-1">
										<p class="truncate font-black text-slate-950 dark:text-slate-50">{profile?.displayName}</p>
										<p class="truncate text-xs text-slate-500 dark:text-slate-400">{profile?.email}</p>
									</div>
							</div>

							<div class="grid grid-cols-2 gap-2 p-3 pt-0">
								<button
									type="button"
									onclick={() => (showAccountSwitcher = true)}
									class="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-900 shadow-sm transition hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-700"
								>
									Switch
								</button>

								<button
									onclick={handleLogout}
									disabled={logoutLoading}
									class="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-950 dark:hover:bg-slate-200"
								>
									{logoutLoading ? '...' : 'Log out'}
								</button>
							</div>
							</div>
						{/if}
					</section>
				</div>
			</div>
		</dialog>
	{/if}

	{#if friendToRemove}
		<dialog
			open
			class="fixed inset-0 z-[120] m-0 flex h-full w-full max-w-none items-end justify-center border-0 bg-slate-950/60 px-0 backdrop-blur-sm sm:items-center sm:px-5"
			onclick={(event) => {
				if (event.target === event.currentTarget) friendToRemove = null;
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
						Are you sure you want to remove <span class="font-bold text-slate-800 dark:text-slate-200">{friendToRemove.displayName}</span> from your friends?
					</p>

					<div class="mt-6 flex w-full flex-col gap-2 sm:flex-row">
						<button
							type="button"
							onclick={() => {
								if (friendToRemove) {
									void executeRemoveFriend(friendToRemove);
								}
							}}
							class="w-full rounded-2xl bg-red-600 py-3 font-bold text-white transition hover:bg-red-700 active:scale-95"
						>
							Remove
						</button>
						<button
							type="button"
							onclick={() => (friendToRemove = null)}
							class="w-full rounded-2xl bg-slate-100 py-3 font-bold text-slate-700 transition hover:bg-slate-200 active:scale-95 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
						>
							Cancel
						</button>
					</div>
				</div>
			</div>
		</dialog>
	{/if}
</main>
