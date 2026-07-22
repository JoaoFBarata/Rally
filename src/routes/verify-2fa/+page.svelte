<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import RallyLogo from '$lib/components/RallyLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { i18n } from '$lib/services/i18n.svelte';
	import { getPublicAppBaseUrl } from '$lib/utils/app-url';
	import { authState } from '$lib/auth.svelte';
	import {
		completeEmailTwoFactorChallenge,
		currentUrlIsEmailTwoFactorLink,
		getPendingTwoFactorChallenge,
		normalizeTwoFactorReturnTo,
		startEmailTwoFactorChallenge,
		TWO_FACTOR_COMPLETED_KEY
	} from '$lib/services/two-factor.service';

	let loading = $state(true);
	let resending = $state(false);
	let error = $state('');
	let success = $state('');
	let pendingEmail = $state('');
	let confirmationEmail = $state('');
	let needsEmailConfirmation = $state(false);
	let verifiedReturnTo = $state('');
	let completedReturnTo = $state('');
	let processingUrl = false;
	let lastProcessedLink = '';

	function removeConsumedCodeFromAddressBar() {
		const cleanUrl = new URL('/verify-2fa', window.location.origin);
		cleanUrl.searchParams.set('verified', '1');
		cleanUrl.searchParams.set('returnTo', verifiedReturnTo || '/dashboard');
		window.history.replaceState(window.history.state, '', cleanUrl);
	}

	const returnTo = $derived(normalizeTwoFactorReturnTo(page.url.searchParams.get('returnTo')));

	$effect(() => {
		if (
			!authState.loading &&
			authState.user &&
			!verifiedReturnTo &&
			!currentUrlIsEmailTwoFactorLink()
		) {
			void goto(completedReturnTo || returnTo, { replaceState: true });
		}
	});

	async function processCurrentUrl() {
		if (!currentUrlIsEmailTwoFactorLink()) return;

		const link = window.location.href;
		if (processingUrl || lastProcessedLink === link) return;
		processingUrl = true;
		lastProcessedLink = link;
		loading = true;
		error = '';
		success = '';

		try {
			const pending = getPendingTwoFactorChallenge();
			pendingEmail = pending?.email ?? '';
			if (!pending) {
				needsEmailConfirmation = true;
				return;
			}

			const result = await completeEmailTwoFactorChallenge();
			verifiedReturnTo = result.returnTo || returnTo;
			removeConsumedCodeFromAddressBar();
			await goto(verifiedReturnTo, { replaceState: true });
		} catch (err) {
			console.error('Two-factor verification error:', err);
			error = getFriendlyErrorMessage(err, 'Could not verify this login.');
		} finally {
			processingUrl = false;
			loading = false;
		}
	}

	onMount(() => {
		const publicAppUrl = new URL(getPublicAppBaseUrl());
		if (
			currentUrlIsEmailTwoFactorLink() &&
			window.location.origin !== publicAppUrl.origin
		) {
			const canonicalUrl = new URL(
				`${window.location.pathname}${window.location.search}${window.location.hash}`,
				publicAppUrl
			);
			window.location.replace(canonicalUrl.toString());
			return;
		}

		function handleCompletedChallenge(event: StorageEvent) {
			if (event.key !== TWO_FACTOR_COMPLETED_KEY || !event.newValue) return;

			try {
				const completed = JSON.parse(event.newValue) as { returnTo?: string };
				completedReturnTo = normalizeTwoFactorReturnTo(completed.returnTo);
				if (authState.user) void goto(completedReturnTo, { replaceState: true });
			} catch {
				completedReturnTo = returnTo;
				if (authState.user) void goto(returnTo, { replaceState: true });
			}
		}
		const handleAppUrlOpened = () => void processCurrentUrl();

		window.addEventListener('storage', handleCompletedChallenge);
		window.addEventListener('rally:app-url-opened', handleAppUrlOpened);

		void (async () => {
			error = '';
			success = '';

			try {
				const pending = getPendingTwoFactorChallenge();
				pendingEmail = pending?.email ?? '';

				if (currentUrlIsEmailTwoFactorLink()) {
					await processCurrentUrl();
					return;
				}

				if (page.url.searchParams.get('sent')) {
					success = 'We sent a verification link to your email. Open it to continue.';
				} else if (!pending) {
					error = 'No active two-factor verification found. Log in again to request a new link.';
				}
			} catch (err) {
				console.error('Two-factor verification error:', err);
				error = getFriendlyErrorMessage(err, 'Could not verify this login.');
			} finally {
				loading = false;
			}
		})();

		return () => {
			window.removeEventListener('storage', handleCompletedChallenge);
			window.removeEventListener('rally:app-url-opened', handleAppUrlOpened);
		};
	});

	async function handleEmailConfirmation() {
		const email = confirmationEmail.trim();
		if (!email) {
			error = 'Enter the same email address used to log in.';
			return;
		}

		loading = true;
		error = '';
		try {
			const result = await completeEmailTwoFactorChallenge({ email, returnTo });
			verifiedReturnTo = result.returnTo || returnTo;
			needsEmailConfirmation = false;
			removeConsumedCodeFromAddressBar();
			await goto(verifiedReturnTo, { replaceState: true });
		} catch (err) {
			console.error('Two-factor email confirmation error:', err);
			error = getFriendlyErrorMessage(err, 'Could not verify this login. Check the email and try again.');
		} finally {
			loading = false;
		}
	}

	async function handleResend() {
		const pending = getPendingTwoFactorChallenge();
		if (!pending) {
			error = 'This verification expired. Log in again to request a new link.';
			return;
		}

		resending = true;
		error = '';
		success = '';

		try {
			await startEmailTwoFactorChallenge({
				email: pending.email,
				returnTo: pending.returnTo
			});
			success = 'A fresh verification link was sent to your email.';
		} catch (err) {
			console.error('Resend 2FA link error:', err);
			error = getFriendlyErrorMessage(err, 'Could not send a new verification link.');
		} finally {
			resending = false;
		}
	}
</script>

<main class="min-h-screen bg-slate-50 dark:bg-slate-950">
	<section class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-8">
		<div class="mb-8 flex items-center justify-between gap-3">
			<RallyLogo size="md" href="/" />
			<ThemeToggle />
		</div>

		<div
			class="rounded-4xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
		>
			<p class="text-xs font-black uppercase tracking-[0.28em] text-blue-600 dark:text-blue-300">
				Two-factor authentication
			</p>
			<h1 class="mt-2 text-3xl font-black text-slate-950 dark:text-slate-50">Verify this login</h1>
			<p class="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
				Open the secure link we sent to your email. This proves it is really you before Rally
				opens your account.
			</p>
			<p class="mt-2 text-sm font-bold text-amber-700 dark:text-amber-300">
				{i18n.t('check_spam_folder')}
			</p>

			{#if loading}
				<div class="mt-8 flex items-center gap-3 text-sm font-bold text-slate-500">
					<span class="h-5 w-5 animate-spin rounded-full border-2 border-blue-100 border-t-blue-600"></span>
					Checking verification...
				</div>
			{:else}
				{#if needsEmailConfirmation}
					<div class="mt-6 rounded-3xl border border-blue-200 bg-blue-50 p-4 text-left dark:border-blue-900/60 dark:bg-blue-950/40">
						<label for="two-factor-email" class="text-sm font-black text-slate-950 dark:text-slate-50">
							Confirm your account email
						</label>
						<p class="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
							The link opened in a different browser or app. Enter the same email used to log in.
						</p>
						<input
							id="two-factor-email"
							type="email"
							bind:value={confirmationEmail}
							autocomplete="email"
							class="mt-3 w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-blue-900 dark:bg-slate-900 dark:text-slate-50"
							placeholder="you@example.com"
						/>
						<button
							type="button"
							onclick={handleEmailConfirmation}
							class="mt-3 w-full rounded-2xl bg-blue-600 px-5 py-3 font-black text-white transition hover:bg-blue-700"
						>
							Verify login
						</button>
					</div>
				{/if}

				{#if success}
					<div
						class="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
					>
						{success}
					</div>
				{/if}

				{#if error}
					<div
						class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
					>
						{error}
					</div>
				{/if}

				<div class="mt-6 space-y-3">
					<div
						class="rounded-3xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/40"
					>
						<div class="flex items-center justify-between gap-3">
							<div>
								<p class="font-black text-slate-950 dark:text-slate-50">Email link</p>
								<p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
									{pendingEmail || 'Your account email'}
								</p>
							</div>
							<span class="rounded-full bg-blue-600 px-3 py-1 text-xs font-black text-white">
								Ready
							</span>
						</div>
					</div>
				</div>

				<div class="mt-7 flex flex-col gap-3">
					{#if verifiedReturnTo}
						<a
							href={verifiedReturnTo}
							class="rounded-2xl bg-blue-600 px-5 py-3 text-center font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
						>
							Continue to Rally
						</a>
					{:else}
					<button
						type="button"
						onclick={handleResend}
						disabled={resending || !pendingEmail}
						class="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
					>
						{resending ? 'Sending...' : 'Send link again'}
					</button>
					{/if}
					<a
						href="/login"
						class="rounded-2xl border border-slate-200 px-5 py-3 text-center font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
					>
						Back to login
					</a>
				</div>
			{/if}
		</div>
	</section>
</main>
