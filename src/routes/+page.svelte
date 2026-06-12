<script lang="ts">
	import { goto } from '$app/navigation';
	import { authState } from '$lib/auth.svelte';
	import RallyLogo from '$lib/components/RallyLogo.svelte';

	$effect(() => {
		if (!authState.loading && authState.user) {
			goto('/dashboard');
		}
	});
</script>

<main class="min-h-screen bg-slate-50">
	<section class="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8">
		<header class="flex items-center justify-between">
			<RallyLogo size="md" />

			<div class="hidden items-center gap-3 sm:flex">
				<a
					href="/login"
					class="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950"
				>
					Log in
				</a>

				<a
					href="/register"
					class="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
				>
					Create account
				</a>
			</div>
		</header>

		<div class="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[1.05fr_0.95fr]">
			<section>
				<div class="inline-flex rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
					Find players. Build teams. Make sports happen.
				</div>

				<h1 class="mt-6 max-w-3xl text-5xl font-black leading-tight tracking-tight text-slate-950 md:text-7xl">
					Organize the game.
					<span class="text-blue-600">Build your team.</span>
				</h1>

				<p class="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
					Rally helps you create sports events, invite friends, find nearby players,
					confirm attendance and split costs in one simple app.
				</p>

				<div class="mt-8 flex flex-col gap-3 sm:flex-row">
					<a
						href="/register"
						class="rounded-2xl bg-blue-600 px-7 py-4 text-center font-bold text-white shadow-xl shadow-blue-600/25 transition hover:bg-blue-700"
					>
						Get started
					</a>

					<a
						href="/login"
						class="rounded-2xl border border-slate-200 bg-white px-7 py-4 text-center font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-600"
					>
						I already have an account
					</a>
				</div>

				<div class="mt-10 grid max-w-xl grid-cols-3 gap-3">
					<div class="rounded-3xl bg-white p-4 shadow-sm">
						<p class="text-2xl font-black text-blue-600">01</p>
						<p class="mt-1 text-sm font-semibold text-slate-700">Create event</p>
					</div>

					<div class="rounded-3xl bg-white p-4 shadow-sm">
						<p class="text-2xl font-black text-blue-600">02</p>
						<p class="mt-1 text-sm font-semibold text-slate-700">Invite friends</p>
					</div>

					<div class="rounded-3xl bg-white p-4 shadow-sm">
						<p class="text-2xl font-black text-blue-600">03</p>
						<p class="mt-1 text-sm font-semibold text-slate-700">Play together</p>
					</div>
				</div>
			</section>

			<section class="relative">
				<div class="absolute -left-8 top-10 h-28 w-28 rounded-full bg-blue-200 blur-3xl"></div>
				<div class="absolute -right-8 bottom-10 h-28 w-28 rounded-full bg-blue-400 blur-3xl"></div>

				<div class="relative mx-auto max-w-sm rounded-[2.5rem] border border-slate-200 bg-white p-4 shadow-2xl">
					<div class="rounded-4xl bg-slate-50 p-5">
						<div class="flex items-center justify-between">
							<RallyLogo size="sm" />
							<div class="h-9 w-9 rounded-full bg-slate-200"></div>
						</div>

						<div class="mt-8">
							<p class="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
								5-a-side Football
							</p>

							<h2 class="mt-3 text-2xl font-black text-slate-950">
								Saturday Football
							</h2>

							<p class="mt-2 text-sm text-slate-500">📍 Riverside Park · Field 2</p>
							<p class="mt-1 text-sm text-slate-500">🕒 Sat, 24 May · 5:00 PM</p>
						</div>

						<div class="mt-6 grid grid-cols-3 gap-2">
							<div class="rounded-2xl bg-green-50 p-3 text-center">
								<p class="text-xl font-black text-green-600">7</p>
								<p class="text-xs text-green-700">going</p>
							</div>

							<div class="rounded-2xl bg-amber-50 p-3 text-center">
								<p class="text-xl font-black text-amber-600">2</p>
								<p class="text-xs text-amber-700">maybe</p>
							</div>

							<div class="rounded-2xl bg-slate-100 p-3 text-center">
								<p class="text-xl font-black text-slate-700">10</p>
								<p class="text-xs text-slate-500">needed</p>
							</div>
						</div>

						<button class="mt-6 w-full rounded-2xl bg-blue-600 py-3 font-bold text-white">
							See event details
						</button>
					</div>
				</div>
			</section>
		</div>

		<div class="grid gap-3 sm:hidden">
			<a
				href="/register"
				class="rounded-2xl bg-blue-600 px-7 py-4 text-center font-bold text-white shadow-xl shadow-blue-600/25"
			>
				Create account
			</a>

			<a
				href="/login"
				class="rounded-2xl border border-slate-200 bg-white px-7 py-4 text-center font-bold text-slate-700 shadow-sm"
			>
				Log in
			</a>
		</div>
	</section>
</main>