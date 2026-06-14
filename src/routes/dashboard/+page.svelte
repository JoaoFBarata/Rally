<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { onAuthStateChanged, type User } from 'firebase/auth';
	import {
    getEffectiveEventStatus,
    getEventsCreatedByUser,
    getEventsForUser,
    getUpcomingEvents,
    sortEventsByStartDate
  } from '$lib/services/event.service';
	import { getInvitesForUser } from '$lib/services/invite.service';
	import { ensureUserProfile } from '$lib/services/user.service';
	import type { EventInvite, SportEvent, UserProfile } from '$lib/schema';
	import EventCard from '$lib/components/EventCard.svelte';
	import UserMiniMap from '$lib/components/maps/UserMiniMap.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import RallyWordmark from '$lib/components/RallyWordmark.svelte';

	let user = $state<User | null>(null);
	let profile = $state<UserProfile | null>(null);
	let loading = $state(true);
	let events = $state<SportEvent[]>([]);
  let joinedEvents = $state<SportEvent[]>([]);
  let allUserEvents = $state<SportEvent[]>([]);
	let invites = $state<EventInvite[]>([]);
	let error = $state('');

	let pendingInvites = $derived(invites.filter((invite) => invite.status === 'pending'));

	let nextEvent = $derived.by(() => {
    return getUpcomingEvents(allUserEvents)[0] ?? null;
  });

	let activeEventsCount = $derived(getUpcomingEvents(allUserEvents).length);

	let totalParticipants = $derived(
		events.reduce((total, event) => total + (event.participantIds?.length ?? 0), 0)
	);

	function formatDate(dateValue: unknown) {
		try {
			const timestamp = dateValue as { toDate?: () => Date };

			if (timestamp?.toDate) {
				return timestamp.toDate().toLocaleString('en-GB', {
					weekday: 'short',
					day: '2-digit',
					month: 'short',
					hour: '2-digit',
					minute: '2-digit'
				});
			}

			return 'Date not set';
		} catch {
			return 'Date not set';
		}
	}

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
			if (!currentUser) {
				await goto(resolve('/'));
				return;
			}

			user = currentUser;
			loading = true;
			error = '';

			try {
				profile = await ensureUserProfile(currentUser);
				const createdEvents = await getEventsCreatedByUser(currentUser.uid);
        const participantEvents = await getEventsForUser(currentUser.uid);

        const eventsById = new Map<string, SportEvent>();

        for (const event of createdEvents) {
          eventsById.set(event.id, event);
        }

        for (const event of participantEvents) {
          eventsById.set(event.id, event);
        }

        allUserEvents = sortEventsByStartDate(Array.from(eventsById.values()));

        events = allUserEvents.filter((event) => event.creatorId === currentUser.uid);

        joinedEvents = allUserEvents.filter(
          (event) => event.creatorId !== currentUser.uid && event.participantIds.includes(currentUser.uid)
        );

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
			} finally {
				loading = false;
			}
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

				<h1 class="mt-2 text-3xl font-black text-slate-950 dark:text-slate-50">
					Dashboard
				</h1>

				<p class="mt-1 text-slate-500 dark:text-slate-400">
					Welcome back, {profile?.displayName ?? user?.displayName ?? user?.email}
				</p>
			</div>

			<a
				href={resolve('/profile')}
				class="rounded-full transition hover:scale-105"
				aria-label="Go to profile"
			>
				<UserAvatar
					photoURL={profile?.photoURL ?? user?.photoURL}
					displayName={profile?.displayName ?? user?.displayName}
					email={profile?.email ?? user?.email}
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

		<section class="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
			<div
				class="rounded-4xl bg-blue-600 p-7 text-white shadow-xl shadow-blue-600/25 dark:shadow-blue-950/40"
			>
				<div class="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p class="text-sm font-black uppercase tracking-[0.25em] text-blue-100">
							Rally home
						</p>

						<h2 class="mt-3 text-3xl font-black">
							Organize your next game
						</h2>

						<p class="mt-3 max-w-xl text-sm leading-6 text-blue-50">
							Create events, invite friends, manage your groups and keep every sports plan in one place.
						</p>
					</div>

					<a
						href={resolve('/events/create')}
						class="shrink-0 rounded-2xl bg-white px-5 py-3 text-center font-black text-blue-600 transition hover:bg-blue-50"
					>
						Create event
					</a>
				</div>

				<div class="mt-6 grid gap-3 sm:grid-cols-3">
					<a
						href={resolve('/explore')}
						class="rounded-3xl bg-white/10 p-4 transition hover:bg-white/15"
					>
						<p class="text-2xl">🔎</p>
						<p class="mt-2 font-black">Explore</p>
						<p class="mt-1 text-xs text-blue-100">Find events near you</p>
					</a>

					<a
						href={resolve('/messages')}
						class="rounded-3xl bg-white/10 p-4 transition hover:bg-white/15"
					>
						<p class="text-2xl">💬</p>
						<p class="mt-2 font-black">Messages</p>
						<p class="mt-1 text-xs text-blue-100">Chats and invites</p>
					</a>

					<a
						href={resolve('/profile')}
						class="rounded-3xl bg-white/10 p-4 transition hover:bg-white/15"
					>
						<p class="text-2xl">👤</p>
						<p class="mt-2 font-black">Profile</p>
						<p class="mt-1 text-xs text-blue-100">Edit your Rally identity</p>
					</a>
				</div>
			</div>

			<div
				class="rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<div class="flex items-center gap-4">
					<UserAvatar
						photoURL={profile?.photoURL ?? user?.photoURL}
						displayName={profile?.displayName ?? user?.displayName}
						email={profile?.email ?? user?.email}
						size="xl"
					/>

					<div class="min-w-0">
						<p class="truncate text-xl font-black text-slate-950 dark:text-slate-50">
							{profile?.displayName ?? user?.displayName ?? 'Rally user'}
						</p>

						<p class="truncate text-sm text-slate-500 dark:text-slate-400">
							@{profile?.rallyTag ?? 'rally'}
						</p>
					</div>
				</div>

				<div class="mt-5 grid grid-cols-2 gap-3">
					<div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
						<p class="text-xs font-bold text-slate-500 dark:text-slate-400">Level</p>
						<p class="mt-1 font-black capitalize text-slate-950 dark:text-slate-50">
							{profile?.level ?? 'casual'}
						</p>
					</div>

					<div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
						<p class="text-xs font-bold text-slate-500 dark:text-slate-400">City</p>
						<p class="mt-1 truncate font-black text-slate-950 dark:text-slate-50">
							{profile?.city || 'Not set'}
						</p>
					</div>
				</div>

				<div class="mt-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
					<p class="text-xs font-bold text-slate-500 dark:text-slate-400">Sports</p>

					{#if profile?.sports?.length}
						<div class="mt-2 flex flex-wrap gap-2">
							{#each profile.sports.slice(0, 4) as sport (sport)}
								<span
									class="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
								>
									{sport}
								</span>
							{/each}
						</div>
					{:else}
						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
							Add your sports in Profile.
						</p>
					{/if}
				</div>
			</div>
		</section>

		<section class="mt-6 grid gap-6 md:grid-cols-3">
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
				<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Active events</p>
				<p class="mt-2 text-4xl font-black text-slate-950 dark:text-slate-50">
					{activeEventsCount}
				</p>
				<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
					Open or upcoming plans
				</p>
			</div>

			<div
				class="rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Invitations</p>
				<p class="mt-2 text-4xl font-black text-slate-950 dark:text-slate-50">
					{pendingInvites.length}
				</p>
				<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
					Pending invites
				</p>
			</div>
		</section>

		<section class="mt-10 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
      <div class="space-y-6">
        <section
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
        </section>

        <section
          class="rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
        >
          <div class="mb-5 flex items-center justify-between">
            <h2 class="text-xl font-black text-slate-950 dark:text-slate-50">
              Events I joined
            </h2>

            <a
              href={resolve('/explore')}
              class="text-sm font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Explore
            </a>
          </div>

          {#if joinedEvents.length === 0}
            <div
              class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800"
            >
              <p class="text-slate-500 dark:text-slate-400">
                You have not joined any events yet.
              </p>

              <a
                href={resolve('/explore')}
                class="mt-4 inline-flex rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 dark:shadow-blue-950/40"
              >
                Find events
              </a>
            </div>
          {:else}
            <div class="space-y-4">
              {#each joinedEvents as event (event.id)}
                <EventCard {event} />
              {/each}
            </div>
          {/if}
        </section>
      </div>

      <div class="space-y-6">
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

        <div
          class="rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
        >
          <h2 class="text-xl font-black text-slate-950 dark:text-slate-50">
            Next event
          </h2>

          {#if nextEvent}
            <div class="mt-5 rounded-3xl bg-slate-50 p-5 dark:bg-slate-800">
              <p class="text-sm font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
                {nextEvent.sport}
              </p>

              <p class="mt-2 text-lg font-black text-slate-950 dark:text-slate-50">
                {nextEvent.title}
              </p>

              <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
                🕒 {formatDate(nextEvent.startAt)}
              </p>

              <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
                👥 {nextEvent.participantIds.length}/{nextEvent.maxParticipants} players
              </p>

              <a
                href={resolve(`/events/${nextEvent.id}`)}
                class="mt-4 inline-flex rounded-2xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
              >
                View event
              </a>
            </div>
          {:else}
            <p class="mt-4 text-sm text-slate-500 dark:text-slate-400">
              No upcoming events yet.
            </p>
          {/if}
        </div>

        <div
          class="rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
        >
          <h2 class="text-xl font-black text-slate-950 dark:text-slate-50">
            Rally stats
          </h2>

          <div class="mt-5 grid grid-cols-2 gap-3">
            <div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
              <p class="text-2xl font-black text-slate-950 dark:text-slate-50">
                {totalParticipants}
              </p>
              <p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                total players
              </p>
            </div>

            <div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
              <p class="text-2xl font-black text-slate-950 dark:text-slate-50">
                {profile?.sports?.length ?? 0}
              </p>
              <p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                sports
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
	</section>
{/if}