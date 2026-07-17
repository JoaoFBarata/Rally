<!--src/routes/organizations/[id]/tournaments/create/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth } from '$lib/firebase';
	import LocationPickerMap from '$lib/components/maps/LocationPickerMap.svelte';
	import TimeSelect from '$lib/components/TimeSelect.svelte';
	import {
		assertCanManageOrganization,
		canCreateOfficialPaidEvents
	} from '$lib/services/organization.service';
	import { createTournamentEvent } from '$lib/services/event.service';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { goBack } from '$lib/utils/navigation';
	import { TEXT_LIMITS } from '$lib/constants/text-limits';
	import { i18n } from '$lib/services/i18n.svelte';
	import type {
		EntryFeeType,
		Organization,
		PrizeType,
		Sport,
		SportLevel,
		EventCurrency,
		TournamentFormat,
		TournamentRegistrationType
	} from '$lib/schema';

	let organization = $state<Organization | null>(null);

	let loading = $state(true);
	let creating = $state(false);
	let error = $state('');

	let title = $state('');
	let description = $state('');
	let sport = $state<Sport>('football');
	let level = $state<SportLevel>('casual');

	let address = $state('');
	let lat = $state<number | null>(null);
	let lng = $state<number | null>(null);
	let autofillAddress = $state('');

	let date = $state('');
	let startTime = $state('');
	let endTime = $state('');

	let format = $state<TournamentFormat>('groups_playoff');
	let registrationType = $state<TournamentRegistrationType>('team');

	let maxEntries = $state('8');
	let groupCount = $state('2');
	let playoffSpots = $state('4');

	let teamSize = $state('5');
	let minTeamSize = $state('5');
	let maxTeamSize = $state('8');
	let allowOpenTeams = $state(true);

	let registrationDeadlineDate = $state('');
	let registrationDeadlineTime = $state('');

	let entryFeeType = $state<EntryFeeType>('free');
	let entryFeeAmount = $state('');
	let currency = $state<EventCurrency>('EUR');

	let prizeType = $state<PrizeType>('none');
	let prizeDescription = $state('');
	let prizeValue = $state('');

	let rules = $state('');

	const cardClass =
		'rounded-[1.35rem] border border-slate-200 bg-white p-3.5 shadow-lg shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-[2rem] sm:p-6';
	const inputClass =
		'w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950 sm:px-4 sm:py-3 sm:text-base';
	const sectionTitleClass = 'text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl';
	const sideTitleClass = 'text-lg font-black text-slate-950 dark:text-slate-50 sm:text-xl';
	const labelClass = 'text-xs font-black text-slate-700 dark:text-slate-200 sm:text-sm';
	const helpClass = 'mt-1 text-[11px] font-bold leading-snug text-slate-500 dark:text-slate-400 sm:text-xs';
	const compactHelpClass = 'mt-1 hidden text-[11px] font-bold leading-snug text-slate-500 dark:text-slate-400 sm:block sm:text-xs';
	const currencyOptions: { value: EventCurrency; label: string }[] = [
		{ value: 'EUR', label: 'EUR €' },
		{ value: 'USD', label: 'USD $' },
		{ value: 'GBP', label: 'GBP £' },
		{ value: 'BRL', label: 'BRL R$' }
	];
	const choiceClass = 'flex cursor-pointer items-start gap-2.5 rounded-2xl border p-2.5 transition sm:gap-3 sm:p-4';

	const sports: { value: Sport; label: string }[] = [
		{ value: 'football', label: 'Football' },
		{ value: 'padel', label: 'Padel' },
		{ value: 'basketball', label: 'Basketball' },
		{ value: 'running', label: 'Running' },
		{ value: 'gym', label: 'Gym' },
		{ value: 'tennis', label: 'Tennis' },
		{ value: 'cycling', label: 'Cycling' },
		{ value: 'volleyball', label: 'Volleyball' },
		{ value: 'other', label: 'Other' }
	];

	const levels: { value: SportLevel; label: string }[] = [
		{ value: 'beginner', label: 'Beginner' },
		{ value: 'casual', label: 'Casual' },
		{ value: 'intermediate', label: 'Intermediate' },
		{ value: 'advanced', label: 'Advanced' }
	];

	let isVerified = $derived(organization ? canCreateOfficialPaidEvents(organization) : false);

	function getLocationName() {
		if (!address.trim()) return i18n.t('tournament_location');
		return address.includes(',') ? address.split(',')[0].trim() : address.trim();
	}

	function buildDateTime(value: string) {
		if (!date || !value) return null;

		const parsed = new Date(`${date}T${value}`);

		if (Number.isNaN(parsed.getTime())) return null;

		return parsed;
	}

	function buildRegistrationDeadline() {
		if (!registrationDeadlineDate && !registrationDeadlineTime) return null;
		if (!registrationDeadlineDate || !registrationDeadlineTime) {
			throw new Error(i18n.t('choose_deadline_datetime_error'));
		}

		const parsed = new Date(`${registrationDeadlineDate}T${registrationDeadlineTime}`);

		if (Number.isNaN(parsed.getTime())) return null;

		return parsed;
	}

	function validateForm() {
		if (!title.trim()) throw new Error(i18n.t('add_tournament_name_error'));
		if (!address.trim() || lat === null || lng === null) {
			throw new Error(i18n.t('choose_tournament_location_error'));
		}

		const startAt = buildDateTime(startTime);

		if (!startAt) throw new Error(i18n.t('choose_tournament_datetime_error'));

		const entries = Number(maxEntries);

		if (!Number.isInteger(entries) || entries < 2 || entries > 64) {
			throw new Error(i18n.t('max_entries_range_error'));
		}

		if (format === 'groups_playoff') {
			const groups = Number(groupCount);

			if (!Number.isInteger(groups) || groups < 2 || groups > 8) {
				throw new Error(i18n.t('groups_range_error'));
			}
		}

		if (registrationType === 'team') {
			if (Number(minTeamSize) < 1 || Number(maxTeamSize) < Number(minTeamSize)) {
				throw new Error(i18n.t('check_team_sizes_error'));
			}
		}

		if ((entryFeeType === 'paid' || prizeType === 'cash') && !isVerified) {
			throw new Error(i18n.t('paid_tournament_verified_error'));
		}
	}

	async function handleCreateTournament() {
		const user = auth.currentUser;

		if (!user || !organization) return;

		creating = true;
		error = '';

		try {
			validateForm();

			const startAt = buildDateTime(startTime);
			const endAt = buildDateTime(endTime);

			if (!startAt) throw new Error(i18n.t('choose_tournament_datetime_error'));

			const createdTournament = await createTournamentEvent({
				title: title.trim(),
				description: description.trim(),
				sport,
				level,
				creatorId: user.uid,
				organizationId: organization.id,
				locationName: getLocationName(),
				address: address.trim(),
				lat: lat ?? undefined,
				lng: lng ?? undefined,
				startAt,
				endAt: endAt ?? undefined,
				format,
				registrationType,
				maxEntries: Number(maxEntries),
				groupCount: format === 'groups_playoff' ? Number(groupCount) : undefined,
				playoffSpots: format === 'groups_playoff' ? Number(playoffSpots) : undefined,
				teamSize: registrationType === 'team' ? Number(teamSize) : null,
				minTeamSize: registrationType === 'team' ? Number(minTeamSize) : null,
				maxTeamSize: registrationType === 'team' ? Number(maxTeamSize) : null,
				allowOpenTeams: registrationType === 'team' ? allowOpenTeams : false,
				registrationDeadline: buildRegistrationDeadline(),
				entryFeeType,
				entryFeeAmount: entryFeeType === 'free' ? null : Number(entryFeeAmount || 0),
				currency,
				prizeType,
				prizeDescription: prizeDescription.trim(),
				prizeValue: prizeValue ? Number(prizeValue) : null,
				rules: rules.trim()
			});

			await goto(resolve(`/events/${createdTournament.id}`));
		} catch (err) {
			console.error('Create tournament error:', err);
			error = getFriendlyErrorMessage(err, i18n.t('could_not_create_tournament'));
		} finally {
			creating = false;
		}
	}

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, async (user) => {
			if (!user) {
				await goto(resolve('/login'));
				return;
			}

			loading = true;
			error = '';

			try {
				const organizationId = page.params.id;
				if (!organizationId) {
					throw new Error(i18n.t('organization_id_not_found'));
				}

				organization = await assertCanManageOrganization({
					organizationId,
					userId: user.uid
				});
			} catch (err) {
				console.error('Load tournament create page error:', err);
				error = getFriendlyErrorMessage(err, 'Could not load organization.');
			} finally {
				loading = false;
			}
		});

		return unsubscribe;
	});
</script>

<main class="mx-auto max-w-6xl px-4 py-4 sm:px-5 sm:py-8">
	{#if loading}
		<section class="rounded-[1.35rem] bg-white p-5 dark:bg-slate-900 sm:rounded-[2rem] sm:p-8">
			<p class="text-slate-500 dark:text-slate-400">Loading organization...</p>
		</section>
	{:else if organization}
		<button
			type="button"
			onclick={() => goBack(resolve(`/organizations/${page.params.id}/manage`))}
			class="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
		>
			<span class="leading-none">←</span>
			<span>{i18n.t('back')}</span>
		</button>

		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<div>
				<p class="text-sm font-black uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
					{i18n.t('competitive_event')}
				</p>

				<h1 class="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-slate-50 sm:text-4xl">
					{i18n.t('create_tournament')}
				</h1>

				<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
					{i18n.t('hosted_by')} <span class="font-black">{organization.name}</span>
				</p>
			</div>
		</div>

		{#if error}
			<div
				class="mt-6 rounded-2xl bg-red-50 p-4 font-bold text-red-700 dark:bg-red-950 dark:text-red-300"
			>
				{error}
			</div>
		{/if}

		<form
			class="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)] lg:gap-6"
			onsubmit={(event) => {
				event.preventDefault();
				handleCreateTournament();
			}}
		>
			<div class="space-y-4 sm:space-y-6">
				<section class={cardClass}>
					<h2 class={sectionTitleClass}>{i18n.t('tournament_details')}</h2>

					<div class="mt-4 space-y-3 sm:mt-5 sm:space-y-4">
						<input
							bind:value={title}
							maxlength={TEXT_LIMITS.eventTitle}
							placeholder={i18n.t('tournament_name_placeholder')}
							class={inputClass}
						/>

						<textarea
							bind:value={description}
							maxlength={TEXT_LIMITS.eventDescription}
							rows="3"
							placeholder={i18n.t('tournament_description_placeholder')}
							class={inputClass}
						></textarea>

							<div class="grid grid-cols-2 items-end gap-3 md:grid-cols-3">
								<label class="block">
									<span class={labelClass}>{i18n.t('sport')}</span>
									<select
										bind:value={sport}
										class={`mt-2 ${inputClass}`}
									>
										{#each sports as option}
											<option value={option.value}>{i18n.t(`sport_${option.value}`)}</option>
										{/each}
									</select>
								</label>

								<label class="block">
									<span class={labelClass}>{i18n.t('level_label')}</span>
									<select
										bind:value={level}
										class={`mt-2 ${inputClass}`}
									>
										{#each levels as option}
											<option value={option.value}>{i18n.t(option.value)}</option>
										{/each}
									</select>
								</label>

							<label class="col-span-2 block md:col-span-1">
								<span class={labelClass}>
									{i18n.t('max_entries')}
								</span>

								<p class={compactHelpClass}>
									{i18n.t('max_entries_help', { unit: registrationType === 'team' ? i18n.t('teams') : i18n.t('players_lowercase') })}
								</p>

								<input
									bind:value={maxEntries}
									type="number"
									min="2"
									max="64"
									placeholder={registrationType === 'team'
										? i18n.t('example_teams', { count: 8 })
										: i18n.t('example_players', { count: 16 })}
									class={`mt-2 ${inputClass}`}
								/>
							</label>
						</div>
					</div>
				</section>

				<section class={cardClass}>
					<h2 class={sectionTitleClass}>
						{i18n.t('location_schedule')}
					</h2>

					<div class="mt-4 space-y-3 sm:mt-5 sm:space-y-5">
						<div class="grid grid-cols-2 gap-3">
							<label class="min-w-0">
								<span class="text-xs font-bold text-slate-500 dark:text-slate-400 sm:text-sm">{i18n.t('date_label')}</span>
								<input
									bind:value={date}
									type="date"
									class={`mt-2 min-w-0 ${inputClass}`}
								/>
							</label>

							<label class="min-w-0">
								<span class="text-xs font-bold text-slate-500 dark:text-slate-400 sm:text-sm">{i18n.t('start_time_label')}</span>
								<TimeSelect bind:value={startTime} placeholder={i18n.t('choose_time')} />
							</label>
						</div>

						<div class="grid grid-cols-2 gap-3">
							<label class="min-w-0">
								<span class="text-xs font-bold text-slate-500 dark:text-slate-400 sm:text-sm"
									>{i18n.t('deadline_date')}</span
								>
								<input
									bind:value={registrationDeadlineDate}
									type="date"
									class={`mt-2 min-w-0 ${inputClass}`}
								/>
							</label>

							<label class="min-w-0">
								<span class="text-xs font-bold text-slate-500 dark:text-slate-400 sm:text-sm"
									>{i18n.t('deadline_time')}</span
								>
								<TimeSelect bind:value={registrationDeadlineTime} placeholder={i18n.t('optional')} />
							</label>
						</div>

							{#if organization?.address}
								<button
									type="button"
									onclick={() => (autofillAddress = organization!.address ?? '')}
									class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:bg-blue-950/30 dark:hover:text-blue-300 sm:px-4 sm:py-2.5 sm:text-sm"
								>
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="h-4 w-4 shrink-0"
										aria-hidden="true"
									>
										<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
										<circle cx="12" cy="10" r="3" />
									</svg>
									{i18n.t('use_organization_address')}
								</button>
							{/if}

							<LocationPickerMap bind:lat bind:lng bind:address {autofillAddress} />
						</div>
					</section>

				<section class={cardClass}>
					<h2 class={sectionTitleClass}>{i18n.t('rules')}</h2>

					<textarea
						bind:value={rules}
						maxlength={TEXT_LIMITS.eventDescription}
						rows="4"
						placeholder={i18n.t('tournament_rules_placeholder')}
						class={`mt-4 sm:mt-5 ${inputClass}`}
					></textarea>
				</section>
			</div>

			<aside class="space-y-4 sm:space-y-6">
				<section class={cardClass}>
					<h2 class={sideTitleClass}>{i18n.t('format')}</h2>

					<div class="mt-4 grid grid-cols-3 gap-2 sm:mt-5 lg:grid-cols-1 lg:gap-3">
						<label
							class={`${choiceClass} ${
								format === 'groups_playoff'
									? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
									: 'border-slate-200 dark:border-slate-700'
							}`}
						>
							<input bind:group={format} type="radio" value="groups_playoff" class="sr-only" />
							<span
								class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-slate-400 dark:border-slate-500 sm:h-5 sm:w-5"
							>
								{#if format === 'groups_playoff'}
									<span class="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400 sm:h-2.5 sm:w-2.5"></span>
								{/if}
							</span>
							<span class="min-w-0">
								<span class="block text-sm font-black sm:text-base">{i18n.t('groups')}</span>
								<span class="mt-1 hidden text-xs text-slate-500 dark:text-slate-400 sm:block sm:text-sm"
									>{i18n.t('best_for_most_tournaments')}</span
								>
							</span>
						</label>

						<label
							class={`${choiceClass} ${
								format === 'knockout'
									? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
									: 'border-slate-200 dark:border-slate-700'
							}`}
						>
							<input bind:group={format} type="radio" value="knockout" class="sr-only" />
							<span
								class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-slate-400 dark:border-slate-500 sm:h-5 sm:w-5"
							>
								{#if format === 'knockout'}
									<span class="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400 sm:h-2.5 sm:w-2.5"></span>
								{/if}
							</span>
							<span class="min-w-0">
								<span class="block text-xs font-black sm:text-base">{i18n.t('knockout')}</span>
								<span class="mt-1 hidden text-xs text-slate-500 dark:text-slate-400 sm:block sm:text-sm"
									>{i18n.t('direct_elimination_bracket')}</span
								>
							</span>
						</label>

						<label
							class={`${choiceClass} ${
								format === 'league'
									? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
									: 'border-slate-200 dark:border-slate-700'
							}`}
						>
							<input bind:group={format} type="radio" value="league" class="sr-only" />
							<span
								class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-slate-400 dark:border-slate-500 sm:h-5 sm:w-5"
							>
								{#if format === 'league'}
									<span class="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400 sm:h-2.5 sm:w-2.5"></span>
								{/if}
							</span>
							<span class="min-w-0">
								<span class="block text-sm font-black sm:text-base">{i18n.t('league')}</span>
								<span class="mt-1 hidden text-xs text-slate-500 dark:text-slate-400 sm:block sm:text-sm"
									>{i18n.t('everyone_plays_everyone')}</span
								>
							</span>
						</label>
					</div>

					{#if format === 'groups_playoff'}
						<div class="mt-4 grid grid-cols-2 items-stretch gap-3 sm:mt-5">
							<label class="flex h-full flex-col">
								<span class={labelClass}>
									{i18n.t('number_of_groups')}
								</span>

								<p class={`${compactHelpClass} min-h-[2.5rem]`}>
									{i18n.t('tournament_groups_help')}
								</p>

								<input
									bind:value={groupCount}
									type="number"
									min="2"
									max="8"
									placeholder={i18n.t('example_number', { count: 2 })}
									class={`mt-auto ${inputClass}`}
								/>
							</label>

							<label class="flex h-full flex-col">
								<span class={labelClass}>
									{i18n.t('playoff_spots')}
								</span>

								<p class={`${compactHelpClass} min-h-[2.5rem]`}>
									{i18n.t('playoff_spots_help', { unit: registrationType === 'team' ? i18n.t('teams') : i18n.t('players_lowercase') })}
								</p>

								<input
									bind:value={playoffSpots}
									type="number"
									min="2"
									max="16"
									placeholder={i18n.t('example_number', { count: 4 })}
									class={`mt-auto ${inputClass}`}
								/>
							</label>
						</div>
					{/if}
				</section>

				<section class={cardClass}>
					<h2 class={sideTitleClass}>{i18n.t('registration')}</h2>

					<div class="mt-4 grid grid-cols-2 gap-2.5 sm:mt-5 sm:gap-3 lg:grid-cols-1">
						<label
							class={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition sm:p-4 ${
								registrationType === 'team'
									? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
									: 'border-slate-200 dark:border-slate-700'
							}`}
						>
							<input bind:group={registrationType} type="radio" value="team" class="sr-only" />
							<span
								class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-400 dark:border-slate-500"
							>
								{#if registrationType === 'team'}
									<span class="h-2.5 w-2.5 rounded-full bg-blue-600 dark:bg-blue-400"></span>
								{/if}
							</span>
							<span class="text-sm font-black sm:text-base">{i18n.t('teams')}</span>
						</label>

						<label
							class={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition sm:p-4 ${
								registrationType === 'individual'
									? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
									: 'border-slate-200 dark:border-slate-700'
							}`}
						>
							<input
								bind:group={registrationType}
								type="radio"
								value="individual"
								class="sr-only"
							/>
							<span
								class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-400 dark:border-slate-500"
							>
								{#if registrationType === 'individual'}
									<span class="h-2.5 w-2.5 rounded-full bg-blue-600 dark:bg-blue-400"></span>
								{/if}
							</span>
							<span class="text-sm font-black sm:text-base">{i18n.t('individual')}</span>
						</label>
					</div>

					{#if registrationType === 'team'}
						<div class="mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-3 lg:grid-cols-1">
							<label class="block">
								<span class={labelClass}>
									{i18n.t('on_field')}
								</span>

								<p class={compactHelpClass}>
									{i18n.t('on_field_help')}
								</p>

								<input
									bind:value={teamSize}
									type="number"
									min="1"
									placeholder={i18n.t('example_number', { count: 5 })}
									class={`mt-2 ${inputClass}`}
								/>
							</label>

							<label class="block">
								<span class={labelClass}>
									{i18n.t('min_team')}
								</span>

								<p class={compactHelpClass}>
									{i18n.t('minimum_team_players_help')}
								</p>

								<input
									bind:value={minTeamSize}
									type="number"
									min="1"
									placeholder={i18n.t('example_number', { count: 5 })}
									class={`mt-2 ${inputClass}`}
								/>
							</label>

							<label class="block">
								<span class={labelClass}>
									{i18n.t('max_team')}
								</span>

								<p class={compactHelpClass}>
									{i18n.t('max_team_help')}
								</p>

								<input
									bind:value={maxTeamSize}
									type="number"
									min="1"
									placeholder={i18n.t('example_number', { count: 8 })}
									class={`mt-2 ${inputClass}`}
								/>
							</label>

							<label
								class="col-span-3 flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800 sm:p-4 lg:col-span-1"
							>
								<span>
									<span class="block font-black text-slate-950 dark:text-slate-50"
										>{i18n.t('allow_open_teams')}</span
									>
									<span class="mt-1 block text-[11px] font-bold leading-snug text-slate-500 dark:text-slate-400 sm:text-xs">
										{i18n.t('allow_open_teams_help')}
									</span>
								</span>
								<input bind:checked={allowOpenTeams} type="checkbox" class="sr-only" />
								<span
									class={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
										allowOpenTeams
											? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-950'
											: 'border-slate-400 bg-white dark:border-slate-500 dark:bg-slate-900'
									}`}
								>
									{#if allowOpenTeams}
										<svg viewBox="0 0 20 20" fill="none" class="h-4 w-4" aria-hidden="true">
											<path
												d="m4 10 4 4 8-9"
												stroke="currentColor"
												stroke-width="2.5"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										</svg>
									{/if}
								</span>
							</label>
						</div>
					{/if}
				</section>

				<section class={cardClass}>
					<h2 class={sideTitleClass}>{i18n.t('cost_and_prize')}</h2>

					<div class="mt-4 grid gap-3 sm:mt-5 sm:grid-cols-2 lg:grid-cols-1">
						<select bind:value={entryFeeType} class={inputClass}>
							<option value="free">{i18n.t('free_entry')}</option>
							<option value="split">{i18n.t('split_cost')}</option>
							<option value="paid" disabled={!isVerified}
								>{i18n.t('paid_entry')} {isVerified ? '' : i18n.t('verified_only_parenthetical')}</option
							>
						</select>

						<select bind:value={prizeType} class={inputClass}>
							<option value="none">{i18n.t('no_prize')}</option>
							<option value="trophy">{i18n.t('trophy_medal')}</option>
							<option value="product">{i18n.t('product_voucher')}</option>
							<option value="cash" disabled={!isVerified}
								>{i18n.t('cash_prize')} {isVerified ? '' : i18n.t('verified_only_parenthetical')}</option
							>
							<option value="other">{i18n.t('other_prize')}</option>
						</select>

						{#if entryFeeType !== 'free'}
							<label class="block">
								<span class={labelClass}>
									{i18n.t('entry_fee')}
								</span>

								<p class={compactHelpClass}>
									{i18n.t('entry_fee_amount_help', { unit: registrationType === 'team' ? i18n.t('team') : i18n.t('player') })}
								</p>

								<div class="mt-2 grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
									<input
										bind:value={entryFeeAmount}
										type="number"
										min="0"
										step="0.01"
										placeholder={registrationType === 'team'
											? i18n.t('example_fee_team')
											: i18n.t('example_fee_player')}
										class={inputClass}
									/>
									<select bind:value={currency} aria-label={i18n.t('currency')} class={inputClass}>
										{#each currencyOptions as option}
											<option value={option.value}>{option.label}</option>
										{/each}
									</select>
								</div>
							</label>
						{/if}

						{#if prizeType !== 'none'}
							<input
								bind:value={prizeDescription}
								maxlength={TEXT_LIMITS.whatToBring}
								placeholder={i18n.t('prize_description')}
								class={inputClass}
							/>
							<label class="block">
								<span class={labelClass}>
									{i18n.t('estimated_prize_value')}
								</span>

								<p class={compactHelpClass}>
									{i18n.t('estimated_prize_help')}
								</p>

								<input
									bind:value={prizeValue}
									type="number"
									min="0"
									step="0.01"
									placeholder={i18n.t('example_prize_value')}
									class={`mt-2 ${inputClass}`}
								/>
							</label>
						{/if}
					</div>
				</section>

				<button
					type="submit"
					disabled={creating}
					class="w-full rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60 sm:py-4 sm:text-base"
				>
					{creating ? i18n.t('creating_tournament') : i18n.t('create_tournament')}
				</button>
			</aside>
		</form>
	{/if}
</main>
