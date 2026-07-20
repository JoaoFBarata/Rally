<!-- src/routes/events/[id]/edit/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { getEventById, updateSportEvent } from '$lib/services/event.service';
	import LocationPickerMap from '$lib/components/maps/LocationPickerMap.svelte';
	import RouteEditorMap from '$lib/components/maps/RouteEditorMap.svelte';
	import TimeSelect from '$lib/components/TimeSelect.svelte';
	import { uploadEventGroupPhoto } from '$lib/services/storage.service';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { goBack } from '$lib/utils/navigation';
	import ImageCropperModal from '$lib/components/ImageCropperModal.svelte';
	import { TEXT_LIMITS } from '$lib/constants/text-limits';
	import { i18n } from '$lib/services/i18n.svelte';
	import type { Sport, EventVisibility, SportLevel, SportEvent, EventJoinPolicy, EventCurrency } from '$lib/schema';

	let event = $state<SportEvent | null>(null);
	let loadError = $state('');
	let loadingEvent = $state(true);
	let showCropper = $state(false);
	let cropperImageSrc = $state('');
	let cropperInputRef = $state<HTMLInputElement | null>(null);

	let title = $state('');
	let description = $state('');
	let sport = $state<Sport>('football');
	let customSport = $state('');
	let locationName = $state('');
	let lat = $state<number | null>(null);
	let lng = $state<number | null>(null);
	let address = $state('');
	let route = $state<{ lat: number; lng: number }[]>([]);
	let startDate = $state('');
	let startTime = $state('');
	const todayStr = new Date().toLocaleDateString('en-CA');
	let durationMinutes = $state(90);
	let maxParticipants = $state(10);
	let visibility = $state<EventVisibility>('private');
	let priceMode = $state<'free' | 'per_person' | 'total_split'>('free');
	let priceValue = $state<number | null>(null);
	let currency = $state<EventCurrency>('EUR');
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
	const currencyOptions: { value: EventCurrency; label: string }[] = [
		{ value: 'EUR', label: 'EUR €' },
		{ value: 'USD', label: 'USD $' },
		{ value: 'GBP', label: 'GBP £' },
		{ value: 'BRL', label: 'BRL R$' }
	];

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
		currency = e.currency ?? 'EUR';
		if (e.priceTotal && e.priceTotal > 0) {
			priceMode = 'total_split';
			priceValue = e.priceTotal;
		} else if (e.pricePerPerson && e.pricePerPerson > 0) {
			priceMode = 'per_person';
			priceValue = e.pricePerPerson;
		} else {
			priceMode = 'free';
			priceValue = null;
		}
		level = e.level ?? 'casual';
		whatToBring = e.whatToBring ?? '';
		joinPolicy = e.joinPolicy ?? 'open';
		groupPhotoURL = e.groupPhotoURL ?? null;
		groupPhotoPath = e.groupPhotoPath ?? null;
		route = e.route ?? [];
	}

	async function handleGroupPhotoFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !event) return;

		cropperInputRef = input;

		const reader = new FileReader();
		reader.onload = () => {
			cropperImageSrc = reader.result as string;
			showCropper = true;
		};
		reader.readAsDataURL(file);
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

		// Only block a past start time for events that hadn't started yet when
		// this page loaded — editing other fields on an already-started/past
		// event shouldn't be blocked just because time has since moved on.
		const originalStartAt = event?.startAt?.toDate?.() ?? null;
		if ((!originalStartAt || originalStartAt > new Date()) && parsedStartAt <= new Date()) {
			error = 'The event must be scheduled in the future.';
			return;
		}

		if (!duration || duration < 10) {
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
					route: sport === 'running' || sport === 'cycling' || sport === 'hiking' ? route : [],
					startAt: parsedStartAt,
					endAt,
					maxParticipants,
					visibility,
					priceTotal: priceMode === 'total_split' ? (priceValue ?? null) : null,
					pricePerPerson: priceMode === 'per_person' ? (priceValue ?? null) : null,
					currency,
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
		class="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
	>
		<span class="leading-none">←</span>
		<span>{i18n.t('back')}</span>
	</button>

	{#if loadingEvent}
		<div
			class="rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
		>
			<p class="text-slate-500 dark:text-slate-400">{i18n.t('loading_event')}</p>
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
					<h2 class="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50 sm:text-3xl">{i18n.t('edit_event')}</h2>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400 sm:text-base">
						{i18n.t('edit_event_sub')}
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
							{i18n.t('event_title_label')}
						</label>
						<input
							id="title"
							bind:value={title}
							maxlength={TEXT_LIMITS.eventTitle}
							placeholder={i18n.t('event_title_placeholder')}
							class={`mt-2 ${inputClass}`}
						/>
					</div>

					<div class="flex items-center gap-3 sm:gap-4">
						<div class="relative h-12 w-12 shrink-0 sm:h-16 sm:w-16">
							{#if groupPhotoURL}
								<img
									src={groupPhotoURL}
								alt={title || i18n.t('event_group')}
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
								title={i18n.t('edit_group_photo')}
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
							<p class="text-sm font-bold text-slate-700 dark:text-slate-300">{i18n.t('group_photo')}</p>
							<p class="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">{i18n.t('optional_event_photo_sub')}</p>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-3 sm:gap-5">
						<div class="min-w-0">
							<label for="sport" class={labelClass}>
								{i18n.t('sport')}
							</label>
							<select
								id="sport"
								bind:value={sport}
								class={`mt-2 ${inputClass}`}
							>
								<option value="football">{i18n.t('sport_football')}</option>
								<option value="padel">{i18n.t('sport_padel')}</option>
								<option value="basketball">{i18n.t('sport_basketball')}</option>
								<option value="running">{i18n.t('sport_running')}</option>
								<option value="gym">{i18n.t('sport_gym')}</option>
								<option value="tennis">{i18n.t('sport_tennis')}</option>
								<option value="cycling">{i18n.t('sport_cycling')}</option>
								<option value="volleyball">{i18n.t('sport_volleyball')}</option>
								<option value="bowling">{i18n.t('sport_bowling')}</option>
								<option value="snooker">{i18n.t('sport_snooker')}</option>
								<option value="golf">{i18n.t('sport_golf')}</option>
								<option value="swimming">{i18n.t('sport_swimming')}</option>
								<option value="hiking">{i18n.t('sport_hiking')}</option>
								<option value="yoga">{i18n.t('sport_yoga')}</option>
								<option value="surf">{i18n.t('sport_surf')}</option>
								<option value="pingpong">{i18n.t('sport_pingpong')}</option>
								<option value="rugby">{i18n.t('sport_rugby')}</option>
								<option value="americanfootball">{i18n.t('sport_americanfootball')}</option>
								<option value="other">{i18n.t('sport_other')}</option>
							</select>

							{#if sport === 'other'}
								<input
									bind:value={customSport}
									maxlength={TEXT_LIMITS.customSport}
									placeholder={i18n.t('custom_sport_placeholder')}
									class={`mt-3 ${inputClass}`}
								/>
							{/if}
						</div>

						<div class="min-w-0">
							<label for="level" class={labelClass}>
								{i18n.t('event_level')}
							</label>
							<select
								id="level"
								bind:value={level}
								class={`mt-2 ${inputClass}`}
							>
								<option value="beginner">{i18n.t('beginner')}</option>
								<option value="casual">{i18n.t('casual')}</option>
								<option value="intermediate">{i18n.t('intermediate')}</option>
								<option value="advanced">{i18n.t('advanced')}</option>
							</select>
						</div>
					</div>

					<div>
						<label for="description" class={labelClass}>
							{i18n.t('description_label')}
						</label>
						<textarea
							id="description"
							bind:value={description}
							maxlength={TEXT_LIMITS.eventDescription}
							placeholder={i18n.t('description_placeholder')}
							class={`mt-2 min-h-24 sm:min-h-28 ${inputClass}`}
						></textarea>
					</div>

					<div>
						<label for="whatToBring" class={labelClass}>
							{i18n.t('what_to_bring_label')}
						</label>
						<textarea
							id="whatToBring"
							bind:value={whatToBring}
							maxlength={TEXT_LIMITS.whatToBring}
							placeholder={i18n.t('what_to_bring_placeholder')}
							class={`mt-2 min-h-16 sm:min-h-20 ${inputClass}`}
						></textarea>
					</div>

					<div>
						<label for="location" class={labelClass}>
							{i18n.t('location_name_label')}
						</label>
						<input
							id="location"
							bind:value={locationName}
							maxlength={TEXT_LIMITS.locationName}
							placeholder={i18n.t('location_name_placeholder')}
							class={`mt-2 ${inputClass}`}
						/>
					</div>

					<div class="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
						<div class="min-w-0">
							<label for="startDate" class={labelClass}>
								{i18n.t('date_label')}
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
								{i18n.t('start_time_label')}
							</label>
							<TimeSelect id="startTime" bind:value={startTime} placeholder={i18n.t('choose_time')} />
						</div>

						<div class="min-w-0">
							<label for="durationMinutes" class={labelClass}>
								{i18n.t('duration_label')}
							</label>
								<input
									id="durationMinutes"
									type="number"
								min="10"
								step="5"
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
								{i18n.t('max_players_label')}
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
										{i18n.t('minimum_joined_help', { count: event.participantIds.length })}
									</p>
								{/if}
						</div>
					</div>

					<div class="grid grid-cols-2 gap-3 sm:gap-5">
						<div>
							<label for="visibility" class={labelClass}>
								{i18n.t('visibility_label')}
							</label>
							<select
								id="visibility"
								bind:value={visibility}
								class={`mt-2 ${inputClass}`}
								>
									<option value="private">{i18n.t('visibility_private')}</option>
									<option value="friends">{i18n.t('visibility_friends')}</option>
									<option value="public">{i18n.t('visibility_public')}</option>
								</select>
						</div>

							<div>
								<span class={labelClass}>{i18n.t('pricing_label')}</span>
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
										{i18n.t('free')}
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
										{i18n.t('per_person_pricing')}
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
										{i18n.t('total_split_pricing')}
									</button>
								</div>
							</div>

							{#if priceMode !== 'free'}
								<div class="mt-4">
									<label for="price" class={labelClass}>
										{priceMode === 'per_person' ? i18n.t('price_per_person_label') : i18n.t('total_event_price_label')}
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
										<select bind:value={currency} aria-label={i18n.t('currency')} class={inputClass}>
											{#each currencyOptions as option}
												<option value={option.value}>{option.label}</option>
											{/each}
										</select>
									</div>
								</div>
							{/if}
					</div>

					<div>
						<p class={labelClass}>{i18n.t('who_can_join_label')}</p>
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
								<p class="text-sm font-bold text-slate-950 dark:text-slate-50 sm:text-base">{i18n.t('open_join_label')}</p>
								<p class="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">{i18n.t('open_join_sub')}</p>
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
								<p class="text-sm font-bold text-slate-950 dark:text-slate-50 sm:text-base">{i18n.t('request_join_label')}</p>
								<p class="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">{i18n.t('request_join_sub')}</p>
							</button>
						</div>
					</div>

					<div class="mt-4 sm:mt-8">
						<LocationPickerMap bind:lat bind:lng bind:address />
					</div>

					{#if (sport === 'running' || sport === 'cycling' || sport === 'hiking') && lat !== null && lng !== null}
						<div class="mt-4">
							<RouteEditorMap bind:points={route} center={{ lat, lng }} />
						</div>
					{/if}

					<button
						type="submit"
						disabled={saving || groupPhotoUploading}
						class="mt-3 w-full rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-blue-950/40 sm:py-4 sm:text-base"
					>
						{saving ? i18n.t('saving') : groupPhotoUploading ? i18n.t('uploading_photo_btn') : i18n.t('save_changes')}
					</button>
				</form>
			</div>
	{/if}

	{#if showCropper && event}
		<ImageCropperModal
			imageSrc={cropperImageSrc}
			shape="rect"
			aspectRatio={16 / 9}
			onConfirm={(croppedFile) => {
				showCropper = false;
				const currentUser = auth.currentUser;
				const activeEvent = event;
				if (!currentUser || !activeEvent) return;

				groupPhotoUploading = true;
				error = '';

				setTimeout(async () => {
					try {
						const uploaded = await uploadEventGroupPhoto({
							eventId: activeEvent.id,
							userId: currentUser.uid,
							file: croppedFile
						});

						groupPhotoURL = uploaded.url;
						groupPhotoPath = uploaded.path;
					} catch (err) {
						console.error('Group photo upload error:', err);
						error = getFriendlyErrorMessage(err, 'Could not upload group photo.');
					} finally {
						groupPhotoUploading = false;
						if (cropperInputRef) cropperInputRef.value = '';
					}
				}, 50);
			}}
			onCancel={() => {
				showCropper = false;
				if (cropperInputRef) cropperInputRef.value = '';
			}}
		/>
	{/if}
</div>
