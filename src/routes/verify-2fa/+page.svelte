<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import RallyLogo from '$lib/components/RallyLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import {
		completeEmailTwoFactorChallenge,
		currentUrlIsEmailTwoFactorLink,
		getPendingTwoFactorChallenge,
		startEmailTwoFactorChallenge,
		TWO_FACTOR_COMPLETED_KEY
	} from '$lib/services/two-factor.service';

	let loading = $state(true);
	let resending = $state(false);
	let error = $state('');
	let success = $state('');
	let pendingEmail = $state('');
	let verifiedReturnTo = $state('');

	const returnTo = $derived(
		page.url.searchParams.get('returnTo')?.startsWith('/')
			? page.url.searchParams.get('returnTo')!
			: '/dashboard'
	);

	onMount(() => {
		function handleCompletedChallenge(event: StorageEvent) {
			if (event.key !== TWO_FACTOR_COMPLETED_KEY || !event.newValue) return;

			try {
				const completed = JSON.parse(event.newValue) as { returnTo?: string };
				const destination = completed.returnTo?.startsWith('/') ? completed.returnTo : returnTo;
				void goto(destination);
			} catch {
				void goto(returnTo);
			}
		}

		window.addEventListener('storage', handleCompletedChallenge);

		void (async () => {
			error = '';
			success = '';

			try {
				const pending = getPendingTwoFactorChallenge();
				pendingEmail = pending?.email ?? '';

				if (currentUrlIsEmailTwoFactorLink()) {
					const result = await completeEmailTwoFactorChallenge();
					verifiedReturnTo = result.returnTo || returnTo;
					success = 'Login verified. You can return to the Rally tab you already had open.';

					window.setTimeout(() => window.close(), 500);
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

		return () => window.removeEventListener('storage', handleCompletedChallenge);
	});

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

			{#if loading}
				<div class="mt-8 flex items-center gap-3 text-sm font-bold text-slate-500">
					<span class="h-5 w-5 animate-spin rounded-full border-2 border-blue-100 border-t-blue-600"></span>
					Checking verification...
				</div>
			{:else}
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
