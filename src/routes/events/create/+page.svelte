<!-- src/routes/events/create/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import LocationPickerMap from '$lib/components/maps/LocationPickerMap.svelte';
	import VoiceRecordButton from '$lib/components/VoiceRecordButton.svelte';
	import { createRecurringSportEvents, createSportEvent } from '$lib/services/event.service';
	import { getFriendsForUser } from '$lib/services/social.service';
	import { inviteUsersToEvent } from '$lib/services/invite.service';
	import { uploadEventGroupPhoto } from '$lib/services/storage.service';
	import type { VoiceExtractedFields } from '$lib/services/voice-event.service';
	import TimeSelect from '$lib/components/TimeSelect.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { goBack } from '$lib/utils/navigation';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import type {
		Sport,
		EventVisibility,
		SportLevel,
		UserProfile,
		EventJoinPolicy,
		RecurringFrequency
	} from '$lib/schema';

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
	let loading = $state(false);
	let error = $state('');
	let voiceLocationHint = $state('');
	let step = $state<'choice' | 'form'>('choice');

	let whatToBring = $state('');
	let joinPolicy = $state<EventJoinPolicy>('open');

	let groupPhotoURL = $state<string | null>(null);
	let groupPhotoPath = $state<string | null>(null);
	let groupPhotoUploading = $state(false);
	let groupPhotoUploadId = crypto.randomUUID();

	let isRecurring = $state(false);
	let recurringFrequency = $state<RecurringFrequency>('weekly');
	let recurringOccurrences = $state(4);

	let recurringEndDateLabel = $derived.by(() => {
		if (!isRecurring || !startDate) return '';

		const start = new Date(`${startDate}T00:00:00`);
		if (isNaN(start.getTime())) return '';

		const end = new Date(start.getTime());

		if (recurringFrequency === 'monthly') {
			end.setMonth(end.getMonth() + (recurringOccurrences - 1));
		} else {
			const offsetDays = recurringFrequency === 'weekly' ? 7 : 14;
			end.setDate(end.getDate() + offsetDays * (recurringOccurrences - 1));
		}

		return end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	});

	const todayStr = new Date().toLocaleDateString('en-CA');

	let showInviteModal = $state(false);
	let createdEventId = $state('');
	let createdEventTitle = $state('');
	let friends = $state<UserProfile[]>([]);
	let selectedFriendIds = $state<string[]>([]);
	let inviteSending = $state(false);
	let inviteError = $state('');

	async function handleCreateEvent() {
		error = '';

		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto(resolve('/login'));
			return;
		}

		if (
			!title ||
			!locationName ||
			!startDate ||
			!startTime ||
			maxParticipants < 2 ||
			!visibility ||
			!level
		) {
			error = 'Please fill in the required fields.';
			return;
		}
		const startAt = new Date(`${startDate}T${startTime}`);
		const duration = Number(durationMinutes);
		if (isNaN(startAt.getTime()) || startAt <= new Date()) {
			error = 'The event must be scheduled in the future.';
			return;
		}

		if (!duration || duration < 15) {
			error = 'Add a valid event duration.';
			return;
		}

		const endAt = new Date(startAt.getTime() + duration * 60_000);

		if (sport === 'other' && !customSport.trim()) {
			error = 'No sport added! Please specify to make it easier for others.';
			return;
		}

		if (lat === null || lng === null) {
			error = 'Please search an address or click on the map to select the event location.';
			return;
		}

		if (!address.trim()) {
			error = 'Please add an address for the event location.';
			return;
		}

		loading = true;

		try {
			const baseParams = {
				title,
				description,
				sport,
				level,
				creatorId: currentUser.uid,
				locationName,
				lat,
				lng,
				address,
				startAt,
				endAt,
				maxParticipants,
				visibility,
				priceTotal: priceTotal ?? undefined,
				groupPhotoURL,
				groupPhotoPath,
				whatToBring: whatToBring.trim() || undefined,
				joinPolicy
			};

			const createdEvent = isRecurring
				? (
						await createRecurringSportEvents({
							...baseParams,
							frequency: recurringFrequency,
							occurrences: recurringOccurrences
						})
					)[0]
				: await createSportEvent(baseParams);

			createdEventId = createdEvent.id;
			createdEventTitle = createdEvent.title;
			friends = await getFriendsForUser(currentUser.uid);
			showInviteModal = true;
		} catch (err) {
			console.error('Create event error:', err);
			error = getFriendlyErrorMessage(err, 'Could not create event.');
		} finally {
			loading = false;
		}
	}

	async function handleGroupPhotoFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const currentUser = auth.currentUser;
		if (!currentUser) return;

		groupPhotoUploading = true;
		error = '';

		try {
			const uploaded = await uploadEventGroupPhoto({
				eventId: groupPhotoUploadId,
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

	function handleVoiceExtracted(fields: VoiceExtractedFields) {
		if (fields.title) title = fields.title;
		if (fields.sport) sport = fields.sport;
		if (fields.customSport) customSport = fields.customSport;
		if (fields.level) level = fields.level;
		if (fields.description) description = fields.description;
		if (fields.location) {
			locationName = fields.location;
			voiceLocationHint = fields.location;
		}
		if (fields.date) startDate = fields.date;
		if (fields.time) startTime = fields.time;
		if (fields.durationMinutes) durationMinutes = fields.durationMinutes;
		if (fields.maxParticipants) maxParticipants = fields.maxParticipants;
		if (fields.priceTotal !== null && fields.priceTotal !== undefined) {
			priceTotal = fields.priceTotal;
		}

		step = 'form';
	}

	function toggleFriend(friendId: string) {
		if (selectedFriendIds.includes(friendId)) {
			selectedFriendIds = selectedFriendIds.filter((id) => id !== friendId);
		} else {
			selectedFriendIds = [...selectedFriendIds, friendId];
		}
	}

	async function handleSendInvites() {
		const currentUser = auth.currentUser;
		if (!currentUser || !createdEventId) return;

		inviteSending = true;
		inviteError = '';

		try {
			await inviteUsersToEvent({
				eventId: createdEventId,
				fromUserId: currentUser.uid,
				toUserIds: selectedFriendIds
			});

			await goto(resolve('/dashboard'));
		} catch (err) {
			inviteError = getFriendlyErrorMessage(err, 'Could not send invites.');
			inviteSending = false;
		}
	}
</script>

<div class="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:px-5 sm:py-8">
	<button
		type="button"
		onclick={() => goBack(resolve('/dashboard'))}
		class="inline-flex rounded-full bg-blue-100 px-5 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
	>
		← Back
	</button>

	<div
		class="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-4xl sm:p-8"
	>
		{#if step === 'choice'}
			<div class="mb-5 sm:mb-8">
				<h2 class="mt-2 text-3xl font-black text-slate-950 dark:text-slate-50">Create event</h2>

				<p class="mt-2 text-slate-500 dark:text-slate-400">How do you want to create it?</p>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div
					class="flex flex-col items-start rounded-2xl border-2 border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950/40"
				>
					<p class="text-sm font-bold text-blue-700 dark:text-blue-300">🎤 Use your voice</p>

					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Describe the event out loud — we'll fill in the form for you.
					</p>

					<div class="mt-4">
						<VoiceRecordButton onExtracted={handleVoiceExtracted} />
					</div>
				</div>

				<button
					type="button"
					onclick={() => (step = 'form')}
					class="flex flex-col items-start rounded-2xl border-2 border-slate-200 bg-slate-50 p-5 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
				>
					<p class="text-sm font-bold text-slate-700 dark:text-slate-300">✍️ Enter manually</p>

					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Fill in the details yourself.
					</p>
				</button>
			</div>
		{:else}
			<div class="mb-5 sm:mb-8">
				<h2 class="mt-2 text-3xl font-black text-slate-950 dark:text-slate-50">Create event</h2>

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

				<div class="flex items-center gap-4">
					<div class="relative h-16 w-16 shrink-0">
						{#if groupPhotoURL}
							<img
								src={groupPhotoURL}
								alt={title || 'Event group'}
								class="h-16 w-16 rounded-full object-cover ring-4 ring-slate-100 dark:ring-slate-800"
							/>
						{:else}
							<div
								class="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-2xl font-black text-blue-600 ring-4 ring-slate-100 dark:bg-blue-950 dark:text-blue-300 dark:ring-slate-800"
							>
								📷
							</div>
						{/if}

						<label
							title="Add group photo"
							class="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white text-xs text-blue-600 shadow-lg ring-2 ring-slate-100 transition hover:bg-blue-50 dark:bg-white dark:text-blue-600 dark:ring-slate-800"
						>
							{#if groupPhotoUploading}
								…
							{:else}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="2.4"
									stroke="currentColor"
									class="h-3.5 w-3.5"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18A2.25 2.25 0 0 0 4.5 20.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
									/>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
									/>
								</svg>
							{/if}
							<input
								type="file"
								accept="image/*"
								class="hidden"
								onchange={handleGroupPhotoFileChange}
							/>
						</label>
					</div>

					<div class="min-w-0">
						<p class="text-sm font-bold text-slate-700 dark:text-slate-300">Group photo</p>
						<p class="text-sm text-slate-500 dark:text-slate-400">Optional, shown on the event page.</p>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3 sm:gap-5">
					<div class="min-w-0">
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
					<div class="min-w-0">
						<label for="level" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Event level
						</label>

						<select
							id="level"
							bind:value={level}
							class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
						>
							<option value="beginner">Beginner</option>
							<option value="casual">Casual</option>
							<option value="intermediate">Intermediate</option>
							<option value="advanced">Advanced</option>
						</select>
					</div>
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
					<label for="whatToBring" class="text-sm font-bold text-slate-700 dark:text-slate-300">
						What to bring
					</label>

					<textarea
						id="whatToBring"
						bind:value={whatToBring}
						placeholder="Football boots, water bottle, your own racket..."
						class="mt-2 min-h-20 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
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

				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
					<div class="min-w-0">
						<label for="startDate" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Event date
						</label>

						<input
							id="startDate"
							type="date"
							bind:value={startDate}
							min={todayStr}
							class="mt-2 w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-950 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-slate-500 dark:focus:bg-slate-800 dark:focus:ring-slate-700 sm:px-4"
						/>
					</div>

					<div class="min-w-0">
						<label for="startTime" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Start time
						</label>

						<TimeSelect id="startTime" bind:value={startTime} placeholder="Choose time" />
					</div>

					<div class="min-w-0">
						<label
							for="durationMinutes"
							class="text-sm font-bold text-slate-700 dark:text-slate-300"
						>
							Duration (minutes)
						</label>

						<input
							id="durationMinutes"
							type="number"
							min="15"
							step="15"
							bind:value={durationMinutes}
							placeholder="90"
							class="mt-2 w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-950 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-slate-500 dark:focus:bg-slate-800 dark:focus:ring-slate-700 sm:px-4"
						/>
					</div>

					<div class="min-w-0">
						<label
							for="maxParticipants"
							class="text-sm font-bold text-slate-700 dark:text-slate-300"
						>
							Max players
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

				<div
					class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
				>
					<label class="flex cursor-pointer items-center justify-between gap-4">
						<div>
							<p class="text-sm font-bold text-slate-700 dark:text-slate-300">
								Repeat this event
							</p>
							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								Creates a series of separate events people join individually.
							</p>
						</div>

						<input
							type="checkbox"
							bind:checked={isRecurring}
							class="h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 accent-blue-600 dark:border-slate-600"
						/>
					</label>

					{#if isRecurring}
						<div class="mt-4 grid grid-cols-2 gap-3">
							<div class="min-w-0">
								<label
									for="recurringFrequency"
									class="text-sm font-bold text-slate-700 dark:text-slate-300"
								>
									Repeats
								</label>

								<select
									id="recurringFrequency"
									bind:value={recurringFrequency}
									class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:ring-blue-950"
								>
									<option value="weekly">Every week</option>
									<option value="biweekly">Every 2 weeks</option>
									<option value="monthly">Every month</option>
								</select>
							</div>

							<div class="min-w-0">
								<label
									for="recurringOccurrences"
									class="text-sm font-bold text-slate-700 dark:text-slate-300"
								>
									Number of events
								</label>

								<input
									id="recurringOccurrences"
									type="number"
									min="2"
									max="12"
									bind:value={recurringOccurrences}
									class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:ring-blue-950"
								/>
							</div>
						</div>

						{#if recurringEndDateLabel}
							<p class="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">
								Creates {recurringOccurrences} events, the last one on {recurringEndDateLabel}.
							</p>
						{/if}
					{/if}
				</div>

				<div class="grid grid-cols-2 gap-3 sm:gap-5">
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

				<div>
					<p class="text-sm font-bold text-slate-700 dark:text-slate-300">Who can join</p>

					<div class="mt-2 grid grid-cols-2 gap-3">
						<button
							type="button"
							onclick={() => (joinPolicy = 'open')}
							class={`rounded-2xl border p-3 text-left transition ${
								joinPolicy === 'open'
									? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
									: 'border-slate-200 bg-white hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-500'
							}`}
						>
							<p class="font-bold text-slate-950 dark:text-slate-50">Open</p>
							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								Anyone can join instantly.
							</p>
						</button>

						<button
							type="button"
							onclick={() => (joinPolicy = 'approval')}
							class={`rounded-2xl border p-3 text-left transition ${
								joinPolicy === 'approval'
									? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
									: 'border-slate-200 bg-white hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-500'
							}`}
						>
							<p class="font-bold text-slate-950 dark:text-slate-50">Request to join</p>
							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								You approve each request.
							</p>
						</button>
					</div>
				</div>

				<div class="mt-5 sm:mt-8">
					<LocationPickerMap bind:lat bind:lng bind:address autofillAddress={voiceLocationHint} />
				</div>
				<button
					type="submit"
					disabled={loading || groupPhotoUploading}
					class="mt-3 w-full rounded-2xl bg-blue-600 px-5 py-4 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-blue-950/40"
				>
					{loading ? 'Creating...' : groupPhotoUploading ? 'Uploading photo...' : 'Create event'}
				</button>
			</form>
		</div>
		{/if}
	</div>
</div>

{#if showInviteModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button
			type="button"
			aria-label="Skip inviting friends"
			class="absolute inset-0 bg-black/40 backdrop-blur-sm"
			onclick={() => goto(resolve('/dashboard'))}
		></button>

		<div
			class="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
		>
			<div class="flex items-start justify-between gap-4 p-6 pb-4">
				<div>
					<h2 class="text-2xl font-black text-slate-950 dark:text-slate-50">Invite friends?</h2>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						to <span class="font-bold text-slate-700 dark:text-slate-300">{createdEventTitle}</span>
					</p>
				</div>

				<button
					type="button"
					onclick={() => goto(resolve('/dashboard'))}
					class="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
					aria-label="Close"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>
			</div>

			{#if inviteError}
				<div
					class="mx-6 mb-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
				>
					{inviteError}
				</div>
			{/if}

			{#if friends.length === 0}
				<div class="px-6 pb-6 pt-2 text-center">
					<p class="text-3xl">👥</p>
					<p class="mt-3 text-sm text-slate-500 dark:text-slate-400">
						You have no friends to invite yet.
					</p>
					<button
						type="button"
						onclick={() => goto(resolve('/dashboard'))}
						class="mt-5 w-full rounded-2xl bg-blue-600 px-5 py-3 font-black text-white transition hover:bg-blue-700"
					>
						Do it later
					</button>
				</div>
			{:else}
				<div class="max-h-72 overflow-y-auto px-6">
					<div class="divide-y divide-slate-100 dark:divide-slate-800">
						{#each friends as friend (friend.id)}
							<button
								type="button"
								onclick={() => toggleFriend(friend.id)}
								class="flex w-full items-center gap-3 py-3 text-left"
							>
								<UserAvatar
									displayName={friend.displayName}
									email={friend.email}
									photoURL={friend.photoURL}
									size="md"
								/>

								<div class="min-w-0 flex-1">
									<p class="truncate font-black text-slate-950 dark:text-white">
										{friend.displayName}
									</p>
									<p class="truncate text-sm text-slate-500 dark:text-slate-400">
										@{friend.rallyTag}
									</p>
								</div>

								<div
									class={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-black transition ${
										selectedFriendIds.includes(friend.id)
											? 'border-blue-600 bg-blue-600 text-white'
											: 'border-slate-300 text-transparent dark:border-slate-700'
									}`}
								>
									✓
								</div>
							</button>
						{/each}
					</div>
				</div>

				<div class="flex gap-3 p-6 pt-4">
					<button
						type="button"
						onclick={() => goto(resolve('/dashboard'))}
						class="flex-1 rounded-2xl border border-slate-200 px-4 py-3 font-black text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
					>
						Skip
					</button>

					<button
						type="button"
						onclick={handleSendInvites}
						disabled={inviteSending || selectedFriendIds.length === 0}
						class="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{inviteSending
							? 'Sending...'
							: `Invite${selectedFriendIds.length > 0 ? ` (${selectedFriendIds.length})` : ''}`}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
