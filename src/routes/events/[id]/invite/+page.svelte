<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/firebase';
	import { inviteUserToEvent } from '$lib/services/invite.service';

	let eventId = $state('');
	let userIdToInvite = $state('');
	let loading = $state(false);
	let success = $state('');
	let error = $state('');

	onMount(async () => {
		if (!auth.currentUser) {
			await goto('/login');
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
			await goto('/login');
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

<main class="min-h-screen bg-slate-950 text-white">
	<section class="mx-auto max-w-2xl px-6 py-10">
		<a href={`/events/${eventId}`} class="text-sm text-emerald-400 hover:text-emerald-300">
			← Back to event
		</a>

		<div class="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-8">
			<p class="text-sm uppercase tracking-[0.3em] text-emerald-400">Rally</p>
			<h1 class="mt-2 text-3xl font-bold">Invite people</h1>

			<p class="mt-3 text-slate-400">
				For now, invite a user by their Firebase user ID. Later, we will replace this with a
				search by name or email.
			</p>

			{#if error}
				<div class="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
					{error}
				</div>
			{/if}

			{#if success}
				<div class="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-200">
					{success}
				</div>
			{/if}

			<form class="mt-8 space-y-5" onsubmit={(e) => { e.preventDefault(); handleInvite(); }}>
				<div>
					<label for="userId" class="text-sm font-medium text-slate-300">
						User ID
					</label>

					<input
						id="userId"
						bind:value={userIdToInvite}
						placeholder="Paste user ID here"
						class="mt-2 w-full rounded-xl border-slate-700 bg-slate-950 text-white"
					/>
				</div>

				<button
					type="submit"
					disabled={loading}
					class="w-full rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
				>
					{loading ? 'Sending...' : 'Send invite'}
				</button>
			</form>
		</div>
	</section>
</main>