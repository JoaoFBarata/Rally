<!--src/routes/register/+page.svelte-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RallyWordmark from '$lib/components/RallyWordmark.svelte';
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

		if (!displayName || !email || !password || !confirmPassword) {
			error = 'Please fill in all fields.';
			return;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match.';
			return;
		}

		if (password.length < 6) {
			error = 'Password must be at least 6 characters.';
			return;
		}

		loading = true;

		try {
			await authService.register(email, password, displayName);
			await goto(resolve('/dashboard'));
		} catch (err) {
			console.error('Register error:', err);
			error = err instanceof Error ? err.message : 'Could not create account.';
		} finally {
			loading = false;
		}
	}
</script>

<main
	class="flex min-h-screen items-center justify-center bg-slate-100 px-5 py-10 text-slate-950 dark:bg-slate-950 dark:text-slate-50"
>
	<div class="w-full max-w-5xl">
		<div class="mb-8 flex justify-center">
			<RallyWordmark size="lg" />
		</div>

		<div class="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
			<section
				class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<p class="text-sm font-black uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
					Choose account type
				</p>

				<h1 class="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-slate-50">
					Join Rally
				</h1>

				<p class="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
					Create a personal account to join events, or register an organization to host official
					activities.
				</p>

				<div class="mt-6 space-y-3">
					<div
						class="rounded-3xl border-2 border-blue-500 bg-blue-50 p-5 dark:border-blue-500 dark:bg-blue-950/40"
					>
						<div class="flex items-start gap-4">
							<div
								class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-xl font-black text-white"
							>
								☻
							</div>

							<div>
								<h2 class="font-black text-slate-950 dark:text-slate-50">
									Personal account
								</h2>
								<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
									For people who want to join events, make friends and organize casual games.
								</p>
							</div>
						</div>
					</div>

					<a
						href={resolve('/register/organization')}
						class="block rounded-3xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-slate-800"
					>
						<div class="flex items-start gap-4">
							<div
								class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xl font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200"
							>
								✓
							</div>

							<div>
								<h2 class="font-black text-slate-950 dark:text-slate-50">
									Organization account
								</h2>
								<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
									For companies, clubs, gyms, venues or brands that want to host official events.
								</p>

								<p class="mt-3 text-sm font-black text-blue-600 dark:text-blue-400">
									Register organization →
								</p>
							</div>
						</div>
					</a>
				</div>

				<p class="mt-6 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
					Organizations can later request verification before creating official paid events.
				</p>
			</section>

			<section
				class="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<h2 class="text-2xl font-black text-slate-950 dark:text-slate-50">
					Create personal account
				</h2>

				<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
					Start joining events and connecting with people nearby.
				</p>

				{#if error}
					<div
						class="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
					>
						{error}
					</div>
				{/if}

				<form
					class="mt-6 space-y-4"
					onsubmit={(event) => {
						event.preventDefault();
						handleRegister();
					}}
				>
					<div>
						<label for="displayName" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Name
						</label>

						<input
							id="displayName"
							bind:value={displayName}
							placeholder="Your name"
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
						/>
					</div>

					<div>
						<label for="email" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Email
						</label>

						<input
							id="email"
							type="email"
							bind:value={email}
							placeholder="you@example.com"
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
						/>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label for="password" class="text-sm font-bold text-slate-700 dark:text-slate-300">
								Password
							</label>

							<input
								id="password"
								type="password"
								bind:value={password}
								placeholder="••••••••"
								class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							/>
						</div>

						<div>
							<label
								for="confirmPassword"
								class="text-sm font-bold text-slate-700 dark:text-slate-300"
							>
								Confirm password
							</label>

							<input
								id="confirmPassword"
								type="password"
								bind:value={confirmPassword}
								placeholder="••••••••"
								class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							/>
						</div>
					</div>

					<button
						type="submit"
						disabled={loading}
						class="w-full rounded-2xl bg-blue-600 px-5 py-3 font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
					>
						{loading ? 'Creating account...' : 'Create personal account'}
					</button>
				</form>

				<div class="my-6 flex items-center gap-4">
					<div class="h-px flex-1 bg-slate-200 dark:bg-slate-800"></div>
					<span class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
						or
					</span>
					<div class="h-px flex-1 bg-slate-200 dark:bg-slate-800"></div>
				</div>

				<GoogleSignInButton />

				<p class="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
					Already have an account?
					<a
						href={resolve('/login')}
						class="font-black text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
					>
						Sign in
					</a>
				</p>
			</section>
		</div>
	</div>
</main>