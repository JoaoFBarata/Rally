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
	import { TEXT_LIMITS } from '$lib/constants/text-limits';
	import type {
		Sport,
		EventVisibility,
		SportLevel,
		UserProfile,
		EventJoinPolicy,
		RecurringFrequency,
		EventCurrency
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
	let priceMode = $state<'free' | 'per_person' | 'total_split'>('free');
	let priceValue = $state<number | null>(null);
	let currency = $state<EventCurrency>('EUR');
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
	const cardClass =
		'min-w-0 rounded-[1.35rem] border border-slate-200 bg-white p-3.5 shadow-lg shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-[2rem] sm:p-8';
	const inputClass =
		'w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950 sm:px-4 sm:py-3 sm:text-base';
	const labelClass = 'text-xs font-bold text-slate-700 dark:text-slate-300 sm:text-sm';
	const currencyOptions: { value: EventCurrency; label: string }[] = [
		{ value: 'EUR', label: 'EUR €' },
		{ value: 'USD', label: 'USD $' },
		{ value: 'GBP', label: 'GBP £' },
		{ value: 'BRL', label: 'BRL R$' }
	];

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
				priceTotal: priceMode === 'total_split' ? (priceValue ?? undefined) : undefined,
				pricePerPerson: priceMode === 'per_person' ? (priceValue ?? undefined) : undefined,
				currency,
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
			priceMode = 'total_split';
			priceValue = fields.priceTotal;
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

<div class="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 sm:px-5 sm:py-8">
	<button
		type="button"
		onclick={() => goBack(resolve('/dashboard'))}
		class="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
	>
		<span class="leading-none">←</span>
		<span>Back</span>
	</button>

	<div class={cardClass}>
		{#if step === 'choice'}
			<div class="mb-4 sm:mb-8">
				<h2 class="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50 sm:text-3xl">Create event</h2>

				<p class="mt-2 text-slate-500 dark:text-slate-400">How do you want to create it?</p>
			</div>

			<div class="grid gap-3 sm:grid-cols-2 sm:gap-4">
				<div
					class="flex flex-col items-start rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40 sm:p-5"
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
					class="flex flex-col items-start rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 sm:p-5"
				>
					<p class="text-sm font-bold text-slate-700 dark:text-slate-300">✍️ Enter manually</p>

					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Fill in the details yourself.
					</p>
				</button>
			</div>
		{:else}
			<div class="mb-4 sm:mb-8">
				<h2 class="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50 sm:text-3xl">Create event</h2>

				<p class="mt-1 text-sm text-slate-500 dark:text-slate-400 sm:text-base">
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
				class="space-y-4 sm:space-y-5"
				onsubmit={(e) => {
					e.preventDefault();
					handleCreateEvent();
				}}
			>
				<div>
					<label for="title" class={labelClass}>
						Event title
					</label>

					<input
						id="title"
						bind:value={title}
						maxlength={TEXT_LIMITS.eventTitle}
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
							title="Add group photo"
							class="absolute -bottom-1 -right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white text-xs text-blue-600 shadow-lg ring-2 ring-slate-100 transition hover:bg-blue-50 dark:bg-white dark:text-blue-600 dark:ring-slate-800 sm:h-7 sm:w-7"
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
						<p class="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Optional, shown on the event page.</p>
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
								maxlength={TEXT_LIMITS.customSport}
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
						maxlength={TEXT_LIMITS.eventDescription}
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
						maxlength={TEXT_LIMITS.whatToBring}
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
						maxlength={TEXT_LIMITS.locationName}
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
							min={todayStr}
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
						<label
							for="durationMinutes"
								class={labelClass}
							>
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
							min="2"
							bind:value={maxParticipants}
							class={`mt-2 ${inputClass}`}
						/>
					</div>
				</div>

				<div
					class="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4"
				>
					<label class="flex cursor-pointer items-center justify-between gap-4">
						<div>
							<p class="text-sm font-bold text-slate-700 dark:text-slate-300">
								Repeat this event
							</p>
							<p class="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">
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
									class={labelClass}
								>
									Repeats
								</label>

								<select
									id="recurringFrequency"
									bind:value={recurringFrequency}
									class={`mt-2 bg-white dark:bg-slate-900 ${inputClass}`}
								>
									<option value="weekly">Every week</option>
									<option value="biweekly">Every 2 weeks</option>
									<option value="monthly">Every month</option>
								</select>
							</div>

							<div class="min-w-0">
								<label
									for="recurringOccurrences"
									class={labelClass}
								>
									Number of events
								</label>

								<input
									id="recurringOccurrences"
									type="number"
									min="2"
									max="12"
									bind:value={recurringOccurrences}
									class={`mt-2 bg-white dark:bg-slate-900 ${inputClass}`}
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
						<span class={labelClass}>Pricing</span>
						<div class="mt-2 grid grid-cols-3 gap-2">
							<button
								type="button"
								onclick={() => { priceMode = 'free'; priceValue = null; }}
								class={`rounded-2xl border py-2.5 text-center text-sm font-bold transition ${
									priceMode === 'free'
										? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
										: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
								}`}
							>
								Free
							</button>
							<button
								type="button"
								onclick={() => { priceMode = 'per_person'; }}
								class={`rounded-2xl border py-2.5 text-center text-sm font-bold transition ${
									priceMode === 'per_person'
										? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
										: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
								}`}
							>
								Per person
							</button>
							<button
								type="button"
								onclick={() => { priceMode = 'total_split'; }}
								class={`rounded-2xl border py-2.5 text-center text-sm font-bold transition ${
									priceMode === 'total_split'
										? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
										: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
								}`}
							>
								Total (Split)
							</button>
						</div>
					</div>

					{#if priceMode !== 'free'}
						<div class="sm:col-span-2">
							<label for="price" class={labelClass}>
								{priceMode === 'per_person' ? 'Price per person' : 'Total event price'}
							</label>

							<div class="mt-2 grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
								<input
									id="price"
									type="number"
									min="0"
									step="0.01"
									bind:value={priceValue}
									placeholder="0.00"
									required
									class={inputClass}
								/>
								<select bind:value={currency} aria-label="Currency" class={inputClass}>
									{#each currencyOptions as option}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
							</div>
						</div>
					{/if}
				</div>

				<div>
					<p class="text-sm font-bold text-slate-700 dark:text-slate-300">Who can join</p>

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
							<p class="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">
								Anyone can join instantly.
							</p>
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
							<p class="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">
								You approve each request.
							</p>
						</button>
					</div>
				</div>

				<div class="mt-4 sm:mt-8">
					<LocationPickerMap bind:lat bind:lng bind:address autofillAddress={voiceLocationHint} />
				</div>
				<button
					type="submit"
					disabled={loading || groupPhotoUploading}
					class="mt-3 w-full rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-blue-950/40 sm:py-4 sm:text-base"
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
