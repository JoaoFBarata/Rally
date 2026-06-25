<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import RallyLogo from '$lib/components/RallyLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import GoogleSignInButton from '$lib/components/GoogleSignInButton.svelte';
	import { authService } from '$lib/services/auth.service';
	import { goBack } from '$lib/utils/navigation';

	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let resetLoading = $state(false);
	let error = $state('');
	let success = $state('');

	async function handleLogin() {
		error = '';
		success = '';
		loading = true;

		try {
			await authService.login(email, password);
			const returnTo = page.url.searchParams.get('returnTo');
			await goto(returnTo?.startsWith('/') ? returnTo : '/dashboard');
		} catch (err) {
			console.error('Login error:', err);

			if (err instanceof Error) {
				error = err.message;
			} else {
				error = 'Could not log in.';
			}
		} finally {
			loading = false;
		}
	}

	async function handlePasswordReset() {
		error = '';
		success = '';

		if (!email.trim()) {
			error = 'Write your email first, then tap forgot password.';
			return;
		}

		resetLoading = true;

		try {
			await authService.sendPasswordReset(email.trim());
			success = 'Password reset email sent. Check your inbox.';
		} catch (err) {
			console.error('Password reset error:', err);
			error = err instanceof Error ? err.message : 'Could not send password reset email.';
		} finally {
			resetLoading = false;
		}
	}
</script>

<main class="min-h-screen bg-slate-50 dark:bg-slate-950">
	<section class="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-8 lg:grid-cols-2">
		<div class="hidden lg:block">
			<div>
				<div class="flex items-center gap-3">
					<RallyLogo size="lg" href="/" />
					<ThemeToggle />
				</div>

				<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">Find your game.</p>
			</div>

			<h1
				class="mt-8 text-6xl font-black leading-tight tracking-tight text-slate-950 dark:text-slate-50"
			>
				Welcome back.
			</h1>

			<p class="mt-5 max-w-lg text-lg leading-8 text-slate-600 dark:text-slate-400">
				Access your account and manage your events, teams, and more. We’ve missed you!
			</p>
		</div>

		<div class="mx-auto w-full max-w-md">
			<div class="mb-8 lg:hidden">
				<div class="flex items-center gap-3">
					<RallyLogo size="md" href="/" />
					<ThemeToggle />
				</div>

				<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">Find your game.</p>
			</div>

			<div
				class="rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<h1 class="text-3xl font-black text-slate-950 dark:text-slate-50">Log in</h1>
				<p class="mt-2 text-slate-500 dark:text-slate-400">Continue to Rally.</p>

				<div class="mt-8">
					<GoogleSignInButton />
				</div>

				<div class="my-6 flex items-center gap-3">
					<div class="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
					<span class="text-xs font-bold uppercase tracking-wide text-slate-400"> or </span>
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
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							placeholder="you@example.com"
						/>
					</div>

					<div>
						<div class="flex items-center justify-between gap-3">
							<label
								for="password"
								class="text-sm font-semibold text-slate-700 dark:text-slate-300"
							>
								Password
							</label>

							<button
								type="button"
								onclick={handlePasswordReset}
								disabled={resetLoading}
								class="text-sm font-bold text-blue-600 hover:text-blue-700 disabled:opacity-60 dark:text-blue-400 dark:hover:text-blue-300"
							>
								{resetLoading ? 'Sending...' : 'Forgot password?'}
							</button>
						</div>

						<input
							id="password"
							type="password"
							bind:value={password}
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							placeholder="••••••••"
						/>
					</div>

					<button
						type="submit"
						disabled={loading}
						class="w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60 dark:shadow-blue-950/40"
					>
						{loading ? 'Logging in...' : 'Log in'}
					</button>
				</form>

				<p class="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
					Don’t have an account?
					<a
						href="/register"
						class="font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
					>
						Create one
					</a>
				</p>
			</div>

			<button
				type="button"
				onclick={() => goBack('/')}
				class="mt-6 block text-center text-sm font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
			>
				← Back to home
			</button>
		</div>
	</section>
</main>
