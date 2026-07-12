<!-- src/routes/settings/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { authService } from '$lib/services/auth.service';
	import type { UserProfile } from '$lib/schema';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { ensureUserProfile, updateUserPrivacy } from '$lib/services/user.service';
	import {
		canFastSwitchDeviceAccount,
		getDeviceAccounts,
		rememberDeviceAccount,
		removeDeviceAccount,
		type DeviceAccount
	} from '$lib/services/device-accounts.service';
	import { goBack } from '$lib/utils/navigation';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';

	let profile = $state<UserProfile | null>(null);
	let loading = $state(true);
	let error = $state('');

	let canChangePassword = $state(false);
	let resetLoading = $state(false);
	let resetSent = $state(false);

	let privacySaving = $state(false);

	let notificationsEnabled = $state(true);
	let selectedLanguage = $state('en');

	let showAccountSwitcher = $state(false);
	let deviceAccounts = $state<DeviceAccount[]>([]);
	let switchingAccountId = $state<string | null>(null);
	let logoutLoading = $state(false);

	async function loadSettings() {
		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto(resolve('/login'));
			return;
		}

		loading = true;
		error = '';

		try {
			profile = await ensureUserProfile(currentUser);
			canChangePassword = currentUser.providerData.some((p) => p.providerId === 'password');
			deviceAccounts = rememberDeviceAccount(profile, currentUser);
			deviceAccounts = getDeviceAccounts();
		} catch (err) {
			console.error('Settings load error:', err);
			error = getFriendlyErrorMessage(err, 'Could not load settings.');
		} finally {
			loading = false;
		}
	}

	async function handleSendPasswordReset() {
		if (!profile?.email) return;

		resetLoading = true;
		resetSent = false;
		error = '';

		try {
			await authService.sendPasswordReset(profile.email);
			resetSent = true;
		} catch (err) {
			console.error('Send password reset error:', err);
			error = getFriendlyErrorMessage(err, 'Could not send the reset email.');
		} finally {
			resetLoading = false;
		}
	}

	async function handleTogglePrivate() {
		if (!profile) return;

		const nextValue = !profile.isPrivate;
		privacySaving = true;
		error = '';

		try {
			await updateUserPrivacy(profile.id, nextValue);
			profile = { ...profile, isPrivate: nextValue };
		} catch (err) {
			console.error('Update privacy error:', err);
			error = getFriendlyErrorMessage(err, 'Could not update your privacy setting.');
		} finally {
			privacySaving = false;
		}
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
			await goto('/login?returnTo=/dashboard&mode=addAccount');
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
				const switchedUser = await authService.signInWithGoogle();

				if (switchedUser.uid !== account.id) {
					deviceAccounts = getDeviceAccounts();
					error = `You signed in as ${switchedUser.email ?? 'another account'}. Choose ${account.email} to switch to ${account.displayName}.`;
					return;
				}

				const switchedProfile = await ensureUserProfile(switchedUser);
				deviceAccounts = rememberDeviceAccount(switchedProfile, switchedUser);
				showAccountSwitcher = false;
				await goto(getPostSwitchHref(deviceAccounts.find((item) => item.id === switchedUser.uid) ?? account));
				return;
			}

			await authService.logout();
			showAccountSwitcher = false;
			await goto(
				`/login?returnTo=${encodeURIComponent(getPostSwitchHref(account))}&email=${encodeURIComponent(account.email)}&switchAccount=${encodeURIComponent(account.id)}`
			);
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

	function getPostSwitchHref(account?: DeviceAccount | null) {
		if (account?.accountType === 'organization' && account.activeOrganizationId) {
			return `/organizations/${account.activeOrganizationId}/manage`;
		}
		return '/dashboard';
	}

	onMount(() => {
		void loadSettings();
	});
</script>

<div class="mx-auto w-full max-w-2xl space-y-4 px-4 py-5 sm:px-5 sm:py-8">
	<button
		type="button"
		onclick={() => goBack(resolve('/profile'))}
		class="inline-flex rounded-full bg-blue-100 px-5 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
	>
		← Back
	</button>

	<div>
		<h1 class="text-3xl font-black text-slate-950 dark:text-slate-50">Settings</h1>
		<p class="mt-1 text-slate-500 dark:text-slate-400">
			Notifications, appearance, language, privacy and account.
		</p>
	</div>

	{#if error}
		<div
			class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
		>
			{error}
		</div>
	{/if}

	{#if loading}
		<p class="font-bold text-slate-500 dark:text-slate-400">Loading settings...</p>
	{:else}
		<section>
			<p class="mb-2 text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
				App
			</p>

			<div
				class="divide-y divide-slate-200 overflow-hidden rounded-3xl bg-slate-50 dark:divide-slate-700 dark:bg-slate-800"
			>
				<div class="flex items-center justify-between gap-4 p-4">
					<div>
						<p class="font-black text-slate-950 dark:text-slate-50">Notifications</p>
						<p class="text-xs text-slate-500 dark:text-slate-400">
							Event invites, messages and friend requests.
						</p>
					</div>
					<button
						type="button"
						onclick={() => (notificationsEnabled = !notificationsEnabled)}
						class={`relative h-7 w-12 rounded-full transition ${notificationsEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
						aria-label="Toggle notifications"
					>
						<span
							class={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${notificationsEnabled ? 'left-6' : 'left-1'}`}
						></span>
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

					<a
						href={resolve('/saved-events')}
						class="flex items-center justify-between gap-4 p-4 transition hover:bg-slate-100 dark:hover:bg-slate-700"
					>
						<span>
							<span class="block font-black text-slate-950 dark:text-slate-50">Saved events</span>
							<span class="block text-xs text-slate-500 dark:text-slate-400">
								Review the events you bookmarked.
							</span>
						</span>
						<span class="text-slate-300">›</span>
					</a>
				</div>
			</section>

		{#if profile?.accountType === 'organization' && profile.activeOrganizationId}
			<section>
				<p class="mb-2 text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
					Organization
				</p>

				<div
					class="divide-y divide-slate-200 overflow-hidden rounded-3xl bg-slate-50 dark:divide-slate-700 dark:bg-slate-800"
				>
					<a
						href={resolve(`/organizations/${profile.activeOrganizationId}/manage`)}
						class="flex items-center justify-between gap-4 p-4 transition hover:bg-slate-100 dark:hover:bg-slate-700"
					>
						<span>
							<span class="block font-black text-slate-950 dark:text-slate-50">
								Manage organization
							</span>
							<span class="block text-xs text-slate-500 dark:text-slate-400">
								Edit profile, verification, events and promotions.
							</span>
						</span>
						<span class="text-slate-300">›</span>
					</a>

					<a
						href={resolve(`/organizations/${profile.activeOrganizationId}/manage#upcoming-events`)}
						class="flex items-center justify-between gap-4 p-4 transition hover:bg-slate-100 dark:hover:bg-slate-700"
					>
						<span>
							<span class="block font-black text-slate-950 dark:text-slate-50">
								Promote events
							</span>
							<span class="block text-xs text-slate-500 dark:text-slate-400">
								Choose an organization event to boost.
							</span>
						</span>
						<span class="text-slate-300">›</span>
					</a>
				</div>
			</section>
		{/if}

		<section>
			<p class="mb-2 text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
				Privacy
			</p>

			<div class="overflow-hidden rounded-3xl bg-slate-50 dark:bg-slate-800">
				<div class="flex items-center justify-between gap-4 p-4">
					<div>
						<p class="font-black text-slate-950 dark:text-slate-50">Make your profile private</p>
						<p class="text-xs text-slate-500 dark:text-slate-400">
							Only people you've shared an event with will be able to view your profile.
						</p>
					</div>
					<button
						type="button"
						onclick={handleTogglePrivate}
						disabled={privacySaving}
						class={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${profile?.isPrivate ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
						aria-label="Toggle private profile"
					>
						<span
							class={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${profile?.isPrivate ? 'left-6' : 'left-1'}`}
						></span>
					</button>
				</div>
			</div>
		</section>

		<section>
			<p class="mb-2 text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
				Security
			</p>

			<div class="overflow-hidden rounded-3xl bg-slate-50 dark:bg-slate-800">
				{#if canChangePassword}
					<div class="flex items-center justify-between gap-4 p-4">
						<div>
							<p class="font-black text-slate-950 dark:text-slate-50">Change password</p>
							<p class="text-xs text-slate-500 dark:text-slate-400">
								{#if resetSent}
									Check your inbox for a link to set a new password.
								{:else}
									We'll email you a link to set a new password.
								{/if}
							</p>
						</div>
						<button
							type="button"
							onclick={handleSendPasswordReset}
							disabled={resetLoading}
							class="shrink-0 rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-60 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-700"
						>
							{resetLoading ? 'Sending...' : resetSent ? 'Resend' : 'Send reset email'}
						</button>
					</div>
				{:else}
					<div class="p-4">
						<p class="font-black text-slate-950 dark:text-slate-50">Change password</p>
						<p class="text-xs text-slate-500 dark:text-slate-400">
							This account signs in with Google, so there's no Rally password to change.
						</p>
					</div>
				{/if}
			</div>
		</section>

		<section>
			<div class="mb-2 flex items-center justify-between gap-3">
				<p class="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
					Account
				</p>
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
											<p class="truncate font-black text-slate-950 dark:text-slate-50">
												{account.displayName}
											</p>
											{#if account.accountType === 'organization'}
												<span
													class="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[0.65rem] font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300"
													>Org</span
												>
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
									<span
										class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white"
										>✓</span
									>
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
						<span
							class="flex h-11 w-11 items-center justify-center rounded-full bg-white text-2xl font-light text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200"
							>+</span
						>
						<span>
							<span class="block font-black text-slate-950 dark:text-slate-50"
								>Add another account</span
							>
							<span class="block text-xs text-slate-500 dark:text-slate-400"
								>It will be saved on this device.</span
							>
						</span>
					</button>

					<div class="px-4 pb-4 pt-1">
						<p class="text-[0.7rem] leading-relaxed text-slate-400 dark:text-slate-500">
							Google accounts can quick switch. Email/password accounts still require the
							password for security.
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
							<p class="truncate font-black text-slate-950 dark:text-slate-50">
								{profile?.displayName}
							</p>
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
	{/if}
</div>
