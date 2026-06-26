<!-- src/routes/events/[id]/edit/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { getEventById, updateSportEvent } from '$lib/services/event.service';
	import LocationPickerMap from '$lib/components/maps/LocationPickerMap.svelte';
	import { goBack } from '$lib/utils/navigation';
	import type { Sport, EventVisibility, SportLevel, SportEvent } from '$lib/schema';

	let event = $state<SportEvent | null>(null);
	let loadError = $state('');
	let loadingEvent = $state(true);

	let title = $state('');
	let description = $state('');
	let sport = $state<Sport>('football');
	let customSport = $state('');
	let locationName = $state('');
	let lat = $state<number | null>(null);
	let lng = $state<number | null>(null);
	let address = $state('');
	let startAt = $state('');
	let durationMinutes = $state(90);
	let maxParticipants = $state(10);
	let visibility = $state<EventVisibility>('private');
	let priceTotal = $state<number | null>(null);
	let level = $state<SportLevel>('casual');

	let saving = $state(false);
	let error = $state('');

	function timestampToDatetimeLocal(ts: unknown): string {
		try {
			const timestamp = ts as { toDate?: () => Date };
			if (timestamp?.toDate) {
				const d = timestamp.toDate();
				const pad = (n: number) => String(n).padStart(2, '0');
				return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
			}
		} catch {
			// fall through
		}
		return '';
	}

	function timestampToDate(ts: unknown): Date | null {
		try {
			const timestamp = ts as { toDate?: () => Date };
			const date = timestamp?.toDate?.();
			return date && !Number.isNaN(date.getTime()) ? date : null;
		} catch {
			return null;
		}
	}

	function populateForm(e: SportEvent) {
		title = e.title;
		description = e.description ?? '';
		sport = e.sport;
		customSport = e.customSport ?? '';
		locationName = e.location.name;
		lat = e.location.lat ?? null;
		lng = e.location.lng ?? null;
		address = e.location.address ?? '';
		startAt = timestampToDatetimeLocal(e.startAt);
		const startDate = timestampToDate(e.startAt);
		const endDate = timestampToDate(e.endAt);
		if (startDate && endDate && endDate > startDate) {
			durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
		}
		maxParticipants = e.maxParticipants;
		visibility = e.visibility;
		priceTotal = e.priceTotal ?? null;
		level = e.level ?? 'casual';
	}

	async function handleSave() {
		error = '';
		const eventId = page.params.id;

		const currentUser = auth.currentUser;
		if (!currentUser) {
			await goto(resolve('/login'));
			return;
		}
		if (!eventId) {
			error = 'Event not found.';
			return;
		}

		if (!title || !locationName || !startAt || maxParticipants < 2) {
			error = 'Please fill in all required fields.';
			return;
		}

		if (sport === 'other' && !customSport.trim()) {
			error = 'Please specify the sport name.';
			return;
		}

		if (lat === null || lng === null) {
			error = 'Please select a location on the map.';
			return;
		}

		if (!address.trim()) {
			error = 'Please add an address for the location.';
			return;
		}

		const parsedStartAt = new Date(startAt);
		const duration = Number(durationMinutes);

		if (!duration || duration < 15) {
			error = 'Add a valid event duration.';
			return;
		}

		const endAt = new Date(parsedStartAt.getTime() + duration * 60_000);

		saving = true;

		try {
			await updateSportEvent({
				eventId,
				userId: currentUser.uid,
				title,
				description,
				sport,
				customSport,
				level,
				locationName,
				address,
				lat,
				lng,
				startAt: parsedStartAt,
				endAt,
				maxParticipants,
				visibility,
				priceTotal
			});

			await goto(resolve(`/events/${eventId}`));
		} catch (err) {
			console.error('Update event error:', err);
			error = err instanceof Error ? err.message : 'Could not update event.';
		} finally {
			saving = false;
		}
	}

	onMount(async () => {
		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto(resolve('/login'));
			return;
		}

		const eventId = page.params.id;
		if (!eventId) {
			loadError = 'Event not found.';
			loadingEvent = false;
			return;
		}

		try {
			const loaded = await getEventById(eventId);

			if (!loaded) {
				loadError = 'Event not found.';
				return;
			}

			if (loaded.creatorId !== currentUser.uid) {
				await goto(resolve(`/events/${eventId}`));
				return;
			}

			event = loaded;
			populateForm(loaded);
		} catch (err) {
			console.error('Load event error:', err);
			loadError = err instanceof Error ? err.message : 'Could not load event.';
		} finally {
			loadingEvent = false;
		}
	});
</script>

<div class="mx-auto max-w-3xl space-y-4">
	<button
		type="button"
		onclick={() => goBack(resolve(`/events/${page.params.id}`))}
		class="inline-flex rounded-full bg-blue-100 px-5 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
	>
		← Back to event
	</button>

	{#if loadingEvent}
		<div
			class="rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
		>
			<p class="text-slate-500 dark:text-slate-400">Loading event...</p>
		</div>
	{:else if loadError}
		<div
			class="rounded-4xl border border-red-200 bg-red-50 p-8 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
		>
			{loadError}
		</div>
	{:else if event}
		<div
			class="rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
		>
			<div class="mb-8">
				<p class="text-sm font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
					Rally
				</p>
				<h2 class="mt-2 text-3xl font-black text-slate-950 dark:text-slate-50">Edit event</h2>
				<p class="mt-2 text-slate-500 dark:text-slate-400">
					Update the details for <span class="font-bold text-slate-700 dark:text-slate-200"
						>{event.title}</span
					>.
				</p>
			</div>

			{#if error}
				<div
					class="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
				>
					{error}
				</div>
			{/if}

			<form
				class="space-y-5"
				onsubmit={(e) => {
					e.preventDefault();
					handleSave();
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

					{#if sport === 'other'}
						<input
							bind:value={customSport}
							placeholder="e.g. Climbing, Hockey, Surfing..."
							class="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
						/>
					{/if}
				</div>

				<div>
					<label for="level" class="text-sm font-bold text-slate-700 dark:text-slate-300">
						Event level
					</label>
					<select
						id="level"
						bind:value={level}
						class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
					>
						<option value="beginner">Beginner</option>
						<option value="casual">Casual</option>
						<option value="intermediate">Intermediate</option>
						<option value="advanced">Advanced</option>
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

				<div class="grid gap-5 md:grid-cols-3">
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
						<label for="durationMinutes" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Duration
						</label>
						<input
							id="durationMinutes"
							type="number"
							min="15"
							step="15"
							bind:value={durationMinutes}
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
							min={event.participantIds.length || 2}
							bind:value={maxParticipants}
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
						/>
						{#if event.participantIds.length > 0}
							<p class="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
								Minimum {event.participantIds.length} ({event.participantIds.length} already joined)
							</p>
						{/if}
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
					disabled={saving}
					class="mt-3 w-full rounded-2xl bg-blue-600 px-5 py-4 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-blue-950/40"
				>
					{saving ? 'Saving...' : 'Save changes'}
				</button>
			</form>
		</div>
	{/if}
</div>
