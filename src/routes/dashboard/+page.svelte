<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { onAuthStateChanged, type User } from 'firebase/auth';
	import { getEventsCreatedByUser } from '$lib/services/event.service';
	import { getInvitesForUser } from '$lib/services/invite.service';
	import type { SportEvent, EventInvite } from '$lib/schema';
	import EventCard from '$lib/components/EventCard.svelte';
	import UserMiniMap from '$lib/components/maps/UserMiniMap.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import RallyWordmark from '$lib/components/RallyWordmark.svelte';

	let user = $state<User | null>(null);
	let loading = $state(true);
	let events = $state<SportEvent[]>([]);
	let invites = $state<EventInvite[]>([]);
	let error = $state('');

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
			if (!currentUser) {
				await goto(resolve('/'));
				return;
			}

			user = currentUser;

			try {
				events = await getEventsCreatedByUser(currentUser.uid);
				invites = await getInvitesForUser(currentUser.uid);
			} catch (err) {
				console.error('Dashboard load error:', err);

				if (err instanceof Error && err.message.includes('index')) {
					error = 'Your events are still being prepared. Please try again in a moment.';
				} else if (err instanceof Error && err.message.includes('permissions')) {
					error = 'You do not have permission to load these events.';
				} else {
					error = 'Could not load your dashboard data.';
				}
			}

			loading = false;
		});

		return unsubscribe;
	});

</script>

{#if loading}
	<div class="flex min-h-[70vh] items-center justify-center">
		<p class="text-slate-500 dark:text-slate-400">Loading Rally...</p>
	</div>
{:else}
	<section class="mx-auto max-w-6xl px-5 py-6">
		<header class="mb-6 flex items-start justify-between gap-4">
			<div>
				<RallyWordmark size="sm" />

				<h1 class="mt-2 text-3xl font-bold text-slate-950 dark:text-slate-50">
					Dashboard
				</h1>

				<p class="mt-1 text-slate-500 dark:text-slate-400">
					Welcome, {user?.displayName ?? user?.email}
				</p>
			</div>
			<a
				href={resolve('/profile')}
				class="rounded-full transition hover:scale-105"
				aria-label="Go to profile"
			>
				<UserAvatar
					photoURL={user?.photoURL}
					displayName={user?.displayName}
					email={user?.email}
					size="lg"
				/>
			</a>
		</header>

		{#if error}
			<div
				class="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
			>
				{error}
			</div>
		{/if}

		<section class="grid gap-6 md:grid-cols-3">
			<a
				href={resolve('/events/create')}
				class="rounded-4xl bg-blue-600 p-6 text-white shadow-xl shadow-blue-600/25 transition hover:scale-[1.02] hover:bg-blue-700 dark:shadow-blue-950/40"
			>
				<p class="text-sm font-bold uppercase tracking-wide text-blue-100">Create</p>
				<h2 class="mt-2 text-2xl font-black">New sports event</h2>
				<p class="mt-3 text-sm leading-6 text-blue-50">
					Create a football match, padel game, run, gym session or another activity.
				</p>
			</a>

			<div
				class="rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Your events</p>
				<p class="mt-2 text-4xl font-black text-slate-950 dark:text-slate-50">
					{events.length}
				</p>
				<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
					Events created by you
				</p>
			</div>

			<div
				class="rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Invitations</p>
				<p class="mt-2 text-4xl font-black text-slate-950 dark:text-slate-50">
					{invites.length}
				</p>
				<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
					Pending or received invites
				</p>
			</div>
		</section>

		<section class="mt-10 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
			<div
				class="rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<div class="mb-5 flex items-center justify-between">
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">
						My events
					</h2>

					<a
						href={resolve('/events/create')}
						class="text-sm font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
					>
						Create event
					</a>
				</div>

				{#if events.length === 0}
					<div
						class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800"
					>
						<p class="text-slate-500 dark:text-slate-400">
							You have not created any events yet.
						</p>

						<a
							href={resolve('/events/create')}
							class="mt-4 inline-flex rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 dark:shadow-blue-950/40"
						>
							Create your first event
						</a>
					</div>
				{:else}
					<div class="space-y-4">
						{#each events as event (event.id)}
							<EventCard {event} />
						{/each}
					</div>
				{/if}
			</div>

			<div
				class="rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">
					Nearby activity
				</h2>

				<div class="mt-5">
					<UserMiniMap />
				</div>
			</div>
		</section>
	</section>
{/if}