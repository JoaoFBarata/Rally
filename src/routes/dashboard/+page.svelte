<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/firebase';
	import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
	import { getEventsCreatedByUser } from '$lib/services/event.service';
	import { getInvitesForUser } from '$lib/services/invite.service';
	import type { SportEvent, EventInvite } from '$lib/schema';
  import EventCard from '$lib/components/EventCard.svelte';

	let user = $state<User | null>(null);
	let loading = $state(true);
	let events = $state<SportEvent[]>([]);
	let invites = $state<EventInvite[]>([]);
	let error = $state('');

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
			if (!currentUser) {
				await goto('/');
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

	async function handleLogout() {
		await signOut(auth);
		await goto('/');
	}
</script>

{#if loading}
	<main class="min-h-screen bg-slate-950 text-white flex items-center justify-center">
		<p class="text-slate-300">Loading Rally...</p>
	</main>
{:else}
	<main class="min-h-screen bg-slate-950 text-white">
		<section class="mx-auto max-w-6xl px-6 py-8">
			<header class="mb-8 flex items-center justify-between">
				<div>
					<p class="text-sm uppercase tracking-[0.3em] text-emerald-400">Rally</p>
					<h1 class="mt-2 text-3xl font-bold">Dashboard</h1>
					<p class="mt-1 text-slate-300">
						Welcome, {user?.displayName ?? user?.email}
					</p>
				</div>

				<button
					onclick={handleLogout}
					class="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
				>
					Logout
				</button>
			</header>

			{#if error}
				<div class="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
					{error}
				</div>
			{/if}

			<section class="grid gap-6 md:grid-cols-3">
				<a
					href="/events/create"
					class="rounded-3xl bg-emerald-500 p-6 text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:scale-[1.02]"
				>
					<p class="text-sm font-semibold uppercase tracking-wide">Create</p>
					<h2 class="mt-2 text-2xl font-bold">New sports event</h2>
					<p class="mt-3 text-sm text-slate-900">
						Create a football match, padel game, run, gym session or another activity.
					</p>
				</a>

				<div class="rounded-3xl border border-slate-800 bg-slate-900 p-6">
					<p class="text-sm text-slate-400">Your events</p>
					<p class="mt-2 text-4xl font-bold">{events.length}</p>
					<p class="mt-2 text-sm text-slate-400">Events created by you</p>
				</div>

				<div class="rounded-3xl border border-slate-800 bg-slate-900 p-6">
					<p class="text-sm text-slate-400">Invitations</p>
					<p class="mt-2 text-4xl font-bold">{invites.length}</p>
					<p class="mt-2 text-sm text-slate-400">Pending or received invites</p>
				</div>
			</section>

			<section class="mt-10 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
				<div class="rounded-3xl border border-slate-800 bg-slate-900 p-6">
					<div class="mb-5 flex items-center justify-between">
						<h2 class="text-xl font-semibold">My events</h2>
						<a href="/events/create" class="text-sm font-medium text-emerald-400 hover:text-emerald-300">
							Create event
						</a>
					</div>

					{#if events.length === 0}
						<div class="rounded-2xl border border-dashed border-slate-700 p-8 text-center">
							<p class="text-slate-300">You have not created any events yet.</p>
							<a
								href="/events/create"
								class="mt-4 inline-flex rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-slate-950"
							>
								Create your first event
							</a>
						</div>
					{:else}
						<div class="space-y-4">
							{#each events as event}
                <EventCard {event} />
              {/each}
						</div>
					{/if}
				</div>

				<div class="rounded-3xl border border-slate-800 bg-slate-900 p-6">
					<h2 class="text-xl font-semibold">Nearby activity</h2>
					<div class="mt-5 flex h-72 items-center justify-center rounded-3xl bg-slate-950">
						<div class="text-center">
							<p class="text-5xl">🗺️</p>
							<p class="mt-3 font-medium">Map coming soon</p>
							<p class="mt-1 text-sm text-slate-400">
								Here users will discover events and people nearby.
							</p>
						</div>
					</div>
				</div>
			</section>
		</section>
	</main>
{/if}