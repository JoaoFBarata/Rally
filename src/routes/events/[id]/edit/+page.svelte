<!-- src/routes/events/[id]/edit/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { getEventById, updateSportEvent } from '$lib/services/event.service';
	import LocationPickerMap from '$lib/components/maps/LocationPickerMap.svelte';
	import TimeSelect from '$lib/components/TimeSelect.svelte';
	import { uploadEventGroupPhoto } from '$lib/services/storage.service';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { goBack } from '$lib/utils/navigation';
	import type { Sport, EventVisibility, SportLevel, SportEvent, EventJoinPolicy } from '$lib/schema';

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
	let startDate = $state('');
	let startTime = $state('');
	let durationMinutes = $state(90);
	let maxParticipants = $state(10);
	let visibility = $state<EventVisibility>('private');
	let priceTotal = $state<number | null>(null);
	let level = $state<SportLevel>('casual');
	let whatToBring = $state('');
	let joinPolicy = $state<EventJoinPolicy>('open');
	let groupPhotoURL = $state<string | null>(null);
	let groupPhotoPath = $state<string | null>(null);
	let groupPhotoUploading = $state(false);

	let saving = $state(false);
	let error = $state('');

	const cardClass =
		'min-w-0 rounded-[1.35rem] border border-slate-200 bg-white p-3.5 shadow-lg shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-[2rem] sm:p-8';
	const inputClass =
		'w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950 sm:px-4 sm:py-3 sm:text-base';
	const labelClass = 'text-xs font-bold text-slate-700 dark:text-slate-300 sm:text-sm';

	function timestampToDateInput(ts: unknown): string {
		try {
			const timestamp = ts as { toDate?: () => Date };
			if (timestamp?.toDate) {
				const d = timestamp.toDate();
				const pad = (n: number) => String(n).padStart(2, '0');
				return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
			}
		} catch {
			// fall through
		}
		return '';
	}

	function timestampToTimeInput(ts: unknown): string {
		try {
			const timestamp = ts as { toDate?: () => Date };
			if (timestamp?.toDate) {
				const d = timestamp.toDate();
				const pad = (n: number) => String(n).padStart(2, '0');
				const minutes = Math.round(d.getMinutes() / 15) * 15;
				const normalized = new Date(d);
				normalized.setMinutes(minutes === 60 ? 0 : minutes, 0, 0);
				if (minutes === 60) normalized.setHours(normalized.getHours() + 1);

				return `${pad(normalized.getHours())}:${pad(normalized.getMinutes())}`;
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
		startDate = timestampToDateInput(e.startAt);
		startTime = timestampToTimeInput(e.startAt);
		const parsedStartDate = timestampToDate(e.startAt);
		const endDate = timestampToDate(e.endAt);
		if (parsedStartDate && endDate && endDate > parsedStartDate) {
			durationMinutes = Math.round((endDate.getTime() - parsedStartDate.getTime()) / 60000);
		}
		maxParticipants = e.maxParticipants;
		visibility = e.visibility;
		priceTotal = e.priceTotal ?? null;
		level = e.level ?? 'casual';
		whatToBring = e.whatToBring ?? '';
		joinPolicy = e.joinPolicy ?? 'open';
		groupPhotoURL = e.groupPhotoURL ?? null;
		groupPhotoPath = e.groupPhotoPath ?? null;
	}

	async function handleGroupPhotoFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !event) return;

		const currentUser = auth.currentUser;
		if (!currentUser) return;

		groupPhotoUploading = true;
		error = '';

		try {
			const uploaded = await uploadEventGroupPhoto({
				eventId: event.id,
				userId: currentUser.uid,
				file
			});

			groupPhotoURL = uploaded.url;
			groupPhotoPath = uploaded.path;
		} catch (err) {
			console.error('Group photo upload error:', err);
			error = getFriendlyErrorMessage(err, 'Could not upload group photo.');
		} finally {
			groupPhotoUploading = false;
			input.value = '';
		}
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

		if (!title || !locationName || !startDate || !startTime || maxParticipants < 2) {
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

		const parsedStartAt = new Date(`${startDate}T${startTime}`);
		const duration = Number(durationMinutes);

		if (Number.isNaN(parsedStartAt.getTime())) {
			error = 'Choose a valid event date and start time.';
			return;
		}

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
					priceTotal,
					groupPhotoURL,
					groupPhotoPath,
					whatToBring: whatToBring.trim(),
					joinPolicy
				});

			await goto(resolve(`/events/${eventId}`));
		} catch (err) {
			console.error('Update event error:', err);
			error = getFriendlyErrorMessage(err, 'Could not update event.');
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
			loadError = getFriendlyErrorMessage(err, 'Could not load event.');
		} finally {
			loadingEvent = false;
		}
	});
</script>

<div class="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 sm:px-5 sm:py-8">
	<button
		type="button"
		onclick={() => goBack(resolve(`/events/${page.params.id}`))}
		class="-ml-2 grid h-10 w-10 place-items-center rounded-full text-slate-950 transition hover:bg-slate-100 dark:text-slate-50 dark:hover:bg-slate-800"
		aria-label="Back"
	>
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="3"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="h-6 w-6"
			aria-hidden="true"
		>
			<path d="m15 18-6-6 6-6" />
		</svg>
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
			<div class={cardClass}>
				<div class="mb-4 sm:mb-8">
					<p class="text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
						Rally event
					</p>
					<h2 class="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50 sm:text-3xl">Edit event</h2>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400 sm:text-base">
						Update the event details and keep players aligned.
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
					class="space-y-4 sm:space-y-5"
					onsubmit={(e) => {
						e.preventDefault();
						handleSave();
					}}
				>
					<div>
						<label for="title" class={labelClass}>
							Event title
						</label>
						<input
							id="title"
							bind:value={title}
							placeholder="Saturday football match"
							class={`mt-2 ${inputClass}`}
						/>
					</div>

					<div class="flex items-center gap-3 sm:gap-4">
						<div class="relative h-12 w-12 shrink-0 sm:h-16 sm:w-16">
							{#if groupPhotoURL}
								<img
									src={groupPhotoURL}
									alt={title || 'Event group'}
									class="h-12 w-12 rounded-full object-cover ring-4 ring-slate-100 dark:ring-slate-800 sm:h-16 sm:w-16"
								/>
							{:else}
								<div
									class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-xl font-black text-blue-600 ring-4 ring-slate-100 dark:bg-blue-950 dark:text-blue-300 dark:ring-slate-800 sm:h-16 sm:w-16 sm:text-2xl"
								>
									📷
								</div>
							{/if}

							<label
								title="Edit group photo"
								class="absolute -bottom-1 -right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white text-xs text-blue-600 shadow-lg ring-2 ring-slate-100 transition hover:bg-blue-50 dark:bg-white dark:text-blue-600 dark:ring-slate-800 sm:h-7 sm:w-7"
							>
								{#if groupPhotoUploading}
									…
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke-width="2.4" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18A2.25 2.25 0 0 0 4.5 20.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
										<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
									</svg>
								{/if}
								<input type="file" accept="image/*" class="hidden" onchange={handleGroupPhotoFileChange} />
							</label>
						</div>

						<div class="min-w-0">
							<p class="text-sm font-bold text-slate-700 dark:text-slate-300">Group photo</p>
							<p class="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Optional, shown on the event page and chat.</p>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-3 sm:gap-5">
						<div class="min-w-0">
							<label for="sport" class={labelClass}>
								Sport
							</label>
							<select
								id="sport"
								bind:value={sport}
								class={`mt-2 ${inputClass}`}
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
									class={`mt-3 ${inputClass}`}
								/>
							{/if}
						</div>

						<div class="min-w-0">
							<label for="level" class={labelClass}>
								Event level
							</label>
							<select
								id="level"
								bind:value={level}
								class={`mt-2 ${inputClass}`}
							>
								<option value="beginner">Beginner</option>
								<option value="casual">Casual</option>
								<option value="intermediate">Intermediate</option>
								<option value="advanced">Advanced</option>
							</select>
						</div>
					</div>

					<div>
						<label for="description" class={labelClass}>
							Description
						</label>
						<textarea
							id="description"
							bind:value={description}
							placeholder="Casual game, all levels welcome..."
							class={`mt-2 min-h-24 sm:min-h-28 ${inputClass}`}
						></textarea>
					</div>

					<div>
						<label for="whatToBring" class={labelClass}>
							What to bring
						</label>
						<textarea
							id="whatToBring"
							bind:value={whatToBring}
							placeholder="Football boots, water bottle, your own racket..."
							class={`mt-2 min-h-16 sm:min-h-20 ${inputClass}`}
						></textarea>
					</div>

					<div>
						<label for="location" class={labelClass}>
							Location name
						</label>
						<input
							id="location"
							bind:value={locationName}
							placeholder="City Sports Center"
							class={`mt-2 ${inputClass}`}
						/>
					</div>

					<div class="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
						<div class="min-w-0">
							<label for="startDate" class={labelClass}>
								Date
							</label>
							<input
								id="startDate"
								type="date"
								bind:value={startDate}
								class={`mt-2 min-w-0 ${inputClass}`}
							/>
						</div>

						<div class="min-w-0">
							<label for="startTime" class={labelClass}>
								Start
							</label>
							<TimeSelect id="startTime" bind:value={startTime} placeholder="Choose time" />
						</div>

						<div class="min-w-0">
							<label for="durationMinutes" class={labelClass}>
								Duration
							</label>
								<input
									id="durationMinutes"
									type="number"
								min="15"
								step="15"
								bind:value={durationMinutes}
								placeholder="90"
								class={`mt-2 min-w-0 ${inputClass}`}
							/>
						</div>

						<div class="min-w-0">
							<label
								for="maxParticipants"
								class={labelClass}
							>
								Max players
							</label>
							<input
								id="maxParticipants"
								type="number"
								min={event.participantIds.length || 2}
								bind:value={maxParticipants}
								class={`mt-2 ${inputClass}`}
							/>
								{#if event.participantIds.length > 0}
									<p class="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
										Minimum {event.participantIds.length} ({event.participantIds.length} already joined)
									</p>
								{/if}
						</div>
					</div>

					<div class="grid grid-cols-2 gap-3 sm:gap-5">
						<div>
							<label for="visibility" class={labelClass}>
								Visibility
							</label>
							<select
								id="visibility"
								bind:value={visibility}
								class={`mt-2 ${inputClass}`}
								>
									<option value="private">Private</option>
									<option value="friends">Friends</option>
									<option value="public">Public</option>
								</select>
						</div>

						<div>
							<label for="price" class={labelClass}>
								Total price (€)
							</label>
							<input
									id="price"
									type="number"
									min="0"
								step="0.01"
								bind:value={priceTotal}
								placeholder="Optional"
								class={`mt-2 ${inputClass}`}
							/>
						</div>
					</div>

					<div>
						<p class={labelClass}>Who can join</p>
						<div class="mt-2 grid grid-cols-2 gap-3">
							<button
								type="button"
								onclick={() => (joinPolicy = 'open')}
								class={`rounded-2xl border p-2.5 text-left transition sm:p-3 ${
									joinPolicy === 'open'
										? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
										: 'border-slate-200 bg-white hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-500'
								}`}
							>
								<p class="text-sm font-bold text-slate-950 dark:text-slate-50 sm:text-base">Open</p>
								<p class="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">Anyone can join instantly.</p>
							</button>

							<button
								type="button"
								onclick={() => (joinPolicy = 'approval')}
								class={`rounded-2xl border p-2.5 text-left transition sm:p-3 ${
									joinPolicy === 'approval'
										? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
										: 'border-slate-200 bg-white hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-500'
								}`}
							>
								<p class="text-sm font-bold text-slate-950 dark:text-slate-50 sm:text-base">Request</p>
								<p class="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">You approve each request.</p>
							</button>
						</div>
					</div>

					<div class="mt-4 sm:mt-8">
						<LocationPickerMap bind:lat bind:lng bind:address />
					</div>

					<button
						type="submit"
						disabled={saving || groupPhotoUploading}
						class="mt-3 w-full rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-blue-950/40 sm:py-4 sm:text-base"
					>
						{saving ? 'Saving...' : groupPhotoUploading ? 'Uploading photo...' : 'Save changes'}
					</button>
				</form>
			</div>
	{/if}
</div>
