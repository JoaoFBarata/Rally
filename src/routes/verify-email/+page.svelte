<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authState } from '$lib/auth.svelte';
	import RallyLogo from '$lib/components/RallyLogo.svelte';
	import { authService } from '$lib/services/auth.service';
	import { i18n } from '$lib/services/i18n.svelte';

	let loading = $state(false);
	let resending = $state(false);
	let error = $state('');
	let success = $state('');

	onMount(() => {
		if (sessionStorage.getItem('rally:verification-email-send-failed') === '1') {
			error = i18n.t('verification_email_error');
		}
	});

	async function checkVerification() {
		error = '';
		success = '';
		loading = true;

		try {
			await authState.refresh();
			if (authState.user?.emailVerified) {
				await goto('/dashboard');
				return;
			}
			error = i18n.t('email_still_not_verified');
		} finally {
			loading = false;
		}
	}

	async function resendVerification() {
		error = '';
		success = '';
		resending = true;

		try {
			await authService.sendVerificationEmail();
			success = i18n.t('verification_email_sent');
		} catch (err) {
			console.error('Verification email resend error:', err);
			error = i18n.t('verification_email_error');
		} finally {
			resending = false;
		}
	}

	async function useAnotherEmail() {
		await authService.logout();
		await goto('/login');
	}
</script>

<main class="flex min-h-dvh items-center justify-center bg-slate-50 px-5 py-10 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
	<section class="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:p-8">
		<div class="flex justify-center">
			<RallyLogo size="md" href="/" />
		</div>

		<div class="mx-auto mt-7 grid h-16 w-16 place-items-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="h-8 w-8" aria-hidden="true">
				<path d="M4 6h16v12H4z" />
				<path d="m4 7 8 6 8-6" />
			</svg>
		</div>

		<h1 class="mt-5 text-3xl font-black tracking-tight">{i18n.t('verify_email_title')}</h1>
		<p class="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
			{i18n.t('verify_email_sub')}
		</p>

		{#if authState.user?.email}
			<p class="mt-3 rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">
				{i18n.t('verify_email_sent_to', { email: authState.user.email })}
			</p>
		{/if}

		{#if error}
			<p class="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
				{error}
			</p>
		{/if}

		{#if success}
			<p class="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
				{success}
			</p>
		{/if}

		<div class="mt-6 grid gap-3">
			<button
				type="button"
				onclick={checkVerification}
				disabled={loading}
				class="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
			>
				{loading ? i18n.t('checking_email_verification') : i18n.t('i_verified_email')}
			</button>

			<button
				type="button"
				onclick={resendVerification}
				disabled={resending}
				class="rounded-2xl bg-slate-100 px-5 py-3 font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
			>
				{resending ? i18n.t('sending') : i18n.t('resend_verification_email')}
			</button>

			<button
				type="button"
				onclick={useAnotherEmail}
				class="text-sm font-black text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
			>
				{i18n.t('wrong_email_logout')}
			</button>
		</div>
	</section>
</main>
