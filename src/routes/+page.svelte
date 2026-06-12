<script lang="ts">
	import { goto } from '$app/navigation';
	import { authState } from '$lib/auth.svelte';
	import RallyLogo from '$lib/components/RallyLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	$effect(() => {
		if (!authState.loading && authState.user) {
			goto('/dashboard');
		}
	});
</script>

<main class="min-h-screen bg-slate-50 dark:bg-slate-950">
	<section class="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8">
		<header class="flex items-start justify-between gap-4">
			<div>
				<div class="flex items-center gap-3">
					<RallyLogo size="md" href="/" />
					<ThemeToggle />
				</div>

				<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
					Make sports happen
				</p>
			</div>

			<div class="hidden items-center gap-3 sm:flex">
				<a
					href="/login"
					class="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-50"
				>
					Log in
				</a>

				<a
					href="/register"
					class="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 dark:shadow-blue-950/40"
				>
					Create account
				</a>
			</div>
		</header>

		<div class="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[1.05fr_0.95fr]">
			<section>
				<div
					class="inline-flex rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
				>
					Find players. Build teams. Make sports happen.
				</div>

				<h1
					class="mt-6 max-w-3xl text-5xl font-black leading-tight tracking-tight text-slate-950 dark:text-slate-50 md:text-7xl"
				>
					Organize the game.
					<span class="text-blue-600 dark:text-blue-400">Build your team.</span>
				</h1>

				<p class="mt-6 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-400">
					Rally helps you create sports events, invite friends, find nearby players,
					confirm attendance and split costs in one simple app.
				</p>

				<div class="mt-8 flex flex-col gap-3 sm:flex-row">
					<a
						href="/register"
						class="rounded-2xl bg-blue-600 px-7 py-4 text-center font-bold text-white shadow-xl shadow-blue-600/25 transition hover:bg-blue-700 dark:shadow-blue-950/40"
					>
						Get started
					</a>

					<a
						href="/login"
						class="rounded-2xl border border-slate-200 bg-white px-7 py-4 text-center font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-400"
					>
						I already have an account
					</a>
				</div>

				<div class="mt-10 grid max-w-xl grid-cols-3 gap-3">
					<div class="rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900 dark:shadow-none">
						<p class="text-2xl font-black text-blue-600 dark:text-blue-400">01</p>
						<p class="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
							Create event
						</p>
					</div>

					<div class="rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900 dark:shadow-none">
						<p class="text-2xl font-black text-blue-600 dark:text-blue-400">02</p>
						<p class="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
							Invite friends
						</p>
					</div>

					<div class="rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900 dark:shadow-none">
						<p class="text-2xl font-black text-blue-600 dark:text-blue-400">03</p>
						<p class="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
							Play together
						</p>
					</div>
				</div>
			</section>

			<section class="relative">
				<div class="absolute -left-8 top-10 h-28 w-28 rounded-full bg-blue-200 blur-3xl dark:bg-blue-900"></div>
				<div class="absolute -right-8 bottom-10 h-28 w-28 rounded-full bg-blue-400 blur-3xl dark:bg-blue-700"></div>

				<div
					class="relative mx-auto max-w-sm rounded-[2.5rem] border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:shadow-blue-950/20"
				>
					<div class="rounded-4xl bg-slate-50 p-5 dark:bg-slate-800">
						<div class="flex items-center justify-between">
							<RallyLogo size="sm" />
							<div class="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700"></div>
						</div>

						<div class="mt-8">
							<p class="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
								5-a-side Football
							</p>

							<h2 class="mt-3 text-2xl font-black text-slate-950 dark:text-slate-50">
								Saturday Football
							</h2>

							<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
								📍 Riverside Park · Field 2
							</p>
							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								🕒 Sat, 24 May · 5:00 PM
							</p>
						</div>

						<div class="mt-6 grid grid-cols-3 gap-2">
							<div class="rounded-2xl bg-green-50 p-3 text-center dark:bg-green-950/50">
								<p class="text-xl font-black text-green-600 dark:text-green-400">7</p>
								<p class="text-xs text-green-700 dark:text-green-300">going</p>
							</div>

							<div class="rounded-2xl bg-amber-50 p-3 text-center dark:bg-amber-950/50">
								<p class="text-xl font-black text-amber-600 dark:text-amber-400">2</p>
								<p class="text-xs text-amber-700 dark:text-amber-300">maybe</p>
							</div>

							<div class="rounded-2xl bg-slate-100 p-3 text-center dark:bg-slate-900">
								<p class="text-xl font-black text-slate-700 dark:text-slate-50">10</p>
								<p class="text-xs text-slate-500 dark:text-slate-400">needed</p>
							</div>
						</div>

						<button
							type="button"
							class="mt-6 w-full rounded-2xl bg-blue-600 py-3 font-bold text-white transition hover:bg-blue-700"
						>
							See event details
						</button>
					</div>
				</div>
			</section>
		</div>

		<div class="grid gap-3 sm:hidden">
			<a
				href="/register"
				class="rounded-2xl bg-blue-600 px-7 py-4 text-center font-bold text-white shadow-xl shadow-blue-600/25 dark:shadow-blue-950/40"
			>
				Create account
			</a>

			<a
				href="/login"
				class="rounded-2xl border border-slate-200 bg-white px-7 py-4 text-center font-bold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
			>
				Log in
			</a>
		</div>
	</section>
</main>