<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authService } from '$lib/services/auth.service';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import {
		shouldRequireTwoFactor,
		startEmailTwoFactorChallenge
	} from '$lib/services/two-factor.service';

	let loading = $state(false);
	let error = $state('');

	async function handleGoogleSignIn() {
		error = '';
		loading = true;

		try {
			const returnTo = page.url.searchParams.get('returnTo');
			const safeReturnTo = returnTo?.startsWith('/') ? returnTo : '/dashboard';
			const { user, profile } = await authService.signInWithGoogle();

			if (shouldRequireTwoFactor(profile)) {
				await startEmailTwoFactorChallenge({
					email: user.email ?? '',
					returnTo: safeReturnTo
				});
				await goto(`/verify-2fa?sent=1&returnTo=${encodeURIComponent(safeReturnTo)}`);
				return;
			}

			await goto(safeReturnTo);
		} catch (err) {
			console.error('Google sign-in error:', err);
			error = getFriendlyErrorMessage(err, 'Could not continue with Google.');
		} finally {
			loading = false;
		}
	}
</script>

<div>
	<button
		type="button"
		onclick={handleGoogleSignIn}
		disabled={loading}
		class="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
	>
		<img
			src="/google-logo.png"
			alt="Google"
			class="h-5 w-5 object-contain"
		/>

		<span>
			{loading ? 'Continuing...' : 'Continue with Google'}
		</span>
	</button>

	{#if error}
		<div
			class="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
		>
			{error}
		</div>
	{/if}
</div>
