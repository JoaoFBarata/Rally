<script lang="ts">
	import ExploreMap from '$lib/components/maps/ExploreMap.svelte';
	import type { Sport, SportEvent, SportLevel } from '$lib/schema';

	type PreviewEvent = Omit<SportEvent, 'startAt' | 'createdAt' | 'updatedAt'> & {
		startAt: null;
		createdAt: null;
		updatedAt: null;
		displayDate: string;
	};

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

	const DUMMY_EVENTS: PreviewEvent[] = [
		{
			id: 'demo-football-1',
			title: '5-a-side Football',
			sport: 'football',
			level: 'casual',
			creatorId: 'demo',
			description: 'Casual 5-a-side at the Jamor fields. Boots required.',
			location: {
				name: 'Centro Desportivo Nacional do Jamor',
				address: 'Cruz Quebrada, Oeiras',
				lat: 38.7051,
				lng: -9.2375
			},
			maxParticipants: 10,
			participantIds: ['a', 'b', 'c', 'd', 'e', 'f'],
			visibility: 'public',
			status: 'open',
			displayDate: 'Tomorrow, 6:00 PM',
			startAt: null,
			createdAt: null,
			updatedAt: null
		},
		{
			id: 'demo-running-1',
			title: 'Morning Park Run',
			sport: 'running',
			level: 'beginner',
			creatorId: 'demo',
			description: 'Easy 5 km loop around Parque das Nações. All paces welcome.',
			location: {
				name: 'Parque das Nações',
				address: 'Parque das Nações, Lisboa',
				lat: 38.7639,
				lng: -9.0966
			},
			maxParticipants: 20,
			participantIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
			visibility: 'public',
			status: 'open',
			displayDate: 'Saturday, 8:30 AM',
			startAt: null,
			createdAt: null,
			updatedAt: null
		},
		{
			id: 'demo-tennis-1',
			title: 'Mixed Doubles Tennis',
			sport: 'tennis',
			level: 'intermediate',
			creatorId: 'demo',
			description: 'Looking for a doubles partner for a friendly match at the Estoril club.',
			location: {
				name: 'Clube de Ténis do Estoril',
				address: 'Estoril, Cascais',
				lat: 38.7023,
				lng: -9.3913
			},
			maxParticipants: 4,
			participantIds: ['a', 'b'],
			visibility: 'public',
			status: 'open',
			displayDate: 'Sunday, 10:00 AM',
			startAt: null,
			createdAt: null,
			updatedAt: null
		},
		{
			id: 'demo-volleyball-1',
			title: 'Beach Volleyball',
			sport: 'volleyball',
			level: 'casual',
			creatorId: 'demo',
			description: 'Beach volleyball at Carcavelos. Bring sunscreen and a good attitude!',
			location: {
				name: 'Praia de Carcavelos',
				address: 'Carcavelos, Cascais',
				lat: 38.6878,
				lng: -9.334
			},
			maxParticipants: 12,
			participantIds: ['a', 'b', 'c', 'd', 'e'],
			visibility: 'public',
			status: 'open',
			displayDate: 'Saturday, 3:00 PM',
			startAt: null,
			createdAt: null,
			updatedAt: null
		},
		{
			id: 'demo-padel-1',
			title: 'Padel Doubles',
			sport: 'padel',
			level: 'intermediate',
			creatorId: 'demo',
			description: 'Friendly padel doubles. Need two more players to complete the court.',
			location: { name: 'Padel Oeiras', address: 'Oeiras, Lisboa', lat: 38.697, lng: -9.3115 },
			maxParticipants: 4,
			participantIds: ['a', 'b'],
			visibility: 'public',
			status: 'open',
			displayDate: 'Friday, 7:00 PM',
			startAt: null,
			createdAt: null,
			updatedAt: null
		},
		{
			id: 'demo-basketball-1',
			title: '3-on-3 Basketball',
			sport: 'basketball',
			level: 'casual',
			creatorId: 'demo',
			description: 'Pick-up 3v3 at Parque Eduardo VII outdoor courts.',
			location: {
				name: 'Parque Eduardo VII',
				address: 'Marquês de Pombal, Lisboa',
				lat: 38.7264,
				lng: -9.1503
			},
			maxParticipants: 6,
			participantIds: ['a', 'b', 'c', 'd'],
			visibility: 'public',
			status: 'open',
			displayDate: 'Wednesday, 5:30 PM',
			startAt: null,
			createdAt: null,
			updatedAt: null
		}
	];

	let filteredCount = $state(DUMMY_EVENTS.length);
</script>

<div class="min-h-screen bg-white dark:bg-slate-950">
	<!-- Top navigation -->
	<nav
		class="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-950"
	>
		<div class="flex items-center gap-3">
			<a
				href="/"
				class="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
				aria-label="Back to home"
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-4 w-4"
				>
					<path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
				</svg>
			</a>
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
		</div>

		<div class="flex items-center gap-3">
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
		<ExploreMap
			events={DUMMY_EVENTS as unknown as SportEvent[]}
			onFilteredCountChange={(n) => (filteredCount = n)}
			getEventHref={() => '/register'}
		/>

		<p class="mt-3 text-sm text-slate-400 dark:text-slate-500">
			Showing {filteredCount} of {DUMMY_EVENTS.length} sample events ·
			<a href="/register" class="font-semibold text-blue-600 hover:underline dark:text-blue-400"
				>Sign up to create and join events</a
			>
		</p>
	</div>

	<!-- Popular events -->
	<div class="mx-auto max-w-6xl px-5 pb-8 pt-12">
		<h2 class="text-2xl font-black text-slate-900 dark:text-white">Popular events</h2>
		<p class="mt-1 text-sm text-slate-500 dark:text-slate-400"></p>

		<div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each DUMMY_EVENTS as event (event.id)}
				<div
					class="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
				>
					<div class="flex items-start justify-between gap-3">
						<span class="text-2xl">{sportIcons[event.sport]}</span>
						<span
							class={`rounded-full px-3 py-1 text-xs font-bold capitalize ${levelColors[event.level ?? 'casual']}`}
						>
							{event.level ?? 'casual'}
						</span>
					</div>

					<h3 class="mt-3 font-bold text-slate-900 dark:text-white">{event.title}</h3>

					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
						{event.description}
					</p>

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
							<span>{event.displayDate}</span>
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
						Join event
					</a>
				</div>
			{/each}
		</div>
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
