<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { authState } from '$lib/auth.svelte';

	$effect(() => {
		if (!authState.loading && authState.user) {
			goto('/dashboard');
		}
	});

	let contentVisible = $state(false);

	onMount(() => {
		const t = setTimeout(() => (contentVisible = true), 1000);
		return () => clearTimeout(t);
	});
</script>

<main class="min-h-screen bg-white dark:bg-slate-950">
	<section class="relative h-screen min-h-[600px] overflow-hidden">
		<video
			autoplay
			muted
			loop
			playsinline
			class="absolute inset-0 h-full w-full object-cover object-center"
			aria-hidden="true"
		>
			<source src="/background_rally.mp4" type="video/mp4" />
		</video>

		<div class="absolute inset-0 bg-black/45" aria-hidden="true"></div>

		<div
			class="absolute inset-0 z-10 transition-opacity duration-[900ms] ease-in"
			style="opacity: {contentVisible ? 1 : 0};"
		>
			<nav class="flex items-center justify-between px-8 py-6">
				<img src="/rally-logo-white.png" alt="Rally" class="h-9 w-auto object-contain" />

				<div class="hidden items-center gap-8 sm:flex">
					<a
						href="/discover"
						class="text-sm font-semibold text-white/75 transition hover:text-white"
					>
						Explore
					</a>
					<a href="/login" class="text-sm font-semibold text-white/75 transition hover:text-white">
						Log in
					</a>
				</div>

				<a
					href="/register"
					class="hidden items-center gap-2 rounded-full bg-slate-950/90 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 sm:inline-flex"
				>
					Create account
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M7 17L17 7" /><path d="M7 7h10v10" />
					</svg>
				</a>
			</nav>

			<div
				class="absolute inset-x-0 top-1/2 -translate-y-[55%] select-none overflow-hidden px-2 text-center"
			>
				<span
					class="pointer-events-none block font-black uppercase leading-none tracking-tighter text-white"
					style="font-size: clamp(5rem, 24vw, 28rem); opacity: 0.92;"
					aria-hidden="true"
				>
					RALLY
				</span>

				<h1
					class="mx-auto mt-3 max-w-lg text-2xl font-bold leading-snug text-white drop-shadow md:text-3xl"
				>
					Find players. Make sports happen.
				</h1>

				<div class="mt-6 flex items-center justify-center gap-3">
					<a
						href="/register"
						class="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-slate-900 shadow-lg transition hover:bg-white/90"
					>
						Get started
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M7 17L17 7" /><path d="M7 7h10v10" />
						</svg>
					</a>
					<a
						href="/discover"
						class="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-3 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20"
					>
						Explore
					</a>
				</div>
			</div>

			<div
				class="absolute bottom-10 right-8 hidden w-60 overflow-hidden rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md sm:block"
			>
				<div
					class="flex h-28 items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700"
				>
					<span class="text-5xl">⚽</span>
				</div>
				<div class="p-4">
					<p class="text-sm font-bold leading-snug text-white">
						5 on 5 Football · Campo Pequeno · Tomorrow 6PM
					</p>
					<a
						href="/register"
						class="mt-3 inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-white/10"
					>
						Explore event
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="11"
							height="11"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M7 17L17 7" /><path d="M7 7h10v10" />
						</svg>
					</a>
				</div>
			</div>
		</div>
	</section>

	<!-- ─── BELOW THE FOLD ───────────────────────────────────────────────── -->
	<section class="bg-white px-8 py-16 dark:bg-slate-950">
		<div class="mx-auto flex max-w-5xl flex-col items-start gap-8 sm:flex-row sm:items-center">
			<!-- Stat card -->
			<div
				class="w-full shrink-0 rounded-2xl bg-slate-900 p-6 text-white sm:w-56 dark:bg-slate-800"
			>
				<div class="flex -space-x-2">
					<div class="h-8 w-8 rounded-full border-2 border-slate-900 bg-blue-400"></div>
					<div class="h-8 w-8 rounded-full border-2 border-slate-900 bg-blue-500"></div>
					<div class="h-8 w-8 rounded-full border-2 border-slate-900 bg-blue-600"></div>
				</div>
				<p class="mt-4 text-lg font-bold leading-snug">Join 500+<br />active players</p>
			</div>

			<!-- Description -->
			<p class="text-2xl font-bold leading-snug text-slate-900 dark:text-slate-50 md:text-3xl">
				Coordinate your games, find the right players,
				<span class="text-slate-400 dark:text-slate-500"> and never miss a match again. </span>
			</p>
		</div>

		<!-- Steps -->
		<div class="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-3">
			{#each [{ num: '01', title: 'Create event', desc: 'Set the sport, location, date and how many players you need.' }, { num: '02', title: 'Invite friends', desc: 'Share with your network or find nearby players to fill the spots.' }, { num: '03', title: 'Play together', desc: "Confirm spots, track who's in and split costs without the hassle." }] as step}
				<div
					class="rounded-2xl border border-slate-100 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900"
				>
					<p class="text-3xl font-black text-blue-600 dark:text-blue-400">{step.num}</p>
					<p class="mt-3 font-bold text-slate-900 dark:text-slate-50">{step.title}</p>
					<p class="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{step.desc}</p>
				</div>
			{/each}
		</div>

		<!-- Mobile CTAs -->
		<div class="mx-auto mt-10 grid max-w-5xl gap-3 sm:hidden">
			<a
				href="/register"
				class="rounded-2xl bg-blue-600 px-7 py-4 text-center font-bold text-white"
			>
				Create account
			</a>
			<a
				href="/login"
				class="rounded-2xl border border-slate-200 bg-white px-7 py-4 text-center font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
			>
				Log in
			</a>
		</div>
	</section>
</main>
