<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
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

<a
	href={resolve('/dashboard')}
	class="inline-flex rounded-full bg-blue-50 px-5 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
>
	← Back to dashboard
</a>

{#if loading}
	<div
		class="mt-8 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
	>
		<p class="text-slate-500 dark:text-slate-400">Loading event...</p>
	</div>
{:else if error && !event}
	<div
		class="mt-8 rounded-[2rem] border border-red-200 bg-red-50 p-8 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
	>
		{error}
	</div>
{:else if event}
	<div class="mt-8 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
		<section
			class="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
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
				class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
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

				<button
					onclick={handleJoinEvent}
					disabled={actionLoading || event.status === 'full'}
					class="mt-5 w-full rounded-2xl bg-blue-600 px-5 py-4 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-blue-950/40"
				>
					{actionLoading ? 'Joining...' : event.status === 'full' ? 'Event full' : 'Join event'}
				</button>

				<a
					href={resolve(`/events/${event.id}/invite`)}
					class="mt-3 block rounded-2xl border border-slate-200 bg-white px-5 py-4 text-center font-bold text-blue-600 transition hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-slate-800"
				>
					Invite people
				</a>
			</div>

			<div
				class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Map</h2>

				<div class="mt-5 flex h-56 items-center justify-center rounded-3xl bg-slate-50 dark:bg-slate-800">
					<div class="text-center">
						<p class="text-5xl">🗺️</p>
						<p class="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
							Map placeholder
						</p>
					</div>
				</div>
			</div>
		</aside>
	</div>
{/if}