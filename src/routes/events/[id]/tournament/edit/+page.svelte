<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { getEventById, updateTournamentEvent } from '$lib/services/event.service';
	import LocationPickerMap from '$lib/components/maps/LocationPickerMap.svelte';
	import TimeSelect from '$lib/components/TimeSelect.svelte';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { goBack } from '$lib/utils/navigation';
	import { TEXT_LIMITS } from '$lib/constants/text-limits';
	import { i18n } from '$lib/services/i18n.svelte';
	import type {
		EntryFeeType,
		EventCurrency,
		PrizeType,
		Sport,
		SportEvent,
		SportLevel,
		TournamentFormat,
		TournamentRegistrationType
	} from '$lib/schema';

	let event = $state<SportEvent | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');

	let title = $state('');
	let description = $state('');
	let sport = $state<Sport>('football');
	let level = $state<SportLevel>('casual');
	let address = $state('');
	let lat = $state<number | null>(null);
	let lng = $state<number | null>(null);
	let date = $state('');
	let startTime = $state('');
	let endTime = $state('');
	let format = $state<TournamentFormat>('groups_playoff');
	let registrationType = $state<TournamentRegistrationType>('team');
	let maxEntries = $state(8);
	let groupCount = $state(2);
	let playoffSpots = $state(4);
	let teamSize = $state(5);
	let minTeamSize = $state(5);
	let maxTeamSize = $state(8);
	let allowOpenTeams = $state(true);
	let registrationDeadlineDate = $state('');
	let registrationDeadlineTime = $state('');
	let entryFeeType = $state<EntryFeeType>('free');
	let entryFeeAmount = $state<number | null>(null);
	let currency = $state<EventCurrency>('EUR');
	let prizeType = $state<PrizeType>('none');
	let prizeDescription = $state('');
	let prizeValue = $state<number | null>(null);
	let rules = $state('');

	const sports: Sport[] = ['football', 'padel', 'basketball', 'running', 'gym', 'tennis', 'cycling', 'volleyball', 'other'];
	const levels: SportLevel[] = ['beginner', 'casual', 'intermediate', 'advanced'];
	const currencyOptions: { value: EventCurrency; label: string }[] = [
		{ value: 'EUR', label: 'EUR €' },
		{ value: 'USD', label: 'USD $' },
		{ value: 'GBP', label: 'GBP £' },
		{ value: 'BRL', label: 'BRL R$' }
	];
	const inputClass = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-blue-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950';
	const labelClass = 'text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400';
	const cardClass = 'rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6';

	function pad(value: number) {
		return String(value).padStart(2, '0');
	}

	function toDate(value: unknown): Date | null {
		const timestamp = value as { toDate?: () => Date };
		if (timestamp?.toDate) return timestamp.toDate();
		if (value instanceof Date) return value;
		return null;
	}

	function setDateTime(value: unknown, setDate: (value: string) => void, setTime: (value: string) => void) {
		const parsed = toDate(value);
		if (!parsed) return;
		setDate(`${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`);
		setTime(`${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`);
	}

	function populateForm(nextEvent: SportEvent) {
		event = nextEvent;
		title = nextEvent.title ?? '';
		description = nextEvent.description ?? '';
		sport = nextEvent.sport ?? 'football';
		level = nextEvent.level ?? 'casual';
		address = nextEvent.location?.address ?? '';
		lat = nextEvent.location?.lat ?? null;
		lng = nextEvent.location?.lng ?? null;
		format = nextEvent.tournamentFormat ?? 'groups_playoff';
		registrationType = nextEvent.tournamentRegistrationType ?? 'team';
		maxEntries = nextEvent.maxTournamentEntries ?? nextEvent.maxParticipants ?? 8;
		groupCount = nextEvent.groupCount ?? 2;
		playoffSpots = nextEvent.playoffSpots ?? 4;
		teamSize = nextEvent.teamSize ?? 5;
		minTeamSize = nextEvent.minTeamSize ?? nextEvent.teamSize ?? 5;
		maxTeamSize = nextEvent.maxTeamSize ?? nextEvent.teamSize ?? 8;
		allowOpenTeams = nextEvent.allowOpenTeams ?? true;
		entryFeeType = nextEvent.entryFeeType ?? 'free';
		entryFeeAmount = nextEvent.entryFeeAmount ?? null;
		currency = nextEvent.currency ?? 'EUR';
		prizeType = nextEvent.prizeType ?? 'none';
		prizeDescription = nextEvent.prizeDescription ?? '';
		prizeValue = nextEvent.prizeValue ?? null;
		rules = nextEvent.tournamentRules ?? '';
		setDateTime(nextEvent.startAt, (value) => (date = value), (value) => (startTime = value));
		setDateTime(nextEvent.endAt, () => undefined, (value) => (endTime = value));
		setDateTime(nextEvent.registrationDeadline, (value) => (registrationDeadlineDate = value), (value) => (registrationDeadlineTime = value));
	}

	function buildDateTime(dateValue: string, timeValue: string) {
		if (!dateValue || !timeValue) return null;
		const value = new Date(`${dateValue}T${timeValue}`);
		return Number.isNaN(value.getTime()) ? null : value;
	}

	async function handleSave() {
		const currentUser = auth.currentUser;
		if (!currentUser || !event) return;

		const startAt = buildDateTime(date, startTime);
		if (!startAt) {
			error = i18n.t('choose_tournament_datetime_error');
			return;
		}

		if (!title.trim()) {
			error = i18n.t('add_tournament_name_error');
			return;
		}

		if (!address.trim() || lat === null || lng === null) {
			error = i18n.t('choose_tournament_location_error');
			return;
		}

		saving = true;
		error = '';

		try {
			await updateTournamentEvent({
				eventId: event.id,
				userId: currentUser.uid,
				title: title.trim(),
				description: description.trim(),
				sport,
				level,
				locationName: address.includes(',') ? address.split(',')[0].trim() : address.trim(),
				address: address.trim(),
				lat,
				lng,
				startAt,
				endAt: buildDateTime(date, endTime),
				format,
				registrationType,
				maxEntries: Number(maxEntries),
				groupCount: Number(groupCount),
				playoffSpots: Number(playoffSpots),
				teamSize: registrationType === 'team' ? Number(teamSize) : null,
				minTeamSize: registrationType === 'team' ? Number(minTeamSize) : null,
				maxTeamSize: registrationType === 'team' ? Number(maxTeamSize) : null,
				allowOpenTeams,
				registrationDeadline: buildDateTime(registrationDeadlineDate, registrationDeadlineTime),
				entryFeeType,
				entryFeeAmount: entryFeeType === 'free' ? null : Number(entryFeeAmount ?? 0),
				currency,
				prizeType,
				prizeDescription: prizeDescription.trim(),
				prizeValue: prizeType === 'none' ? null : Number(prizeValue ?? 0),
				rules: rules.trim()
			});
			await goto(resolve(`/events/${event.id}`));
		} catch (err) {
			console.error('Update tournament error:', err);
			error = getFriendlyErrorMessage(err, i18n.t('could_not_update_tournament'));
		} finally {
			saving = false;
		}
	}

	onMount(async () => {
		try {
			const eventId = page.params.id;
			if (!eventId) {
				error = i18n.t('event_not_found');
				return;
			}

			const loaded = await getEventById(eventId);
			if (!loaded) {
				error = i18n.t('event_not_found');
				return;
			}
			if (loaded.eventKind !== 'tournament') {
				await goto(resolve(`/events/${loaded.id}/edit`));
				return;
			}
			populateForm(loaded);
		} catch (err) {
			console.error('Load tournament edit page error:', err);
			error = getFriendlyErrorMessage(err, i18n.t('could_not_load_event'));
		} finally {
			loading = false;
		}
	});
</script>

<main class="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:px-6">
	<div class="mx-auto max-w-6xl">
		<button
			type="button"
			onclick={() => goBack(resolve(`/events/${page.params.id}`))}
			class="mb-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300"
		>
			<span>←</span>
			<span>{i18n.t('back')}</span>
		</button>

		{#if loading}
			<p class="text-slate-500">{i18n.t('loading_event')}</p>
		{:else if !event}
			<p class="rounded-2xl bg-white p-5 text-red-600 dark:bg-slate-900">{error || i18n.t('event_not_found')}</p>
		{:else}
			<header class="mb-6">
				<p class="text-sm font-black uppercase tracking-[0.25em] text-blue-600">{i18n.t('competitive_event')}</p>
				<h1 class="mt-1 text-3xl font-black">{i18n.t('edit_tournament')}</h1>
			</header>

			{#if error}
				<div class="mb-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>
			{/if}

			<form class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]" onsubmit={(e) => { e.preventDefault(); void handleSave(); }}>
				<div class="space-y-5">
					<section class={cardClass}>
						<h2 class="text-xl font-black">{i18n.t('tournament_details')}</h2>
						<div class="mt-4 space-y-3">
							<input bind:value={title} maxlength={TEXT_LIMITS.eventTitle} placeholder={i18n.t('tournament_name_placeholder')} class={inputClass} />
							<textarea bind:value={description} maxlength={TEXT_LIMITS.eventDescription} rows="3" placeholder={i18n.t('tournament_description_placeholder')} class={inputClass}></textarea>
							<div class="grid gap-3 sm:grid-cols-3">
								<label>
									<span class={labelClass}>{i18n.t('sport')}</span>
									<select bind:value={sport} class={`mt-2 ${inputClass}`}>
										{#each sports as option}
											<option value={option}>{i18n.t(`sport_${option}`)}</option>
										{/each}
									</select>
								</label>
								<label>
									<span class={labelClass}>{i18n.t('level_label')}</span>
									<select bind:value={level} class={`mt-2 ${inputClass}`}>
										{#each levels as option}
											<option value={option}>{i18n.t(option)}</option>
										{/each}
									</select>
								</label>
								<label>
									<span class={labelClass}>{i18n.t('max_entries')}</span>
									<input bind:value={maxEntries} type="number" min="2" max="64" class={`mt-2 ${inputClass}`} />
								</label>
							</div>
						</div>
					</section>

					<section class={cardClass}>
						<h2 class="text-xl font-black">{i18n.t('location_schedule')}</h2>
						<div class="mt-4 grid gap-3 sm:grid-cols-2">
							<label>
								<span class={labelClass}>{i18n.t('date_label')}</span>
								<input bind:value={date} type="date" class={`mt-2 ${inputClass}`} />
							</label>
							<label>
								<span class={labelClass}>{i18n.t('start_time_label')}</span>
								<TimeSelect bind:value={startTime} placeholder={i18n.t('choose_time')} />
							</label>
							<label>
								<span class={labelClass}>{i18n.t('end_time_label')}</span>
								<TimeSelect bind:value={endTime} placeholder={i18n.t('optional')} />
							</label>
							<label>
								<span class={labelClass}>{i18n.t('deadline_time')}</span>
								<div class="mt-2 grid grid-cols-2 gap-2">
									<input bind:value={registrationDeadlineDate} type="date" class={inputClass} />
									<TimeSelect bind:value={registrationDeadlineTime} placeholder={i18n.t('optional')} flush />
								</div>
							</label>
						</div>
						<div class="mt-4">
							<LocationPickerMap bind:lat bind:lng bind:address />
						</div>
					</section>

					<section class={cardClass}>
						<h2 class="text-xl font-black">{i18n.t('rules')}</h2>
						<textarea bind:value={rules} maxlength={TEXT_LIMITS.eventDescription} rows="4" placeholder={i18n.t('tournament_rules_placeholder')} class={`mt-4 ${inputClass}`}></textarea>
					</section>
				</div>

				<aside class="space-y-5">
					<section class={cardClass}>
						<h2 class="text-lg font-black">{i18n.t('format')}</h2>
						<select bind:value={format} class={`mt-4 ${inputClass}`}>
							<option value="groups_playoff">{i18n.t('groups')}</option>
							<option value="knockout">{i18n.t('knockout')}</option>
							<option value="league">{i18n.t('league')}</option>
						</select>
						{#if format === 'groups_playoff'}
							<div class="mt-3 grid grid-cols-1 gap-2 min-[430px]:grid-cols-2">
								<label>
									<span class={labelClass}>{i18n.t('number_of_groups')}</span>
									<input bind:value={groupCount} type="number" min="2" max="8" class={`mt-2 ${inputClass}`} />
								</label>
								<label>
									<span class={labelClass}>{i18n.t('playoff_spots')}</span>
									<input bind:value={playoffSpots} type="number" min="2" max="16" class={`mt-2 ${inputClass}`} />
								</label>
							</div>
						{/if}
					</section>

					<section class={cardClass}>
						<h2 class="text-lg font-black">{i18n.t('registration')}</h2>
						<select bind:value={registrationType} class={`mt-4 ${inputClass}`}>
							<option value="team">{i18n.t('teams')}</option>
							<option value="individual">{i18n.t('individual')}</option>
						</select>
						{#if registrationType === 'team'}
							<div class="mt-3 grid grid-cols-1 gap-2 min-[430px]:grid-cols-3">
								<input bind:value={teamSize} type="number" min="1" aria-label={i18n.t('on_field')} class={inputClass} />
								<input bind:value={minTeamSize} type="number" min="1" aria-label={i18n.t('min_team')} class={inputClass} />
								<input bind:value={maxTeamSize} type="number" min="1" aria-label={i18n.t('max_team')} class={inputClass} />
							</div>
							<label class="mt-3 flex items-center gap-3 text-sm font-bold text-slate-600 dark:text-slate-300">
								<input bind:checked={allowOpenTeams} type="checkbox" />
								<span>{i18n.t('allow_open_teams')}</span>
							</label>
						{/if}
					</section>

					<section class={cardClass}>
						<h2 class="text-lg font-black">{i18n.t('cost_and_prize')}</h2>
						<select bind:value={entryFeeType} class={`mt-4 ${inputClass}`}>
							<option value="free">{i18n.t('free_entry')}</option>
							<option value="split">{i18n.t('split_cost')}</option>
							<option value="paid">{i18n.t('paid_entry')}</option>
						</select>
						{#if entryFeeType !== 'free'}
							<div class="mt-3 grid grid-cols-[minmax(0,1fr)_5.75rem] gap-2 sm:grid-cols-[minmax(0,1fr)_6rem]">
								<input bind:value={entryFeeAmount} type="number" min="0" step="0.01" placeholder="0.00" class={inputClass} />
								<select bind:value={currency} aria-label={i18n.t('currency')} class={inputClass}>
									{#each currencyOptions as option}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
							</div>
						{/if}
						<select bind:value={prizeType} class={`mt-3 ${inputClass}`}>
							<option value="none">{i18n.t('no_prize')}</option>
							<option value="trophy">{i18n.t('trophy_medal')}</option>
							<option value="product">{i18n.t('product_voucher')}</option>
							<option value="cash">{i18n.t('cash_prize')}</option>
							<option value="other">{i18n.t('other_prize')}</option>
						</select>
						{#if prizeType !== 'none'}
							<input bind:value={prizeDescription} maxlength={TEXT_LIMITS.whatToBring} placeholder={i18n.t('prize_description')} class={`mt-3 ${inputClass}`} />
							<input bind:value={prizeValue} type="number" min="0" step="0.01" placeholder={i18n.t('example_prize_value')} class={`mt-3 ${inputClass}`} />
						{/if}
					</section>

					<button type="submit" disabled={saving} class="w-full rounded-2xl bg-blue-600 px-5 py-4 font-black text-white shadow-lg shadow-blue-600/20 disabled:opacity-60">
						{saving ? i18n.t('saving') : i18n.t('save_changes')}
					</button>
				</aside>
			</form>
		{/if}
	</div>
</main>
