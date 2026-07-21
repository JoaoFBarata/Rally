<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import RallyLogo from '$lib/components/RallyLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import GoogleSignInButton from '$lib/components/GoogleSignInButton.svelte';
	import { authService } from '$lib/services/auth.service';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { goBack } from '$lib/utils/navigation';
	import { themeState } from '$lib/theme.svelte';
	import { i18n } from '$lib/services/i18n.svelte';
	import {
		shouldRequireTwoFactor,
		startEmailTwoFactorChallenge
	} from '$lib/services/two-factor.service';

	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let resetLoading = $state(false);
	let error = $state('');
	let success = $state('');
	let switchingAccount = $state(false);
	let passwordInput = $state<HTMLInputElement | null>(null);
	let showPassword = $state(false);

	async function handleLogin() {
		error = '';
		success = '';
		loading = true;

		try {
			const returnTo = page.url.searchParams.get('returnTo');
			const safeReturnTo = returnTo?.startsWith('/') ? returnTo : '/dashboard';
			const result = await authService.login(email, password);

			if (shouldRequireTwoFactor(result.profile)) {
				await startEmailTwoFactorChallenge({
					email: result.user.email ?? email,
					returnTo: safeReturnTo
				});
				await goto(`/verify-2fa?sent=1&returnTo=${encodeURIComponent(safeReturnTo)}`);
				return;
			}

			await goto(safeReturnTo);
		} catch (err) {
			console.error('Login error:', err);
			if (err instanceof Error && err.message.includes('auth/email-not-verified')) {
				await goto('/verify-email');
				return;
			}
			const friendly = getFriendlyErrorMessage(err, i18n.t('login_error'));
			error = friendly.includes('auth/operation-not-allowed')
				? i18n.t('email_link_not_enabled')
				: friendly;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		const accountEmail = page.url.searchParams.get('email');
		switchingAccount = Boolean(
			page.url.searchParams.get('switchAccount') ||
			page.url.searchParams.get('mode') === 'addAccount'
		);

		if (accountEmail) {
			email = accountEmail;
			void tick().then(() => passwordInput?.focus());
		}
	});

	async function handlePasswordReset() {
		error = '';
		success = '';

		if (!email.trim()) {
			error = i18n.t('enter_email_reset');
			return;
		}

		resetLoading = true;

		try {
			await authService.sendPasswordReset(email.trim());
			success = i18n.t('reset_email_sent');
		} catch (err) {
			console.error('Password reset error:', err);
			error = getFriendlyErrorMessage(err, i18n.t('reset_email_error'));
		} finally {
			resetLoading = false;
		}
	}
</script>

<main
	class="min-h-dvh bg-white dark:bg-slate-900 lg:min-h-screen lg:bg-slate-50 lg:dark:bg-slate-950"
>
	<section
		class="mx-auto grid min-h-dvh max-w-6xl items-stretch lg:min-h-screen lg:grid-cols-2 lg:items-center lg:gap-10 lg:px-6 lg:py-8"
	>
		<div class="hidden lg:block">
			<div>
				<div class="flex items-center gap-3">
					<RallyLogo size="lg" href="/" />
					<ThemeToggle />
				</div>

				<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">{i18n.t('find_your_game')}</p>
			</div>

			<h1
				class="mt-8 text-6xl font-black leading-tight tracking-tight text-slate-950 dark:text-slate-50"
			>
				{i18n.t('welcome_back')}
			</h1>

			<p class="mt-5 max-w-lg text-lg leading-8 text-slate-600 dark:text-slate-400">
				{i18n.t('login_intro')}
			</p>
		</div>

		<div class="mx-auto flex min-h-dvh w-full max-w-none flex-col lg:block lg:min-h-0 lg:max-w-md">
			<div class="mb-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:hidden">
				<div class="flex items-center gap-3">
					<RallyLogo size="md" href="/" />
					<ThemeToggle />
				</div>

				<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">{i18n.t('find_your_game')}</p>
			</div>

			<div
				class="flex-1 bg-white px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5 dark:bg-slate-900 sm:mx-5 sm:mb-5 sm:rounded-4xl sm:border sm:border-slate-200 sm:p-8 sm:shadow-xl sm:shadow-slate-200/60 sm:dark:border-slate-800 sm:dark:shadow-none lg:m-0 lg:flex-none"
			>
				<h1 class="text-3xl font-black text-slate-950 dark:text-slate-50">
					{i18n.t('login_title')}
				</h1>
				<p class="mt-2 text-slate-500 dark:text-slate-400">
					{switchingAccount ? i18n.t('choose_account_login') : i18n.t('continue_to_rally')}
				</p>

				<div class="mt-8">
					<GoogleSignInButton />
				</div>

				<div class="my-6 flex items-center gap-3">
					<div class="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
					<span class="text-xs font-bold uppercase tracking-wide text-slate-400">
						{i18n.t('or')}
					</span>
					<div class="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
				</div>

				{#if error}
					<div
						class="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
					>
						{error}
					</div>
				{/if}

				{#if success}
					<div
						class="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
					>
						{success}
					</div>
				{/if}

				<form
					class="space-y-5"
					onsubmit={(e) => {
						e.preventDefault();
						handleLogin();
					}}
				>
					<div>
						<label for="email" class="text-sm font-semibold text-slate-700 dark:text-slate-300">
							Email
						</label>

						<input
							id="email"
							type="email"
							bind:value={email}
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-slate-50 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							placeholder="you@example.com"
						/>
					</div>

					<div>
						<div class="flex items-center justify-between gap-3">
							<label
								for="password"
								class="text-sm font-semibold text-slate-700 dark:text-slate-300"
							>
								{i18n.t('password')}
							</label>

							<button
								type="button"
								onclick={handlePasswordReset}
								disabled={resetLoading}
								class="text-sm font-bold text-blue-600 hover:text-blue-700 disabled:opacity-60 dark:text-blue-400 dark:hover:text-blue-300"
							>
								{resetLoading ? i18n.t('sending') : i18n.t('forgot_password')}
							</button>
						</div>

						<div class="relative mt-2">
							<input
								id="password"
								bind:this={passwordInput}
								type={showPassword ? 'text' : 'password'}
								bind:value={password}
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-4 pr-12 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-slate-50 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
								placeholder="••••••••"
							/>
							<button
								type="button"
								onclick={() => (showPassword = !showPassword)}
								class="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition"
							>
								{#if showPassword}
									<img
										src="/eye_open.png"
										alt={i18n.t('show_password')}
										class="h-5 w-5 object-contain"
										class:invert={$themeState}
									/>
								{:else}
									<img
										src="/eye_closed.png"
										alt={i18n.t('hide_password')}
										class="h-5 w-5 object-contain"
										class:invert={$themeState}
									/>
								{/if}
							</button>
						</div>
					</div>

					<button
						type="submit"
						disabled={loading}
						class="w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60 dark:shadow-blue-950/40"
					>
						{loading ? i18n.t('logging_in') : i18n.t('login_title')}
					</button>
				</form>

				<p class="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
					{i18n.t('dont_have_account')}
					<a
						href="/register"
						class="font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
					>
						{i18n.t('create_one')}
					</a>
				</p>
			</div>

			<button
				type="button"
				onclick={() => goBack('/')}
				class="mt-6 hidden text-center text-sm font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 lg:block"
			>
				← {i18n.t('home')}
			</button>
		</div>
	</section>
</main>
