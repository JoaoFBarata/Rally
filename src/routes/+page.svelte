<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { authState } from '$lib/auth.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import CardSwap from '$lib/components/CardSwap.svelte';

	let contentVisible = $state(false);
	let activePersona = $state(0);
	let activeStep = $state(0);

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

	const badges = [
		{
			label: 'Android Compatible',
			icon: `<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>`
		},
		{
			label: '100% Free',
			icon: `<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>`
		},
		{
			label: 'Firebase Secured',
			icon: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`
		},
		{
			label: '12+ Sports',
			icon: `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`
		},
		{
			label: 'No Credit Card',
			icon: `<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>`
		},
		{
			label: 'Instant Setup',
			icon: `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`
		},
		{
			label: 'Open Community',
			icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`
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
			desc: 'Create events, manage your player list and send invites, done!',
			cta: 'Create an event',
			href: '/register',
			icon: `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`
		},
		{
			label: 'Clubs & Teams',
			headline: 'Running a club?',
			desc: 'Manage your community, plan your season and keep every member up to date all on the same platform.',
			cta: 'Learn more',
			href: '/register',
			icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`
		}
	];

	const showcaseItems = [
		{ src: '/showcase/explore.png', alt: 'Explore' },
		{ src: '/showcase/profile.png', alt: 'Profile' },
		{ src: '/showcase/messages_new.png', alt: 'Messages' }
	];

	const rallyPointsSteps = [
		{
			step: '01',
			title: 'Play at a Verified venue',
			desc: 'Create or join an event at any Rally Verified partner location near you.',
			icon: `<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>`
		},
		{
			step: '02',
			title: 'Earn Rally Points',
			desc: 'Points are credited automatically after your event. The more you play, the more you earn.',
			icon: `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`
		},
		{
			step: '03',
			title: 'Redeem for rewards',
			desc: 'Unlock discounts, day passes, and exclusive perks at Rally partner venues.',
			icon: `<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>`
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
					Find your game.
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
		</div>
	</section>

	<!-- ─── MARQUEE BADGES ──────────────────────────────────────────────── -->
	<div
		class="overflow-hidden border-y border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950"
	>
		<div class="marquee-track flex items-center py-4">
			{#each [...badges, ...badges] as badge}
				<div class="flex shrink-0 items-center gap-2.5 px-8 text-slate-600 dark:text-slate-400">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.75"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400"
						aria-hidden="true"
					>
						{@html badge.icon}
					</svg>
					<span class="whitespace-nowrap text-sm font-semibold">{badge.label}</span>
				</div>
				<span class="h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden="true"></span>
			{/each}
		</div>
	</div>

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

	<!-- ─── WHO IS RALLY FOR ─────────────────────────────────────────────── -->
	<section class="bg-white px-8 py-20 dark:bg-slate-950">
		<div class="mx-auto max-w-4xl">
			<div use:reveal class="text-center">
				<p class="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
					Who is it for?
				</p>
				<h2 class="mt-2 text-3xl font-black text-slate-950 dark:text-white">
					Rally is built for <span class="text-blue-600 dark:text-blue-400">everyone</span>
				</h2>
			</div>

			<!-- Tab switcher -->
			<div use:reveal={{ delay: 100 }} class="mt-10 flex flex-wrap justify-center gap-2">
				{#each personas as persona, i}
					<button
						onclick={() => (activePersona = i)}
						class={`rounded-full px-5 py-2 text-sm font-bold transition-all ${
							activePersona === i
								? 'bg-blue-600 text-white shadow-sm'
								: 'border border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-600 dark:hover:text-blue-400'
						}`}
					>
						{persona.label}
					</button>
				{/each}
			</div>

			<!-- Active persona panel -->
			<div
				use:reveal={{ delay: 200 }}
				class="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
			>
				{#key activePersona}
					<div
						transition:fade={{ duration: 150 }}
						class="flex flex-col gap-8 p-8 sm:flex-row sm:items-center"
					>
						<div class="flex-1">
							<p
								class="text-[11px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400"
							>
								{personas[activePersona].label}
							</p>
							<h3 class="mt-2 text-2xl font-black text-slate-950 dark:text-white">
								{personas[activePersona].headline}
							</h3>
							<p class="mt-3 leading-relaxed text-slate-500 dark:text-slate-400">
								{personas[activePersona].desc}
							</p>
							<a
								href={personas[activePersona].href}
								class="mt-6 inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-500"
							>
								{personas[activePersona].cta}
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
						<div
							class="flex h-24 w-24 shrink-0 items-center justify-center self-start rounded-2xl bg-blue-600/10 dark:bg-blue-900/30 sm:self-auto"
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="h-10 w-10 text-blue-600 dark:text-blue-400"
								aria-hidden="true"
							>
								{@html personas[activePersona].icon}
							</svg>
						</div>
					</div>
				{/key}
			</div>
		</div>
	</section>

	<!-- ─── HOW IT WORKS ─────────────────────────────────────────────────── -->
	<section
		class="relative flex min-h-[560px] items-center overflow-hidden bg-slate-50 px-8 py-20 dark:bg-slate-900/50 sm:min-h-[680px]"
	>
		<div use:reveal class="relative z-10 mx-auto w-full max-w-6xl">
			<div class="max-w-md">
				<p class="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
					How it works
				</p>
				<h2 class="mt-2 text-3xl font-black text-slate-950 dark:text-white sm:text-4xl">
					Up and running in minutes
				</h2>
				<p class="mt-4 text-base leading-relaxed text-slate-500 dark:text-slate-400">
					Create an event, invite your friends or open it up to nearby players, and show up. We
					handle the scheduling, reminders and coordination so you can just focus on playing.
				</p>
			</div>
		</div>

		<CardSwap
			items={showcaseItems}
			width={900}
			height={600}
			cardDistance={110}
			verticalDistance={80}
			delay={2800}
			skewAmount={6}
			pauseOnHover={true}
		/>
	</section>

	<!-- ─── RALLY POINTS ────────────────────────────────────────────────── -->
	<section class="relative overflow-hidden bg-slate-950 px-8 py-24">
		<!-- Background glow -->
		<div
			class="pointer-events-none absolute inset-0 flex items-center justify-center"
			aria-hidden="true"
		>
			<div class="h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[120px]"></div>
		</div>

		<div class="relative mx-auto max-w-5xl">
			<div use:reveal class="text-center">
				<span
					class="inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-yellow-400"
				>
					<svg viewBox="0 0 24 24" fill="currentColor" class="h-3.5 w-3.5" aria-hidden="true">
						<polygon
							points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
						/>
					</svg>
					Rally Points
				</span>
				<h2 class="mt-4 text-4xl font-black leading-tight text-white md:text-5xl">
					Play more. Earn more.
				</h2>
				<p class="mx-auto mt-4 max-w-xl text-lg text-slate-400">
					Join events at <span class="font-semibold text-white">Rally Verified</span> partner venues and
					earn points with every game. You can then redeem them for discounts, free sessions, and exclusive
					perks.
				</p>
			</div>

			<!-- Steps: interactive left nav + right content panel -->
			<div use:reveal={{ delay: 100 }} class="mt-14 grid gap-4 sm:grid-cols-[1fr_1.5fr]">
				<!-- Left: step selector -->
				<div class="flex flex-col gap-2">
					{#each rallyPointsSteps as item, i}
						<button
							onclick={() => (activeStep = i)}
							class={`flex items-center gap-4 rounded-2xl border p-4 text-left transition-all ${
								activeStep === i
									? 'border-yellow-400/30 bg-yellow-400/10'
									: 'border-white/5 bg-white/5 hover:border-white/10 hover:bg-white/8'
							}`}
						>
							<span
								class={`text-2xl font-black transition-colors ${activeStep === i ? 'text-yellow-400' : 'text-white/20'}`}
								>{item.step}</span
							>
							<span
								class={`font-bold transition-colors ${activeStep === i ? 'text-white' : 'text-slate-400'}`}
								>{item.title}</span
							>
						</button>
					{/each}
				</div>

				<!-- Right: content panel -->
				<div class="rounded-2xl border border-white/10 bg-white/5 p-8">
					{#key activeStep}
						<div transition:fade={{ duration: 150 }}>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="h-8 w-8 text-yellow-400"
								aria-hidden="true"
							>
								{@html rallyPointsSteps[activeStep].icon}
							</svg>
							<h3 class="mt-4 text-xl font-black text-white">
								{rallyPointsSteps[activeStep].title}
							</h3>
							<p class="mt-2 leading-relaxed text-slate-400">
								{rallyPointsSteps[activeStep].desc}
							</p>
						</div>
					{/key}
				</div>
			</div>

			<!-- Verified badge callout -->
			<div use:reveal={{ delay: 300 }} class="mt-8 flex items-center justify-center gap-3">
				<div
					class="inline-flex items-center gap-2.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-5 py-2.5"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-4 w-4 text-blue-400"
						aria-hidden="true"
					>
						<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline
							points="9 12 11 14 15 10"
						/>
					</svg>
					<span class="text-sm font-semibold text-blue-300">
						Rally Points only apply at Rally Verified partner venues
					</span>
				</div>
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
	<section class="relative overflow-hidden bg-slate-950 px-8 py-24 dark:bg-slate-900">
		<!-- Floating emoji decorations -->
		<img
			src="/emoji-clipboard.png"
			alt=""
			aria-hidden="true"
			class="pointer-events-none absolute -left-4 top-1/2 w-32 -translate-y-1/2 -rotate-12 opacity-90 drop-shadow-2xl md:-left-2 md:w-40"
		/>
		<img
			src="/emoji-soccer-ball.png"
			alt=""
			aria-hidden="true"
			class="pointer-events-none absolute -right-4 bottom-16 w-28 rotate-12 opacity-90 drop-shadow-2xl md:-right-2 md:w-36"
		/>

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

			<!-- Org features as inline checklist -->
			<ul
				use:reveal={{ delay: 200 }}
				class="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-10"
			>
				{#each ['Event management', 'Member coordination', 'Tournament tools'] as feature}
					<li class="flex items-center gap-2 text-sm font-semibold text-slate-300">
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-4 w-4 shrink-0 text-blue-400"
							aria-hidden="true"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
						{feature}
					</li>
				{/each}
			</ul>
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
						Start your journey
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

	<!-- ─── MOBILE CTAs ─────────────────────────────────────────────────── -->
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

<style>
	@keyframes marquee {
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(-50%);
		}
	}

	.marquee-track {
		width: max-content;
		animation: marquee 28s linear infinite;
	}

	.marquee-track:hover {
		animation-play-state: paused;
	}
</style>
