<!-- src/routes/events/create/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import LocationPickerMap from '$lib/components/maps/LocationPickerMap.svelte';
	import { createSportEvent } from '$lib/services/event.service';
	import type { Sport, EventVisibility } from '$lib/schema';

	let title = $state('');
	let description = $state('');
	let sport = $state<Sport>('football');
	let locationName = $state('');
	let lat = $state<number | null>(null);
	let lng = $state<number | null>(null);
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
			await goto(resolve('/login'));
			return;
		}

		if (!title || !locationName || !startAt || maxParticipants < 2) {
			error = 'Please fill in the required fields.';
			return;
		}

		if (lat === null || lng === null) {
			error = 'Please click on the map to select the event location.';
			return;
		}

		if (!address) {
			error = 'Please wait for the address to be filled after clicking on the map.';
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
				lat,
				lng,
				address,
				startAt: new Date(startAt),
				maxParticipants,
				visibility,
				priceTotal: priceTotal ?? undefined
			});

			await goto(resolve('/dashboard'));
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

<div class="mx-auto max-w-3xl space-y-4">
	<a
		href={resolve('/dashboard')}
		class="inline-flex rounded-full bg-blue-100 px-5 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
	>
		← Back to dashboard
	</a>

	<div
		class="rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
	>
		<div class="mb-8">
			<p class="text-sm font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
				Rally
			</p>

			<h2 class="mt-2 text-3xl font-black text-slate-950 dark:text-slate-50">
				Create event
			</h2>

			<p class="mt-2 text-slate-500 dark:text-slate-400">
				Fill in the event details and start inviting people.
			</p>
		</div>

		{#if error}
			<div
				class="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
			>
				{error}
			</div>
		{/if}

		<div>
			<form
				class="space-y-5"
				onsubmit={(e) => {
					e.preventDefault();
					handleCreateEvent();
				}}
			>
				<div>
					<label for="title" class="text-sm font-bold text-slate-700 dark:text-slate-300">
						Event title
					</label>

					<input
						id="title"
						bind:value={title}
						placeholder="Saturday football match"
						class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
					/>
				</div>

				<div>
					<label for="sport" class="text-sm font-bold text-slate-700 dark:text-slate-300">
						Sport
					</label>

					<select
						id="sport"
						bind:value={sport}
						class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
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
					<label for="description" class="text-sm font-bold text-slate-700 dark:text-slate-300">
						Description
					</label>

					<textarea
						id="description"
						bind:value={description}
						placeholder="Casual game, all levels welcome..."
						class="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
					></textarea>
				</div>

				<div class="grid gap-5 md:grid-cols-2">
					<div>
						<label for="location" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Location name
						</label>

						<input
							id="location"
							bind:value={locationName}
							placeholder="City Sports Center"
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
						/>
					</div>

					<div>
						<label for="address" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Address
						</label>

						<input
							id="address"
							bind:value={address}
							readonly
							placeholder="Click on the map to fill the address"
							class="mt-2 w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-600 outline-none transition placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:placeholder:text-slate-500"
						/>
					</div>
				</div>

				<div class="grid gap-5 md:grid-cols-2">
					<div>
						<label for="startAt" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Date and time
						</label>

						<input
							id="startAt"
							type="datetime-local"
							bind:value={startAt}
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
						/>
					</div>

					<div>
						<label
							for="maxParticipants"
							class="text-sm font-bold text-slate-700 dark:text-slate-300"
						>
							Max participants
						</label>

						<input
							id="maxParticipants"
							type="number"
							min="2"
							bind:value={maxParticipants}
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
						/>
					</div>
				</div>

				<div class="grid gap-5 md:grid-cols-2">
					<div>
						<label for="visibility" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Visibility
						</label>

						<select
							id="visibility"
							bind:value={visibility}
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
						>
							<option value="private">Private</option>
							<option value="friends">Friends</option>
							<option value="public">Public</option>
						</select>
					</div>

					<div>
						<label for="price" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Total price (€)
						</label>

						<input
							id="price"
							type="number"
							min="0"
							step="0.01"
							bind:value={priceTotal}
							placeholder="Optional"
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
						/>
					</div>
				</div>
				<div class="mt-8">
					<LocationPickerMap bind:lat bind:lng bind:address />
				</div>
				<button
					type="submit"
					disabled={loading}
					class="mt-3 w-full rounded-2xl bg-blue-600 px-5 py-4 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-blue-950/40"
				>
					{loading ? 'Creating...' : 'Create event'}
				</button>
			</form>
		</div>

	</div>
</div>