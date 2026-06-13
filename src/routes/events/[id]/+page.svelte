<!--src/routes/events/[id]/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { getEventById, joinEvent } from '$lib/services/event.service';
	import { getUserProfilesByIds } from '$lib/services/user.service';
	import EventMap from '$lib/components/maps/EventMap.svelte';
	import type { SportEvent, UserProfile } from '$lib/schema';
	import UserAvatar from '$lib/components/UserAvatar.svelte';

	let event = $state<SportEvent | null>(null);
	let loading = $state(true);
	let actionLoading = $state(false);
	let error = $state('');
	let participants = $state<UserProfile[]>([]);

  let isCreator = $derived.by(() => {
		const currentUser = auth.currentUser;
    	return !!currentUser && !!event && event.creatorId === currentUser.uid;
    });

    let isParticipant = $derived.by(() => {
        const currentUser = auth.currentUser;
        return !!currentUser && !!event && event.participantIds.includes(currentUser.uid);
    });

    let canJoin = $derived.by(() => {
        return !!event && !isCreator && !isParticipant && event.status !== 'full';
    });

    let canInvite = $derived.by(() => {
        return !!event && (isCreator || isParticipant);
    });

	function formatDate(dateValue: unknown) {
		try {
			const timestamp = dateValue as { toDate?: () => Date };

			if (timestamp?.toDate) {
				return timestamp.toDate().toLocaleString('en-GB', {
					weekday: 'long',
					day: '2-digit',
					month: 'long',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				});
			}

			return 'Date not set';
		} catch {
			return 'Date not set';
		}
	}

	onMount(async () => {
		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto(resolve('/login'));
			return;
		}

		try {
			const eventId = page.params.id;

			if (!eventId) {
				error = 'Event ID not found.';
				loading = false;
				return;
			}

			event = await getEventById(eventId);
			if (event) {
				participants = await getUserProfilesByIds(event.participantIds ?? []);
			}
			else {
				error = 'Event not found.';
			}
		} catch (err) {
			console.error('Event detail error:', err);

			if (err instanceof Error) {
				error = err.message;
			} else {
				error = 'Could not load event.';
			}
		} finally {
			loading = false;
		}
	});

	async function handleJoinEvent() {
		const currentUser = auth.currentUser;

		if (!currentUser || !event) return;

		actionLoading = true;
		error = '';

		try {
			await joinEvent(event.id, currentUser.uid);

			const updatedEvent = await getEventById(event.id);

			if (updatedEvent) {
				event = updatedEvent;
				participants = await getUserProfilesByIds(updatedEvent.participantIds ?? []);
			}
		} catch (err) {
			console.error('Join event error:', err);

			if (err instanceof Error) {
				error = err.message;
			} else {
				error = 'Could not join event.';
			}
		} finally {
			actionLoading = false;
		}
	}
</script>

<a
	href={resolve('/dashboard')}
	class="inline-flex rounded-full bg-blue-50 px-5 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
>
	← Back to dashboard
</a>

{#if loading}
	<div
		class="mt-8 rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
	>
		<p class="text-slate-500 dark:text-slate-400">Loading event...</p>
	</div>
{:else if error && !event}
	<div
		class="mt-8 rounded-4xl border border-red-200 bg-red-50 p-8 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
	>
		{error}
	</div>
{:else if event}
	<div class="mt-8 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
		<section
			class="rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
		>
			<p class="text-sm font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
				{event.sport}
			</p>

			<h1 class="mt-3 text-4xl font-black tracking-tight text-slate-950 dark:text-slate-50">
				{event.title}
			</h1>

			<p class="mt-4 text-slate-600 dark:text-slate-300">
				{event.description || 'No description provided.'}
			</p>

			<div class="mt-8 grid gap-4 md:grid-cols-2">
				<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
					<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Date and time</p>
					<p class="mt-2 font-bold text-slate-950 dark:text-slate-50">
						{formatDate(event.startAt)}
					</p>
				</div>

				<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
					<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Location</p>
					<p class="mt-2 font-bold text-slate-950 dark:text-slate-50">
						{event.location.name}
					</p>

					{#if event.location.address}
						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
							{event.location.address}
						</p>
					{/if}
				</div>

				<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
					<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Participants</p>
					<p class="mt-2 font-bold text-slate-950 dark:text-slate-50">
						{event.participantIds.length}/{event.maxParticipants}
					</p>
				</div>
				<div class="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
					<p class="text-sm font-medium text-slate-500 dark:text-slate-400">Price</p>

					{#if event.pricePerPerson}
						<p class="mt-2 font-bold text-slate-950 dark:text-slate-50">
							€{event.pricePerPerson.toFixed(2)} per person
						</p>
					{:else}
						<p class="mt-2 font-bold text-slate-950 dark:text-slate-50">
							Free / not defined
						</p>
					{/if}
				</div>
			</div>
			<div
				class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<div class="flex items-center justify-between gap-4">
					<div>
						<p class="text-sm font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
							Players
						</p>

						<h2 class="mt-2 text-2xl font-black text-slate-950 dark:text-slate-50">
							People in this event
						</h2>
					</div>

					<div class="rounded-2xl bg-blue-50 px-4 py-2 text-center dark:bg-blue-950">
						<p class="text-lg font-black text-blue-600 dark:text-blue-300">
							{participants.length}/{event.maxParticipants}
						</p>
						<p class="text-xs font-medium text-slate-500 dark:text-slate-400">
							players
						</p>
					</div>
				</div>

				{#if participants.length > 0}
					<div class="mt-5 space-y-3">
						{#each participants as participant (participant.id)}
							<div
								class="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
							>
								<div class="flex min-w-0 items-center gap-3">
									<UserAvatar
										photoURL={participant.photoURL}
										displayName={participant.displayName}
										email={participant.email}
										size="md"
									/>

									<div class="min-w-0">
										<p class="truncate font-bold text-slate-950 dark:text-slate-50">
											{participant.displayName}
										</p>

										<p class="truncate text-xs text-slate-500 dark:text-slate-400">
											@{participant.rallyTag}
										</p>
									</div>
								</div>

								{#if participant.level}
									<span
										class="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300"
									>
										{participant.level}
									</span>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<div class="mt-5 rounded-2xl bg-slate-50 p-5 text-center dark:bg-slate-800">
						<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">
							No players yet.
						</p>
					</div>
				{/if}
			</div>
			{#if error}
				<div
					class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
				>
					{error}
				</div>
			{/if}
		</section>

		<aside class="space-y-6">
			<div
				class="rounded-4xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Team status</h2>

				<div class="mt-5 rounded-2xl bg-blue-50 p-5 dark:bg-blue-950">
					<p class="text-4xl font-black text-blue-600 dark:text-blue-300">
						{event.participantIds.length}/{event.maxParticipants}
					</p>
					<p class="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
						confirmed players
					</p>
				</div>

				{#if isCreator}
                    <div
                        class="mt-5 rounded-2xl bg-blue-50 px-5 py-4 text-center font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    >
                        You are hosting this event
                    </div>
                {:else if isParticipant}
                    <div
                        class="mt-5 rounded-2xl bg-green-50 px-5 py-4 text-center font-bold text-green-700 dark:bg-green-950 dark:text-green-300"
                    >
                        You are already joining this event
                    </div>
                {:else if event.status === 'full'}
                    <div
                        class="mt-5 rounded-2xl bg-slate-100 px-5 py-4 text-center font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300"
                    >
                        Event full
                    </div>
                {:else}
                    <button
                        onclick={handleJoinEvent}
                        disabled={actionLoading}
                        class="mt-5 w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
                    >
                        {actionLoading ? 'Joining...' : 'Join event'}
                    </button>
                {/if}

				{#if canInvite}
                    <a
                        href={resolve(`/events/${event.id}/invite`)}
                        class="mt-3 block rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-400"
                    >
                        Invite people
                    </a>
                {/if}
			</div>

			<EventMap
				lat={event.location.lat}
				lng={event.location.lng}
				name={event.location.name}
				address={event.location.address}
			/>
		</aside>
	</div>
{/if}