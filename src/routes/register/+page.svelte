<script lang="ts">
	import { goto } from '$app/navigation';
	import RallyLogo from '$lib/components/RallyLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import GoogleSignInButton from '$lib/components/GoogleSignInButton.svelte';
	import { authService } from '$lib/services/auth.service';

	let displayName = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let error = $state('');

	async function handleRegister() {
		error = '';

		if (!displayName || !email || !password) {
			error = 'Please fill in all required fields.';
			return;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match.';
			return;
		}

		loading = true;

		try {
			await authService.register(email, password, displayName);
			await goto('/dashboard');
		} catch (err) {
			console.error('Register error:', err);

			if (err instanceof Error) {
				error = err.message;
			} else {
				error = 'Could not create account.';
			}
		} finally {
			loading = false;
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

				<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
					Make sports happen
				</p>
			</div>

			<h1 class="mt-8 text-6xl font-black leading-tight tracking-tight text-slate-950 dark:text-slate-50">
				Start playing together.
			</h1>

			<p class="mt-5 max-w-lg text-lg leading-8 text-slate-600 dark:text-slate-400">
				Create your Rally profile and start organizing games, finding partners and building teams.
			</p>

			<div class="mt-8 grid max-w-lg grid-cols-2 gap-3">
				<div class="rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900 dark:shadow-none">
					<p class="text-3xl">⚽</p>
					<p class="mt-3 font-bold text-slate-950 dark:text-slate-50">Create events</p>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Set sport, time, place and players.
					</p>
				</div>

				<div class="rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900 dark:shadow-none">
					<p class="text-3xl">👥</p>
					<p class="mt-3 font-bold text-slate-950 dark:text-slate-50">Find people</p>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Invite friends or discover partners.
					</p>
				</div>
			</div>
		</div>

		<div class="mx-auto w-full max-w-md">
			<div class="mb-8 lg:hidden">
				<div class="flex items-center gap-3">
					<RallyLogo size="md" href="/" />
					<ThemeToggle />
				</div>

				<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
					Make sports happen
				</p>
			</div>

			<div
				class="rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<h1 class="text-3xl font-black text-slate-950 dark:text-slate-50">
					Create account
				</h1>

				<p class="mt-2 text-slate-500 dark:text-slate-400">
					Join Rally and start organizing sports.
				</p>

				<div class="mt-8">
					<GoogleSignInButton />
				</div>

				<div class="my-6 flex items-center gap-3">
					<div class="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
					<span class="text-xs font-bold uppercase tracking-wide text-slate-400">
						or
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

				<form
					class="space-y-5"
					onsubmit={(e) => {
						e.preventDefault();
						handleRegister();
					}}
				>
					<div>
						<label for="displayName" class="text-sm font-semibold text-slate-700 dark:text-slate-300">
							Name
						</label>

						<input
							id="displayName"
							bind:value={displayName}
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							placeholder="Your name"
						/>
					</div>

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
						<label for="password" class="text-sm font-semibold text-slate-700 dark:text-slate-300">
							Password
						</label>

						<input
							id="password"
							type="password"
							bind:value={password}
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							placeholder="••••••••"
						/>
					</div>

					<div>
						<label
							for="confirmPassword"
							class="text-sm font-semibold text-slate-700 dark:text-slate-300"
						>
							Confirm password
						</label>

						<input
							id="confirmPassword"
							type="password"
							bind:value={confirmPassword}
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							placeholder="••••••••"
						/>
					</div>

					<button
						type="submit"
						disabled={loading}
						class="w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60 dark:shadow-blue-950/40"
					>
						{loading ? 'Creating account...' : 'Create account'}
					</button>
				</form>

				<p class="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
					Already have an account?
					<a href="/login" class="font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
						Log in
					</a>
				</p>
			</div>

			<a
				href="/"
				class="mt-6 block text-center text-sm font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
			>
				← Back to home
			</a>
		</div>
	</section>
</main>