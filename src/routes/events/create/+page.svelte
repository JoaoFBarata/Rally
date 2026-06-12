<!-- src/routes/events/create/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth } from '$lib/firebase';
	import { createSportEvent } from '$lib/services/event.service';
	import type { Sport, EventVisibility } from '$lib/schema';

	let title = $state('');
	let description = $state('');
	let sport = $state<Sport>('football');
	let locationName = $state('');
	let address = $state('');
	let startAt = $state('');
	let maxParticipants = $state(10);
	let visibility = $state<EventVisibility>('private');
	let priceTotal = $state<number | null>(null);

	let loading = $state(false);
	let error = $state('');

	async function handleCreateEvent() {
		error = '';

		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto('/login');
			return;
		}

		if (!title || !locationName || !startAt || maxParticipants < 2) {
			error = 'Please fill in the required fields.';
			return;
		}

		loading = true;

		try {
			await createSportEvent({
				title,
				description,
				sport,
				creatorId: currentUser.uid,
				locationName,
				address,
				startAt: new Date(startAt),
				maxParticipants,
				visibility,
				priceTotal: priceTotal ?? undefined
			});

			await goto('/dashboard');
		} catch (err) {
            console.error('Create event error:', err);

            if (err instanceof Error) {
                error = err.message;
            } else {
                error = 'Could not create event.';
            }
        } finally {
            loading = false;
        }
	}
</script>

<main class="min-h-screen bg-slate-950 text-white">
	<section class="mx-auto max-w-3xl px-6 py-10">
		<a href="/dashboard" class="text-sm text-emerald-400 hover:text-emerald-300">
			← Back to dashboard
		</a>

		<div class="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-8">
			<p class="text-sm uppercase tracking-[0.3em] text-emerald-400">Rally</p>
			<h1 class="mt-2 text-3xl font-bold">Create event</h1>
			<p class="mt-2 text-slate-400">
				Create a sports activity and start inviting people.
			</p>

			{#if error}
				<div class="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
					{error}
				</div>
			{/if}

			<form class="mt-8 space-y-5" onsubmit={(e) => { e.preventDefault(); handleCreateEvent(); }}>
				<div>
					<label for="title" class="text-sm font-medium text-slate-300">Event title</label>
					<input
						id="title"
						bind:value={title}
						placeholder="Saturday football match"
						class="mt-2 w-full rounded-xl border-slate-700 bg-slate-950 text-white"
					/>
				</div>

				<div>
					<label for="sport" class="text-sm font-medium text-slate-300">Sport</label>
					<select
						id="sport"
						bind:value={sport}
						class="mt-2 w-full rounded-xl border-slate-700 bg-slate-950 text-white"
					>
						<option value="football">Football</option>
						<option value="padel">Padel</option>
						<option value="basketball">Basketball</option>
						<option value="running">Running</option>
						<option value="gym">Gym</option>
						<option value="tennis">Tennis</option>
						<option value="cycling">Cycling</option>
						<option value="volleyball">Volleyball</option>
						<option value="other">Other</option>
					</select>
				</div>

				<div>
					<label for="description" class="text-sm font-medium text-slate-300">Description</label>
					<textarea
						id="description"
						bind:value={description}
						placeholder="Casual game, all levels welcome..."
						class="mt-2 w-full rounded-xl border-slate-700 bg-slate-950 text-white"
					></textarea>
				</div>

				<div class="grid gap-5 md:grid-cols-2">
					<div>
						<label for="location" class="text-sm font-medium text-slate-300">Location name</label>
						<input
							id="location"
							bind:value={locationName}
							placeholder="City Sports Center"
							class="mt-2 w-full rounded-xl border-slate-700 bg-slate-950 text-white"
						/>
					</div>

					<div>
						<label for="address" class="text-sm font-medium text-slate-300">Address</label>
						<input
							id="address"
							bind:value={address}
							placeholder="Lisbon, Portugal"
							class="mt-2 w-full rounded-xl border-slate-700 bg-slate-950 text-white"
						/>
					</div>
				</div>

				<div class="grid gap-5 md:grid-cols-2">
					<div>
						<label for="startAt" class="text-sm font-medium text-slate-300">Date and time</label>
						<input
							id="startAt"
							type="datetime-local"
							bind:value={startAt}
							class="mt-2 w-full rounded-xl border-slate-700 bg-slate-950 text-white"
						/>
					</div>

					<div>
						<label for="maxParticipants" class="text-sm font-medium text-slate-300">
							Max participants
						</label>
						<input
							id="maxParticipants"
							type="number"
							min="2"
							bind:value={maxParticipants}
							class="mt-2 w-full rounded-xl border-slate-700 bg-slate-950 text-white"
						/>
					</div>
				</div>

				<div class="grid gap-5 md:grid-cols-2">
					<div>
						<label for="visibility" class="text-sm font-medium text-slate-300">Visibility</label>
						<select
							id="visibility"
							bind:value={visibility}
							class="mt-2 w-full rounded-xl border-slate-700 bg-slate-950 text-white"
						>
							<option value="private">Private</option>
							<option value="friends">Friends</option>
							<option value="public">Public</option>
						</select>
					</div>

					<div>
						<label for="price" class="text-sm font-medium text-slate-300">Total price (€)</label>
						<input
							id="price"
							type="number"
							min="0"
							step="0.01"
							bind:value={priceTotal}
							placeholder="Optional"
							class="mt-2 w-full rounded-xl border-slate-700 bg-slate-950 text-white"
						/>
					</div>
				</div>

				<button
					type="submit"
					disabled={loading}
					class="w-full rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
				>
					{loading ? 'Creating...' : 'Create event'}
				</button>
			</form>
		</div>
	</section>
</main>