<!-- src/routes/register/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import RallyLogo from '$lib/components/RallyLogo.svelte';
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

<main class="min-h-screen bg-slate-50">
	<section class="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-8 lg:grid-cols-2">
		<div class="hidden lg:block">
			<RallyLogo size="lg" />

			<h1 class="mt-8 text-6xl font-black leading-tight tracking-tight text-slate-950">
				Start playing together.
			</h1>

			<p class="mt-5 max-w-lg text-lg leading-8 text-slate-600">
				Create your Rally profile and start organizing games, finding partners and building teams.
			</p>

			<div class="mt-8 grid max-w-lg grid-cols-2 gap-3">
				<div class="rounded-3xl bg-white p-5 shadow-sm">
					<p class="text-3xl">⚽</p>
					<p class="mt-3 font-bold text-slate-950">Create events</p>
					<p class="mt-1 text-sm text-slate-500">Set sport, time, place and players.</p>
				</div>

				<div class="rounded-3xl bg-white p-5 shadow-sm">
					<p class="text-3xl">👥</p>
					<p class="mt-3 font-bold text-slate-950">Find people</p>
					<p class="mt-1 text-sm text-slate-500">Invite friends or discover partners.</p>
				</div>
			</div>
		</div>

		<div class="mx-auto w-full max-w-md">
			<div class="mb-8 lg:hidden">
				<RallyLogo size="md" />
			</div>

			<div class="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
				<h1 class="text-3xl font-black text-slate-950">Create account</h1>
				<p class="mt-2 text-slate-500">Join Rally and start organizing sports.</p>

				{#if error}
					<div class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
						{error}
					</div>
				{/if}

				<form class="mt-8 space-y-5" onsubmit={(e) => { e.preventDefault(); handleRegister(); }}>
					<div>
						<label for="displayName" class="text-sm font-semibold text-slate-700">Name</label>
						<input
							id="displayName"
							bind:value={displayName}
							class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500"
							placeholder="Your name"
						/>
					</div>

					<div>
						<label for="email" class="text-sm font-semibold text-slate-700">Email</label>
						<input
							id="email"
							type="email"
							bind:value={email}
							class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500"
							placeholder="you@example.com"
						/>
					</div>

					<div>
						<label for="password" class="text-sm font-semibold text-slate-700">Password</label>
						<input
							id="password"
							type="password"
							bind:value={password}
							class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500"
							placeholder="••••••••"
						/>
					</div>

					<div>
						<label for="confirmPassword" class="text-sm font-semibold text-slate-700">
							Confirm password
						</label>
						<input
							id="confirmPassword"
							type="password"
							bind:value={confirmPassword}
							class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500"
							placeholder="••••••••"
						/>
					</div>

					<button
						type="submit"
						disabled={loading}
						class="w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
					>
						{loading ? 'Creating account...' : 'Create account'}
					</button>
				</form>

				<p class="mt-6 text-center text-sm text-slate-500">
					Already have an account?
					<a href="/login" class="font-bold text-blue-600 hover:text-blue-700">Log in</a>
				</p>
			</div>

			<a href="/" class="mt-6 block text-center text-sm font-semibold text-slate-500 hover:text-blue-600">
				← Back to home
			</a>
		</div>
	</section>
</main>