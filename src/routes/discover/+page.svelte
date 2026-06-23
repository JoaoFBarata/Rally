<script lang="ts">
	import { onMount } from 'svelte';
	import ExploreMap from '$lib/components/maps/ExploreMap.svelte';
	import { getPublicEvents } from '$lib/services/explore.service';
	import type { Sport, SportEvent, SportLevel } from '$lib/schema';
	import { authState } from '$lib/auth.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';

	const sportIcons: Record<Sport, string> = {
		football: '⚽',
		tennis: '🎾',
		padel: '🏸',
		basketball: '🏀',
		running: '🏃',
		volleyball: '🏐',
		cycling: '🚴',
		gym: '🏋️',
		other: '🏅'
	};

	const levelColors: Record<SportLevel, string> = {
		beginner: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
		casual: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
		intermediate: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
		advanced: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
	};

	let events = $state<SportEvent[]>([]);
	let loading = $state(true);
	let loadError = $state('');
	let filteredCount = $state(0);

	function formatDate(startAt: unknown): string {
		try {
			const ts = startAt as { toDate?: () => Date };
			if (ts?.toDate) {
				return ts.toDate().toLocaleString('en-GB', {
					weekday: 'short',
					day: '2-digit',
					month: 'short',
					hour: '2-digit',
					minute: '2-digit'
				});
			}
		} catch {
			// fall through
		}
		return 'Date TBD';
	}

	onMount(async () => {
		try {
			events = await getPublicEvents();
			filteredCount = events.length;
		} catch (err) {
			console.error('Discover events error:', err);
			loadError = err instanceof Error ? err.message : 'Could not load events.';
		} finally {
			loading = false;
		}
	});
</script>

<div class="min-h-screen bg-white dark:bg-slate-950">
	<!-- Top navigation -->
	<nav
		class="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-950"
	>
		<a href="/">
			<img
				src="/rally-logo-black.png"
				alt="Rally"
				class="h-8 w-auto object-contain dark:hidden"
			/>
			<img
				src="/rally-logo-white.png"
				alt="Rally"
				class="hidden h-8 w-auto object-contain dark:block"
			/>
		</a>

		<div class="flex items-center gap-3">
			{#if authState.user}
				<a href="/dashboard" class="rounded-full transition hover:opacity-80" aria-label="Go to dashboard">
					<UserAvatar
						displayName={authState.user.displayName}
						email={authState.user.email}
						photoURL={authState.user.photoURL}
						size="md"
					/>
				</a>
			{:else}
				<a
					href="/login"
					class="text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
				>
					Sign in
				</a>
				<a
					href="/register"
					class="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
				>
					Get started
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
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
		</div>
	</nav>

	<!-- Hero -->
	<div class="px-6 py-10 text-center">
		<h1 class="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
			Explore sports near you
		</h1>
		<p class="mx-auto mt-3 max-w-md text-base text-slate-500 dark:text-slate-400">
			Browse open events on the map, filter by sport and level, and join the ones that fit.
		</p>
	</div>

	<!-- Map -->
	<div class="mx-auto max-w-6xl px-5">
		{#if loading}
			<div
				class="flex h-96 items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
			>
				<p class="text-slate-400 dark:text-slate-500">Loading events...</p>
			</div>
		{:else if loadError}
			<div
				class="flex h-48 items-center justify-center rounded-3xl border border-red-200 bg-red-50 p-6 text-center text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
			>
				{loadError}
			</div>
		{:else}
			<ExploreMap
				{events}
				onFilteredCountChange={(n) => (filteredCount = n)}
				getEventHref={() => '/register'}
			/>

			<p class="mt-3 text-sm text-slate-400 dark:text-slate-500">
				Showing {filteredCount} of {events.length} events ·
				<a
					href="/register"
					class="font-semibold text-blue-600 hover:underline dark:text-blue-400"
				>Sign up to create and join events</a>
			</p>
		{/if}
	</div>

	<!-- Popular events -->
	<div class="mx-auto max-w-6xl px-5 pb-8 pt-12">
		<h2 class="text-2xl font-black text-slate-900 dark:text-white">Popular events</h2>
		<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Open events happening soon.</p>

		{#if loading}
			<div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each { length: 6 } as _, i (i)}
					<div
						class="h-52 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
					></div>
				{/each}
			</div>
		{:else if events.length === 0}
			<div
				class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
			>
				No public events right now. Be the first to create one!
			</div>
		{:else}
			<div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each events.slice(0, 9) as event (event.id)}
					<div
						class="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
					>
						<div class="flex items-start justify-between gap-3">
							<span class="text-2xl">{sportIcons[event.sport] ?? '🏅'}</span>
							<span
								class={`rounded-full px-3 py-1 text-xs font-bold capitalize ${levelColors[event.level ?? 'casual']}`}
							>
								{event.level ?? 'casual'}
							</span>
						</div>

						<h3 class="mt-3 font-bold text-slate-900 dark:text-white">{event.title}</h3>

						{#if event.description}
							<p class="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
								{event.description}
							</p>
						{/if}

						<div class="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-400">
							<div class="flex items-center gap-2">
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="h-4 w-4 shrink-0 text-slate-400"
								>
									<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
									<circle cx="12" cy="10" r="3" />
								</svg>
								<span class="truncate">{event.location.name}</span>
							</div>

							<div class="flex items-center gap-2">
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="h-4 w-4 shrink-0 text-slate-400"
								>
									<circle cx="12" cy="12" r="10" />
									<polyline points="12 6 12 12 16 14" />
								</svg>
								<span>{formatDate(event.startAt)}</span>
							</div>

							<div class="flex items-center gap-2">
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="h-4 w-4 shrink-0 text-slate-400"
								>
									<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
									<circle cx="9" cy="7" r="4" />
									<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
									<path d="M16 3.13a4 4 0 0 1 0 7.75" />
								</svg>
								<span>{event.participantIds.length}/{event.maxParticipants} players</span>
							</div>
						</div>

						<a
							href="/register"
							class="mt-5 block rounded-xl bg-slate-100 px-4 py-2.5 text-center text-sm font-bold text-slate-700 transition hover:bg-blue-600 hover:text-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-blue-600 dark:hover:text-white"
						>
							Sign up to join
						</a>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- CTA banner -->
	<div class="mx-auto max-w-6xl px-5 pb-16">
		<div class="rounded-3xl bg-blue-600 px-8 py-12 text-center">
			<h2 class="text-3xl font-black text-white">Ready to play?</h2>
			<p class="mx-auto mt-3 max-w-sm text-base text-blue-100">
				Create a free account to join events, invite friends, and organise your own games.
			</p>
			<div class="mt-7 flex items-center justify-center gap-3">
				<a
					href="/register"
					class="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-blue-600 shadow-lg transition hover:bg-blue-50"
				>
					Create free account
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
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
					href="/login"
					class="rounded-full border border-white/30 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
				>
					Sign in
				</a>
			</div>
		</div>
	</div>
</div>
