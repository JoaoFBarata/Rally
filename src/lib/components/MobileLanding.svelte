<script lang="ts">
	import RallyLogo from '$lib/components/RallyLogo.svelte';
	import { getSportBackgroundImage } from '$lib/utils/format.utils';

	type LandingUser = {
		displayName?: string | null;
		email?: string | null;
	} | null;

	let { user = null, loading = false }: { user?: LandingUser; loading?: boolean } = $props();

	const heroImages = [
		{ src: getSportBackgroundImage('football'), alt: 'Football event', className: 'translate-y-5 rotate-[-3deg]' },
		{ src: getSportBackgroundImage('padel'), alt: 'Padel event', className: '-translate-y-2 rotate-[2deg]' },
		{ src: getSportBackgroundImage('basketball'), alt: 'Basketball event', className: '-translate-y-5 rotate-[-1deg]' },
		{ src: getSportBackgroundImage('running'), alt: 'Running event', className: 'translate-y-7 rotate-[3deg]' }
	];

	const features = [
		{
			title: 'Find Events',
			desc: 'Join games near you',
			icon: 'calendar'
		},
		{
			title: 'Connect',
			desc: 'Find friends who play',
			icon: 'users'
		},
		{
			title: 'Join Groups',
			desc: 'Be part of your community',
			icon: 'shield'
		}
	];
</script>

<section
	class="mobile-landing-shell relative overflow-hidden bg-white px-5 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] text-slate-950 md:hidden"
>
	<div class="pointer-events-none absolute -left-16 top-24 h-44 w-44 rounded-full bg-blue-100/70 blur-3xl"></div>
	<div class="pointer-events-none absolute -right-20 bottom-36 h-52 w-52 rounded-full bg-orange-100/80 blur-3xl"></div>
	<div class="pointer-events-none absolute bottom-32 left-0 h-32 w-32 rounded-tr-[5rem] bg-blue-50"></div>
	<div class="pointer-events-none absolute right-0 top-[30rem] h-28 w-28 rounded-bl-[5rem] bg-blue-50"></div>

	<div class="relative mx-auto flex h-full max-w-sm flex-col">
		<div class="flex min-h-0 flex-1 flex-col justify-between gap-2">
			<div class="landing-logo flex justify-center pt-1">
				<RallyLogo size="lg" href="/" />
			</div>

			<div class="mt-2 text-center">
				<h1 class="text-[clamp(1.8rem,8vw,2.25rem)] font-black leading-[1.04] tracking-tight text-slate-950">
					Play together.
					<span class="block text-blue-600">Find your game.</span>
				</h1>
				<div class="mx-auto mt-2 h-1 w-20 rounded-full bg-orange-500"></div>
			</div>

			<div class="relative mt-4">
				<div
					class="absolute -left-1 top-0 grid grid-cols-7 gap-1 opacity-50"
					aria-hidden="true"
				>
					{#each Array(35) as _}
						<span class="h-1.5 w-1.5 rounded-full bg-slate-200"></span>
					{/each}
				</div>
				<div
					class="absolute -right-1 bottom-2 grid grid-cols-6 gap-1 opacity-45"
					aria-hidden="true"
				>
					{#each Array(30) as _}
						<span class="h-1.5 w-1.5 rounded-full bg-slate-200"></span>
					{/each}
				</div>
				<div class="absolute right-12 top-1 flex flex-col gap-1" aria-hidden="true">
					<span class="h-1 w-8 rotate-[-58deg] rounded-full bg-orange-500"></span>
					<span class="ml-4 h-1 w-6 rotate-[-28deg] rounded-full bg-orange-500"></span>
					<span class="ml-5 h-1 w-4 rounded-full bg-orange-500"></span>
				</div>

				<div class="relative flex h-[clamp(11.75rem,32dvh,16.25rem)] items-center justify-center gap-2">
					{#each heroImages as image, index}
						<div
							class={`relative h-[clamp(9.75rem,25.5dvh,13.2rem)] flex-1 overflow-hidden rounded-[clamp(1.65rem,7vw,2.5rem)] border-[4px] border-white bg-blue-50 shadow-xl shadow-blue-200/50 ${image.className}`}
							style={`max-width: ${index === 1 || index === 2 ? '5.8rem' : '5.1rem'};`}
						>
							<img src={image.src} alt={image.alt} class="h-full w-full object-cover" />
							<div class="absolute inset-0 bg-gradient-to-t from-slate-950/25 via-transparent to-white/5"></div>
						</div>
					{/each}

					<div
						class="absolute bottom-3 left-1/2 grid h-[clamp(3rem,13vw,4rem)] w-[clamp(3rem,13vw,4rem)] -translate-x-1/2 place-items-center rounded-[1.1rem] bg-white text-blue-600 shadow-2xl shadow-blue-300/60"
						aria-hidden="true"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-7 w-7">
							<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
							<circle cx="9" cy="7" r="4" />
							<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
							<path d="M16 3.13a4 4 0 0 1 0 7.75" />
						</svg>
					</div>
				</div>
			</div>

			<div class="landing-features mt-3 grid grid-cols-3 gap-2">
				{#each features as feature, index}
					<div class="relative text-center">
						{#if index > 0}
							<div class="absolute -left-1 top-8 h-12 w-px bg-slate-200"></div>
						{/if}
						<div class="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-white text-blue-600 shadow-lg shadow-slate-200">
							{#if feature.icon === 'calendar'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6">
									<path d="M8 2v4" />
									<path d="M16 2v4" />
									<rect x="3" y="4" width="18" height="18" rx="3" />
									<path d="M3 10h18" />
									<circle cx="17" cy="17" r="3" class="text-orange-500" />
								</svg>
							{:else if feature.icon === 'users'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6">
									<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
									<circle cx="9" cy="7" r="4" />
									<path d="M22 19c0-2-1.2-3.4-3-3.9" />
									<path d="M17 8.5a3 3 0 1 0-1-5.8" />
									<path d="m17.5 17.5 1.2 1.2 2.1-2.4" class="text-orange-500" />
								</svg>
							{:else}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6">
									<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
									<path d="m12 14 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" class="text-orange-500" />
								</svg>
							{/if}
						</div>
						<p class="mt-2 text-[0.8rem] font-black text-slate-950">{feature.title}</p>
						<p class="mt-1 text-xs font-semibold leading-[1.25] text-slate-500">{feature.desc}</p>
					</div>
				{/each}
			</div>
		</div>

		<div class="shrink-0 space-y-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-3">
			{#if loading}
				<div class="flex justify-center py-5">
					<div class="h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600"></div>
				</div>
			{:else if user}
				<a
					href="/dashboard"
					class="flex w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-5 py-3.5 text-base font-black text-white shadow-lg shadow-blue-600/25 active:scale-[0.99]"
				>
					Go to dashboard
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
						<path d="M5 12h14" />
						<path d="m13 5 7 7-7 7" />
					</svg>
				</a>
			{:else}
				<a
					href="/register"
					class="flex w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-5 py-3.5 text-base font-black text-white shadow-lg shadow-blue-600/25 active:scale-[0.99]"
				>
					Get Started
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
						<path d="M5 12h14" />
						<path d="m13 5 7 7-7 7" />
					</svg>
				</a>

				<a
					href="/login"
					class="flex w-full items-center justify-center rounded-2xl border border-blue-600 bg-white px-5 py-3.5 text-base font-black text-blue-600 active:scale-[0.99]"
				>
					Log In
				</a>
			{/if}
		</div>
	</div>
</section>

<style>
	.mobile-landing-shell {
		height: 100svh;
		max-height: 100svh;
	}

	@supports (height: 100dvh) {
		.mobile-landing-shell {
			height: 100dvh;
			max-height: 100dvh;
		}
	}

	.landing-logo :global(img) {
		height: clamp(2.9rem, 7.2dvh, 4rem);
	}

	@media (max-height: 720px) {
		.landing-logo :global(img) {
			height: 2.7rem;
		}

		.landing-features :global(svg) {
			width: 1.25rem;
			height: 1.25rem;
		}
	}

	@media (max-height: 650px) {
		.mobile-landing-shell {
			padding-bottom: 0.5rem;
			padding-top: max(0.5rem, env(safe-area-inset-top));
		}
	}
</style>
