<script lang="ts">
	import { onMount } from 'svelte';
	import { authState } from '$lib/auth.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';

	let contentVisible = $state(false);

	onMount(() => {
		const t = setTimeout(() => (contentVisible = true), 1000);
		return () => clearTimeout(t);
	});

	function reveal(node: HTMLElement, options: { delay?: number } = {}) {
		const delay = options.delay ?? 0;
		Object.assign(node.style, {
			opacity: '0',
			transform: 'translateY(28px)',
			transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`
		});

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					node.style.opacity = '1';
					node.style.transform = 'translateY(0)';
					observer.disconnect();
				}
			},
			{ threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
		);

		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}

	const features = [
		{
			title: 'Find games near you',
			desc: 'Browse events by sport, location and date. Discover who is playing and join with one tap.',
			icon: `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>`,
			type: 'search'
		},
		{
			title: 'Create & organise',
			desc: 'Set up a game in seconds. Define the sport, time, location and how many players you need.',
			icon: `<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`,
			type: 'calendar'
		},
		{
			title: 'Coordinate your team',
			desc: 'Invite players, track confirmations and chat all in one place. No more endless group chats.',
			icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
			type: 'team'
		}
	];

	const sports = [
		'Football',
		'Padel',
		'Basketball',
		'Tennis',
		'Volleyball',
		'Running',
		'Cycling',
		'Gym',
		'Swimming',
		'Surfing',
		'Golf',
		'Rugby'
	];

	const personas = [
		{
			label: 'Players',
			headline: 'Just want to play?',
			desc: 'Find nearby games, join with a tap, and meet other athletes who love the same sports.',
			cta: 'Find a game',
			href: '/discover',
			icon: `<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>`
		},
		{
			label: 'Organizers',
			headline: 'Got a game to run?',
			desc: 'Create events, manage your player list and send invites — done in under two minutes.',
			cta: 'Create an event',
			href: '/register',
			icon: `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`
		},
		{
			label: 'Clubs & Teams',
			headline: 'Running a club?',
			desc: 'Manage your community, plan your season and keep every member in sync — at any scale.',
			cta: 'Learn more',
			href: '/register',
			icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`
		}
	];

	const steps = [
		{
			num: '01',
			title: 'Create your event',
			desc: 'Pick a sport, set the date, location and how many players you need. Takes under a minute.'
		},
		{
			num: '02',
			title: 'Invite & share',
			desc: 'Send invites to friends or make your event public so nearby players can find and join it.'
		},
		{
			num: '03',
			title: 'Play together',
			desc: 'Confirm your roster, coordinate with your friends and show up, well handle the rest.'
		}
	];
</script>

<main class="min-h-screen bg-white dark:bg-slate-950">
	<!-- ─── HERO ─────────────────────────────────────────────────────────── -->
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
					{#if !authState.user && !authState.loading}
						<a
							href="/login"
							class="text-sm font-semibold text-white/75 transition hover:text-white"
						>
							Log in
						</a>
					{/if}
				</div>

				{#if authState.user}
					<a
						href="/dashboard"
						class="rounded-full transition hover:opacity-80"
						aria-label="My dashboard"
					>
						<UserAvatar
							photoURL={authState.user.photoURL}
							displayName={authState.user.displayName}
							email={authState.user.email}
							size="md"
						/>
					</a>
				{:else}
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
				{/if}
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
					{#if authState.user}
						<a
							href="/dashboard"
							class="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-slate-900 shadow-lg transition hover:bg-white/90"
						>
							Go to dashboard
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
					{:else}
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
					{/if}
					<a
						href="/discover"
						class="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-3 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20"
					>
						Explore
					</a>
				</div>
			</div>

			<!-- Demo event card -->
			<div
				class="absolute bottom-10 right-8 hidden w-60 overflow-hidden rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md sm:block"
			>
				<div
					class="flex h-28 items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700"
				>
					<span class="text-5xl" aria-hidden="true">⚽</span>
				</div>
				<div class="p-4">
					<p class="text-sm font-bold leading-snug text-white">
						5 on 5 Football · Campo Pequeno · Tomorrow 6PM
					</p>
					<a
						href="/discover"
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

	<!-- ─── STATS STRIP ──────────────────────────────────────────────────── -->
	<section class="border-b border-slate-100 bg-white py-12 dark:border-slate-800 dark:bg-slate-950">
		<div class="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-10 px-8 sm:gap-16">
			<div use:reveal class="text-center">
				<p class="text-4xl font-black text-slate-950 dark:text-white">500+</p>
				<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Active players</p>
			</div>
			<div use:reveal={{ delay: 80 }} class="text-center">
				<p class="text-4xl font-black text-slate-950 dark:text-white">12</p>
				<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Sports supported</p>
			</div>
			<div use:reveal={{ delay: 160 }} class="text-center">
				<p class="text-4xl font-black text-slate-950 dark:text-white">Free</p>
				<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Always and forever</p>
			</div>
		</div>
	</section>

	<!-- ─── FEATURES ─────────────────────────────────────────────────────── -->
	<section class="bg-slate-50 px-8 py-20 dark:bg-slate-900/50">
		<div class="mx-auto max-w-5xl">
			<div use:reveal>
				<p class="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
					What Rally does
				</p>
				<h2 class="mt-2 max-w-md text-3xl font-black leading-tight text-slate-950 dark:text-white">
					Everything you need to become more active
				</h2>
			</div>

			<div class="mt-12 grid gap-6 sm:grid-cols-3">
				{#each features as feature, i}
					<div
						use:reveal={{ delay: i * 100 }}
						class="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
					>
						<div
							class="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50"
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="h-5 w-5 text-blue-600 dark:text-blue-400"
								aria-hidden="true"
							>
								{@html feature.icon}
							</svg>
						</div>
						<h3 class="mt-4 text-base font-black text-slate-950 dark:text-white">
							{feature.title}
						</h3>
						<p class="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
							{feature.desc}
						</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ─── WHO IS RALLY FOR ─────────────────────────────────────────────── -->
	<section class="bg-white px-8 py-20 dark:bg-slate-950">
		<div class="mx-auto max-w-5xl">
			<div use:reveal class="text-center">
				<p class="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
					Who is it for?
				</p>
				<h2 class="mt-2 text-3xl font-black text-slate-950 dark:text-white">
					Rally is built for everyone
				</h2>
			</div>

			<div class="mt-12 grid gap-6 sm:grid-cols-3">
				{#each personas as persona, i}
					<div
						use:reveal={{ delay: i * 100 }}
						class="group flex flex-col rounded-3xl border border-slate-200 bg-slate-50 p-6 transition hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900 dark:hover:bg-blue-950/20"
					>
						<span
							class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200/60 dark:bg-slate-800 dark:ring-slate-700"
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="h-5 w-5 text-blue-600 dark:text-blue-400"
								aria-hidden="true"
							>
								{@html persona.icon}
							</svg>
						</span>

						<p
							class="mt-4 text-[11px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400"
						>
							{persona.label}
						</p>
						<h3 class="mt-1 text-lg font-black text-slate-950 dark:text-white">
							{persona.headline}
						</h3>
						<p class="mt-2 flex-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
							{persona.desc}
						</p>

						<a
							href={persona.href}
							class="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 transition group-hover:gap-2.5 dark:text-blue-400"
						>
							{persona.cta}
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="h-3.5 w-3.5"
								aria-hidden="true"
							>
								<path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
							</svg>
						</a>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ─── HOW IT WORKS ─────────────────────────────────────────────────── -->
	<section class="bg-slate-50 px-8 py-20 dark:bg-slate-900/50">
		<div class="mx-auto max-w-5xl">
			<div use:reveal class="text-center">
				<p class="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
					How it works
				</p>
				<h2 class="mt-2 text-3xl font-black text-slate-950 dark:text-white">
					Up and running in minutes
				</h2>
			</div>

			<div class="mt-12 grid gap-6 sm:grid-cols-3">
				{#each steps as step, i}
					<div use:reveal={{ delay: i * 100 }} class="relative">
						{#if i < steps.length - 1}
							<div
								class="absolute left-10 top-6 hidden h-0.5 w-[calc(100%+1.5rem)] bg-slate-200 dark:bg-slate-800 sm:block"
								aria-hidden="true"
							></div>
						{/if}

						<div
							class="relative z-10 rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
						>
							<p class="text-3xl font-black text-blue-600 dark:text-blue-400">{step.num}</p>
							<h3 class="mt-3 font-black text-slate-950 dark:text-white">{step.title}</h3>
							<p class="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
								{step.desc}
							</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ─── SPORTS GRID ──────────────────────────────────────────────────── -->
	<section class="overflow-hidden bg-white px-8 py-20 dark:bg-slate-950">
		<div class="mx-auto max-w-5xl">
			<div use:reveal class="text-center">
				<p class="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
					Every sport
				</p>
				<h2 class="mt-2 text-3xl font-black text-slate-950 dark:text-white">
					Whatever you play, we've got you
				</h2>
				<p class="mx-auto mt-3 max-w-md text-sm text-slate-500 dark:text-slate-400">
					Rally supports all sports. If yours isn't listed, just type it in, we dont discriminate.
				</p>
			</div>

			<div class="mt-10 flex flex-wrap justify-center gap-3">
				{#each sports as sport, i}
					<span
						use:reveal={{ delay: i * 40 }}
						class="rounded-full border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
					>
						{sport}
					</span>
				{/each}
				<span
					use:reveal={{ delay: sports.length * 40 }}
					class="rounded-full border border-dashed border-slate-200 bg-transparent px-5 py-2.5 text-sm font-bold text-slate-400 dark:border-slate-700 dark:text-slate-500"
				>
					+ your sport
				</span>
			</div>
		</div>
	</section>

	<!-- ─── ORGANIZATION CTA ─────────────────────────────────────────────── -->
	<section class="bg-slate-950 px-8 py-24 dark:bg-slate-900">
		<div class="mx-auto max-w-3xl text-center">
			<div use:reveal>
				<p class="text-xs font-bold uppercase tracking-widest text-blue-400">For organizations</p>
				<h2 class="mt-4 text-4xl font-black leading-tight text-white md:text-5xl">
					Running a club or team?<br />Rally makes it effortless.
				</h2>
				<p class="mx-auto mt-5 max-w-xl text-lg text-slate-400">
					Manage your community, plan your season, handle registrations and keep every member in
					sync — all from one place.
				</p>

				<div class="mt-8 flex flex-wrap items-center justify-center gap-4">
					<a
						href="/register/organization"
						class="inline-flex items-center gap-2 rounded-full bg-blue-600 px-7 py-3.5 font-bold text-white transition hover:bg-blue-500"
					>
						Join Rally as an organization
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-4 w-4"
							aria-hidden="true"
						>
							<path d="M7 17L17 7" /><path d="M7 7h10v10" />
						</svg>
					</a>
					<a
						href="/discover"
						class="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 py-3.5 font-bold text-white backdrop-blur-sm transition hover:bg-white/10"
					>
						See what's out there
					</a>
				</div>
			</div>

			<!-- 3 org features below CTA -->
			<div class="mt-14 grid gap-4 sm:grid-cols-3">
				{#each [{ title: 'Event management', desc: 'Create and manage events for your whole club in one dashboard.' }, { title: 'Member coordination', desc: 'Keep track of who is showing up and when, allowing you to plan accordingly.' }, { title: 'Tournament tools', desc: 'Run brackets, leagues and competitions with built-in tournament support.' }] as item, i}
					<div
						use:reveal={{ delay: i * 80 }}
						class="rounded-2xl border border-white/10 bg-white/5 p-5 text-left"
					>
						<p class="font-bold text-white">{item.title}</p>
						<p class="mt-1.5 text-sm text-slate-400">{item.desc}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ─── FINAL CTA ────────────────────────────────────────────────────── -->
	<section class="bg-blue-600 px-8 py-20">
		<div use:reveal class="mx-auto max-w-xl text-center">
			<h2 class="text-3xl font-black text-white md:text-4xl">Ready to play your first game?</h2>
			<p class="mt-3 text-blue-100">Signing up takes less than a minute. No credit card needed.</p>

			<div class="mt-8 flex flex-wrap items-center justify-center gap-4">
				{#if authState.user}
					<a
						href="/dashboard"
						class="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-bold text-blue-600 transition hover:bg-blue-50"
					>
						Go to my dashboard
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-4 w-4"
							aria-hidden="true"
						>
							<path d="M7 17L17 7" /><path d="M7 7h10v10" />
						</svg>
					</a>
				{:else}
					<a
						href="/register"
						class="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-bold text-blue-600 transition hover:bg-blue-50"
					>
						Create your account
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-4 w-4"
							aria-hidden="true"
						>
							<path d="M7 17L17 7" /><path d="M7 7h10v10" />
						</svg>
					</a>
					<a
						href="/login"
						class="inline-flex rounded-full border border-white/30 bg-white/10 px-7 py-3.5 font-bold text-white transition hover:bg-white/20"
					>
						Log in
					</a>
				{/if}
			</div>
		</div>
	</section>

	<!-- Mobile CTAs (replaces the old mobile section) -->
	<div
		class="border-t border-slate-200 bg-white px-8 py-6 dark:border-slate-800 dark:bg-slate-950 sm:hidden"
	>
		{#if authState.user}
			<a
				href="/dashboard"
				class="block rounded-2xl bg-blue-600 px-7 py-4 text-center font-bold text-white"
			>
				Go to dashboard
			</a>
		{:else}
			<div class="grid gap-3">
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
		{/if}
	</div>
</main>
