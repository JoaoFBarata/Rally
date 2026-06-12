<!-- src/routes/events/[id]/invite/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { inviteUserToEvent } from '$lib/services/invite.service';

	let eventId = $state('');
	let userIdToInvite = $state('');
	let loading = $state(false);
	let success = $state('');
	let error = $state('');

	onMount(async () => {
		if (!auth.currentUser) {
			await goto(resolve('/login'));
			return;
		}

		const id = page.params.id;

		if (!id) {
			error = 'Event ID not found.';
			return;
		}

		eventId = id;
	});

	async function handleInvite() {
		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto(resolve('/login'));
			return;
		}

		if (!userIdToInvite) {
			error = 'Please insert the user ID to invite.';
			return;
		}

		loading = true;
		error = '';
		success = '';

		try {
			await inviteUserToEvent({
				eventId,
				fromUserId: currentUser.uid,
				toUserId: userIdToInvite
			});

			success = 'Invite sent successfully.';
			userIdToInvite = '';
		} catch (err) {
			console.error('Invite error:', err);

			if (err instanceof Error) {
				error = err.message;
			} else {
				error = 'Could not send invite.';
			}
		} finally {
			loading = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl">
	<a
		href={resolve(`/events/${eventId}`)}
		class="inline-flex rounded-full bg-blue-50 px-5 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
	>
		← Back to event
	</a>

	<div
		class="mt-6 rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
	>
		<p class="text-sm font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
			Rally
		</p>

		<h1 class="mt-2 text-3xl font-black text-slate-950 dark:text-slate-50">
			Invite people
		</h1>

		<p class="mt-3 text-slate-500 dark:text-slate-400">
			For now, invite a user by their Firebase user ID. Later, we will replace this with a
			search by name or email.
		</p>

		{#if error}
			<div
				class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
			>
				{error}
			</div>
		{/if}

		{#if success}
			<div
				class="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
			>
				{success}
			</div>
		{/if}

		<form
			class="mt-8 space-y-5"
			onsubmit={(e) => {
				e.preventDefault();
				handleInvite();
			}}
		>
			<div>
				<label for="userId" class="text-sm font-bold text-slate-700 dark:text-slate-300">
					User ID
				</label>

				<input
					id="userId"
					bind:value={userIdToInvite}
					placeholder="Paste user ID here"
					class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
				/>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full rounded-2xl bg-blue-600 px-5 py-4 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-blue-950/40"
			>
				{loading ? 'Sending...' : 'Send invite'}
			</button>
		</form>
	</div>
</div>