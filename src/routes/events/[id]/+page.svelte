<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/firebase';
	import { getEventById, joinEvent } from '$lib/services/event.service';
	import type { SportEvent } from '$lib/schema';

	let event = $state<SportEvent | null>(null);
	let loading = $state(true);
	let actionLoading = $state(false);
	let error = $state('');

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
			await goto('/login');
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

			if (!event) {
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
			event = await getEventById(event.id);
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

<main class="min-h-screen bg-slate-950 text-white">
	<section class="mx-auto max-w-5xl px-6 py-10">
		<a href="/dashboard" class="text-sm text-emerald-400 hover:text-emerald-300">
			← Back to dashboard
		</a>

		{#if loading}
			<div class="mt-10 rounded-3xl border border-slate-800 bg-slate-900 p-8">
				<p class="text-slate-300">Loading event...</p>
			</div>
		{:else if error && !event}
			<div class="mt-10 rounded-3xl border border-red-500/40 bg-red-500/10 p-8 text-red-200">
				{error}
			</div>
		{:else if event}
			<div class="mt-8 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
				<section class="rounded-3xl border border-slate-800 bg-slate-900 p-8">
					<p class="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">
						{event.sport}
					</p>

					<h1 class="mt-3 text-4xl font-bold">
						{event.title}
					</h1>

					<p class="mt-4 text-slate-300">
						{event.description || 'No description provided.'}
					</p>

					<div class="mt-8 grid gap-4 md:grid-cols-2">
						<div class="rounded-2xl bg-slate-950 p-5">
							<p class="text-sm text-slate-400">Date and time</p>
							<p class="mt-2 font-semibold">{formatDate(event.startAt)}</p>
						</div>

						<div class="rounded-2xl bg-slate-950 p-5">
							<p class="text-sm text-slate-400">Location</p>
							<p class="mt-2 font-semibold">{event.location.name}</p>
							{#if event.location.address}
								<p class="mt-1 text-sm text-slate-400">{event.location.address}</p>
							{/if}
						</div>

						<div class="rounded-2xl bg-slate-950 p-5">
							<p class="text-sm text-slate-400">Participants</p>
							<p class="mt-2 font-semibold">
								{event.participantIds.length}/{event.maxParticipants}
							</p>
						</div>

						<div class="rounded-2xl bg-slate-950 p-5">
							<p class="text-sm text-slate-400">Price</p>
							{#if event.pricePerPerson}
								<p class="mt-2 font-semibold">€{event.pricePerPerson.toFixed(2)} per person</p>
							{:else}
								<p class="mt-2 font-semibold">Free / not defined</p>
							{/if}
						</div>
					</div>

					{#if error}
						<div class="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
							{error}
						</div>
					{/if}
				</section>

				<aside class="space-y-6">
					<div class="rounded-3xl border border-slate-800 bg-slate-900 p-6">
						<h2 class="text-xl font-bold">Team status</h2>

						<div class="mt-5 rounded-2xl bg-slate-950 p-5">
							<p class="text-4xl font-bold">
								{event.participantIds.length}/{event.maxParticipants}
							</p>
							<p class="mt-1 text-sm text-slate-400">confirmed players</p>
						</div>

						<button
							onclick={handleJoinEvent}
							disabled={actionLoading || event.status === 'full'}
							class="mt-5 w-full rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
						>
							{actionLoading ? 'Joining...' : event.status === 'full' ? 'Event full' : 'Join event'}
						</button>

						<a
							href={`/events/${event.id}/invite`}
							class="mt-3 block rounded-xl border border-slate-700 px-5 py-3 text-center font-semibold text-slate-200 transition hover:bg-slate-800"
						>
							Invite people
						</a>
					</div>

					<div class="rounded-3xl border border-slate-800 bg-slate-900 p-6">
						<h2 class="text-xl font-bold">Map</h2>

						<div class="mt-5 flex h-56 items-center justify-center rounded-3xl bg-slate-950">
							<div class="text-center">
								<p class="text-5xl">🗺️</p>
								<p class="mt-2 text-sm text-slate-400">Map placeholder</p>
							</div>
						</div>
					</div>
				</aside>
			</div>
		{/if}
	</section>
</main>