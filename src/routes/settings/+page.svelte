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
	import {
		ensureUserProfile,
		updateUserPrivacy,
		updateUserLanguage,
		updateUserTwoFactorSettings
	} from '$lib/services/user.service';
	import { i18n } from '$lib/services/i18n.svelte';
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
	let twoFactorSaving = $state(false);

	let notificationsEnabled = $state(true);
	let selectedLanguage = $state<string>(i18n.currentLang);

	$effect(() => {
		if (profile?.language) {
			selectedLanguage = profile.language;
		}
	});

	async function handleLanguageChange(lang: string) {
		selectedLanguage = lang;
		i18n.setLanguage(lang as any);
		if (profile) {
			try {
				await updateUserLanguage(profile.id, lang);
				profile.language = lang;
			} catch (err) {
				console.error('Failed to update language in profile:', err);
			}
		}
	}

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

	async function handleToggleTwoFactor() {
		if (!profile) return;

		const nextEnabled = !profile.twoFactorEnabled;
		twoFactorSaving = true;
		error = '';

		try {
			await updateUserTwoFactorSettings(profile.id, {
				enabled: nextEnabled,
				methods: nextEnabled ? ['email'] : [],
				preferredMethod: 'email'
			});

			profile = {
				...profile,
				twoFactorEnabled: nextEnabled,
				twoFactorMethods: nextEnabled ? ['email'] : [],
				twoFactorPreferredMethod: 'email'
			};
		} catch (err) {
			console.error('Update two-factor settings error:', err);
			error = getFriendlyErrorMessage(err, 'Could not update two-factor authentication.');
		} finally {
			twoFactorSaving = false;
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
		class="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
	>
		<span class="leading-none">←</span>
		<span>{i18n.t('back')}</span>
	</button>

	<div>
		<h1 class="text-3xl font-black text-slate-950 dark:text-slate-50">{i18n.t('settings_title')}</h1>
		<p class="mt-1 text-slate-500 dark:text-slate-400">
			{i18n.t('settings_sub')}
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
		<p class="font-bold text-slate-500 dark:text-slate-400">{i18n.t('loading_settings')}</p>
	{:else}
		<section>
			<p class="mb-2 text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
				{i18n.t('app')}
			</p>

			<div
				class="divide-y divide-slate-200 overflow-hidden rounded-3xl bg-slate-50 dark:divide-slate-700 dark:bg-slate-800"
			>
				<div class="flex items-center justify-between gap-4 p-4">
					<div>
						<p class="font-black text-slate-950 dark:text-slate-50">{i18n.t('notifications')}</p>
						<p class="text-xs text-slate-500 dark:text-slate-400">
							{i18n.t('notifications_sub')}
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
						<p class="font-black text-slate-950 dark:text-slate-50">{i18n.t('appearance')}</p>
						<p class="text-xs text-slate-500 dark:text-slate-400">{i18n.t('appearance_sub')}</p>
					</div>
					<ThemeToggle />
				</div>

					<label class="flex items-center justify-between gap-4 p-4">
						<div>
							<p class="font-black text-slate-950 dark:text-slate-50">{i18n.t('language')}</p>
							<p class="text-xs text-slate-500 dark:text-slate-400">{i18n.t('select_language')}</p>
						</div>
					<select
						value={selectedLanguage}
						onchange={(e) => handleLanguageChange(e.currentTarget.value)}
						class="rounded-2xl border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
					>
						<option value="en">English</option>
						<option value="pt">Português</option>
						<option value="es">Español</option>
						<option value="fr">Français</option>
					</select>
					</label>

					<a
						href={resolve('/saved-events')}
						class="flex items-center justify-between gap-4 p-4 transition hover:bg-slate-100 dark:hover:bg-slate-700"
					>
						<span>
							<span class="block font-black text-slate-950 dark:text-slate-50">{i18n.t('saved_events')}</span>
							<span class="block text-xs text-slate-500 dark:text-slate-400">
								{i18n.t('saved_events_sub')}
							</span>
						</span>
						<span class="text-slate-300">›</span>
					</a>
				</div>
			</section>

		{#if profile?.accountType === 'organization' && profile.activeOrganizationId}
			<section>
				<p class="mb-2 text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
					{i18n.t('organization')}
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
								{i18n.t('manage_org')}
							</span>
							<span class="block text-xs text-slate-500 dark:text-slate-400">
								{i18n.t('manage_org_sub')}
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
								{i18n.t('promote_events')}
							</span>
							<span class="block text-xs text-slate-500 dark:text-slate-400">
								{i18n.t('promote_events_sub')}
							</span>
						</span>
						<span class="text-slate-300">›</span>
					</a>
				</div>
			</section>
		{/if}

		<section>
			<p class="mb-2 text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
				{i18n.t('privacy')}
			</p>

			<div class="overflow-hidden rounded-3xl bg-slate-50 dark:bg-slate-800">
				<div class="flex items-center justify-between gap-4 p-4">
					<div>
						<p class="font-black text-slate-950 dark:text-slate-50">{i18n.t('private_profile')}</p>
						<p class="text-xs text-slate-500 dark:text-slate-400">
							{i18n.t('private_profile_sub')}
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
				{i18n.t('security')}
			</p>

			<div class="overflow-hidden rounded-3xl bg-slate-50 dark:bg-slate-800">
				<div class="border-b border-slate-200 p-4 dark:border-slate-700">
					<div class="flex items-start justify-between gap-4">
						<div>
							<p class="font-black text-slate-950 dark:text-slate-50">
								{i18n.t('two_factor_authentication')}
							</p>
							<p class="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
								{i18n.t('two_factor_email_sub')}
							</p>
						</div>
						<button
							type="button"
							onclick={handleToggleTwoFactor}
							disabled={twoFactorSaving}
							class={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${profile?.twoFactorEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
							aria-label={i18n.t('toggle_two_factor_authentication')}
						>
							<span
								class={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${profile?.twoFactorEnabled ? 'left-6' : 'left-1'}`}
							></span>
						</button>
					</div>

					{#if profile?.twoFactorEnabled}
						<div
							class="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold leading-5 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
						>
							{i18n.t('two_factor_email_active')}
						</div>
					{/if}
				</div>

				{#if canChangePassword}
					<div class="flex items-center justify-between gap-4 p-4">
						<div>
							<p class="font-black text-slate-950 dark:text-slate-50">{i18n.t('change_password')}</p>
							<p class="text-xs text-slate-500 dark:text-slate-400">
								{#if resetSent}
									{i18n.t('password_reset_sent')}
								{:else}
									{i18n.t('password_reset_will_send')}
								{/if}
							</p>
						</div>
						<button
							type="button"
							onclick={handleSendPasswordReset}
							disabled={resetLoading}
							class="shrink-0 rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-60 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-700"
						>
							{resetLoading ? i18n.t('sending') : resetSent ? i18n.t('resend') : i18n.t('send_reset_email')}
						</button>
					</div>
				{:else}
					<div class="p-4">
						<p class="font-black text-slate-950 dark:text-slate-50">{i18n.t('change_password')}</p>
						<p class="text-xs text-slate-500 dark:text-slate-400">
							{i18n.t('google_no_password_msg')}
						</p>
					</div>
				{/if}
			</div>
		</section>

		<section>
			<div class="mb-2 flex items-center justify-between gap-3">
				<p class="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
					{i18n.t('account')}
				</p>
				{#if showAccountSwitcher}
					<button
						type="button"
						onclick={() => (showAccountSwitcher = false)}
						class="text-xs font-black text-blue-600 dark:text-blue-400"
					>
						{i18n.t('back')}
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
													{i18n.t('switching')}
												{:else if canFastSwitchDeviceAccount(account)}
													{i18n.t('quick_switch_google')}
												{:else}
													{i18n.t('password_required')}
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
										aria-label={i18n.t('forget_account_aria')}
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
								>{i18n.t('add_another_account')}</span
							>
							<span class="block text-xs text-slate-500 dark:text-slate-400"
								>{i18n.t('saved_on_device_msg')}</span
							>
						</span>
					</button>

					<div class="px-4 pb-4 pt-1">
						<p class="text-[0.7rem] leading-relaxed text-slate-400 dark:text-slate-500">
							{i18n.t('switch_account_footer_note')}
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
							{i18n.t('switch')}
						</button>

						<button
							onclick={handleLogout}
							disabled={logoutLoading}
							class="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-950 dark:hover:bg-slate-200"
						>
							{logoutLoading ? '...' : i18n.t('logout')}
						</button>
					</div>
				</div>
			{/if}
		</section>
	{/if}
</div>
