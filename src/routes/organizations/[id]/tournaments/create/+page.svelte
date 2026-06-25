<!--src/routes/organizations/[id]/tournaments/create/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth } from '$lib/firebase';
	import LocationPickerMap from '$lib/components/maps/LocationPickerMap.svelte';
	import {
		assertCanManageOrganization,
		canCreateOfficialPaidEvents
	} from '$lib/services/organization.service';
	import { createTournamentEvent } from '$lib/services/event.service';
	import { goBack } from '$lib/utils/navigation';
	import type {
		EntryFeeType,
		Organization,
		PrizeType,
		Sport,
		SportLevel,
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

	let registrationDeadline = $state('');

	let entryFeeType = $state<EntryFeeType>('free');
	let entryFeeAmount = $state('');

	let prizeType = $state<PrizeType>('none');
	let prizeDescription = $state('');
	let prizeValue = $state('');

	let rules = $state('');

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
		if (!address.trim()) return 'Tournament location';
		return address.includes(',') ? address.split(',')[0].trim() : address.trim();
	}

	function buildDateTime(value: string) {
		if (!date || !value) return null;

		const parsed = new Date(`${date}T${value}`);

		if (Number.isNaN(parsed.getTime())) return null;

		return parsed;
	}

	function buildRegistrationDeadline() {
		if (!registrationDeadline) return null;

		const parsed = new Date(registrationDeadline);

		if (Number.isNaN(parsed.getTime())) return null;

		return parsed;
	}

	function validateForm() {
		if (!title.trim()) throw new Error('Add a tournament name.');
		if (!address.trim() || lat === null || lng === null) {
			throw new Error('Choose the tournament location on the map.');
		}

		const startAt = buildDateTime(startTime);

		if (!startAt) throw new Error('Choose tournament date and start time.');

		const entries = Number(maxEntries);

		if (!Number.isInteger(entries) || entries < 2 || entries > 64) {
			throw new Error('Max entries must be between 2 and 64.');
		}

		if (format === 'groups_playoff') {
			const groups = Number(groupCount);

			if (!Number.isInteger(groups) || groups < 2 || groups > 8) {
				throw new Error('Groups must be between 2 and 8.');
			}
		}

		if (registrationType === 'team') {
			if (Number(minTeamSize) < 1 || Number(maxTeamSize) < Number(minTeamSize)) {
				throw new Error('Check team size values.');
			}
		}

		if ((entryFeeType === 'paid' || prizeType === 'cash') && !isVerified) {
			throw new Error('Paid tournaments and cash prizes require verified organization.');
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

			if (!startAt) throw new Error('Choose tournament date and start time.');

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
				prizeType,
				prizeDescription: prizeDescription.trim(),
				prizeValue: prizeValue ? Number(prizeValue) : null,
				rules: rules.trim()
			});

			await goto(resolve(`/events/${createdTournament.id}`));
		} catch (err) {
			console.error('Create tournament error:', err);
			error = err instanceof Error ? err.message : 'Could not create tournament.';
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
					throw new Error('Organization ID not found.');
				}

				organization = await assertCanManageOrganization({
					organizationId,
					userId: user.uid
				});
			} catch (err) {
				console.error('Load tournament create page error:', err);
				error = err instanceof Error ? err.message : 'Could not load organization.';
			} finally {
				loading = false;
			}
		});

		return unsubscribe;
	});
</script>

<main class="mx-auto max-w-6xl px-5 py-8">
	{#if loading}
		<section class="rounded-[2rem] bg-white p-8 dark:bg-slate-900">
			<p class="text-slate-500 dark:text-slate-400">Loading organization...</p>
		</section>
	{:else if organization}
		<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
			<div>
				<p class="text-sm font-black uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
					Competitive event
				</p>

				<h1 class="mt-1 text-4xl font-black tracking-tight text-slate-950 dark:text-slate-50">
					Create tournament
				</h1>

				<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
					Hosted by <span class="font-black">{organization.name}</span>
				</p>
			</div>

			<button
				type="button"
				onclick={() => goBack(resolve(`/organizations/${page.params.id}/manage`))}
				class="rounded-2xl bg-slate-100 px-5 py-3 font-black text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
			>
				← Back to organization
			</button>
		</div>

		{#if error}
			<div
				class="mt-6 rounded-2xl bg-red-50 p-4 font-bold text-red-700 dark:bg-red-950 dark:text-red-300"
			>
				{error}
			</div>
		{/if}

		<form
			class="mt-8 grid gap-6 lg:grid-cols-[1fr_0.75fr]"
			onsubmit={(event) => {
				event.preventDefault();
				handleCreateTournament();
			}}
		>
			<div class="space-y-6">
				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<h2 class="text-2xl font-black text-slate-950 dark:text-slate-50">Tournament details</h2>

					<div class="mt-5 space-y-4">
						<input
							bind:value={title}
							placeholder="Tournament name"
							class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
						/>

						<textarea
							bind:value={description}
							rows="4"
							placeholder="Describe the tournament, format, requirements..."
							class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
						></textarea>

						<div class="grid gap-3 md:grid-cols-3">
							<select
								bind:value={sport}
								class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							>
								{#each sports as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>

							<select
								bind:value={level}
								class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							>
								{#each levels as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>

							<label class="block">
								<span class="text-sm font-black text-slate-700 dark:text-slate-200">
									Max entries
								</span>

								<p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
									Maximum number of {registrationType === 'team' ? 'teams' : 'players'} that can register
									for the tournament.
								</p>

								<input
									bind:value={maxEntries}
									type="number"
									min="2"
									max="64"
									placeholder={registrationType === 'team'
										? 'Example: 8 teams'
										: 'Example: 16 players'}
									class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								/>
							</label>
						</div>
					</div>
				</section>

				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<h2 class="text-2xl font-black text-slate-950 dark:text-slate-50">
						Location and schedule
					</h2>

					<div class="mt-5 space-y-5">
						<div class="grid grid-cols-2 gap-3">
							<label class="min-w-0">
								<span class="text-sm font-bold text-slate-500 dark:text-slate-400"
									>Tournament date</span
								>
								<input
									bind:value={date}
									type="date"
									class="mt-2 min-w-0 w-full rounded-2xl border border-slate-200 bg-slate-50 px-2 py-3 text-sm text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 sm:px-4 sm:text-base"
								/>
							</label>

							<label class="min-w-0">
								<span class="text-sm font-bold text-slate-500 dark:text-slate-400">Start time</span>
								<input
									bind:value={startTime}
									type="time"
									class="mt-2 min-w-0 w-full rounded-2xl border border-slate-200 bg-slate-50 px-2 py-3 text-sm text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 sm:px-4 sm:text-base"
								/>
							</label>
						</div>

						<label class="block min-w-0">
							<span class="text-sm font-bold text-slate-500 dark:text-slate-400"
								>End time (optional)</span
							>
							<input
								bind:value={endTime}
								type="time"
								class="mt-2 min-w-0 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							/>
						</label>

						<label class="block">
							<span class="text-sm font-bold text-slate-500 dark:text-slate-400"
								>Registration deadline</span
							>
							<input
								bind:value={registrationDeadline}
								type="datetime-local"
								class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							/>
						</label>

						<LocationPickerMap bind:lat bind:lng bind:address />
					</div>
				</section>

				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<h2 class="text-2xl font-black text-slate-950 dark:text-slate-50">Rules</h2>

					<textarea
						bind:value={rules}
						rows="5"
						placeholder="Tournament rules, tie-breaks, match duration, required equipment..."
						class="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
					></textarea>
				</section>
			</div>

			<aside class="space-y-6">
				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Format</h2>

					<div class="mt-5 space-y-3">
						<label
							class={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
								format === 'groups_playoff'
									? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
									: 'border-slate-200 dark:border-slate-700'
							}`}
						>
							<input bind:group={format} type="radio" value="groups_playoff" class="sr-only" />
							<span
								class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-400 dark:border-slate-500"
							>
								{#if format === 'groups_playoff'}
									<span class="h-2.5 w-2.5 rounded-full bg-blue-600 dark:bg-blue-400"></span>
								{/if}
							</span>
							<span>
								<span class="block font-black">Groups + Playoffs</span>
								<span class="mt-1 block text-sm text-slate-500 dark:text-slate-400"
									>Best for most tournaments.</span
								>
							</span>
						</label>

						<label
							class={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
								format === 'knockout'
									? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
									: 'border-slate-200 dark:border-slate-700'
							}`}
						>
							<input bind:group={format} type="radio" value="knockout" class="sr-only" />
							<span
								class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-400 dark:border-slate-500"
							>
								{#if format === 'knockout'}
									<span class="h-2.5 w-2.5 rounded-full bg-blue-600 dark:bg-blue-400"></span>
								{/if}
							</span>
							<span>
								<span class="block font-black">Knockout / Playoffs</span>
								<span class="mt-1 block text-sm text-slate-500 dark:text-slate-400"
									>Direct elimination bracket.</span
								>
							</span>
						</label>

						<label
							class={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
								format === 'league'
									? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
									: 'border-slate-200 dark:border-slate-700'
							}`}
						>
							<input bind:group={format} type="radio" value="league" class="sr-only" />
							<span
								class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-400 dark:border-slate-500"
							>
								{#if format === 'league'}
									<span class="h-2.5 w-2.5 rounded-full bg-blue-600 dark:bg-blue-400"></span>
								{/if}
							</span>
							<span>
								<span class="block font-black">League / Championship</span>
								<span class="mt-1 block text-sm text-slate-500 dark:text-slate-400"
									>Everyone plays everyone.</span
								>
							</span>
						</label>
					</div>

					{#if format === 'groups_playoff'}
						<div class="mt-5 grid gap-3 md:grid-cols-2">
							<label class="block">
								<span class="text-sm font-black text-slate-700 dark:text-slate-200">
									Number of groups
								</span>

								<p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
									How many groups the tournament will have before the playoff stage.
								</p>

								<input
									bind:value={groupCount}
									type="number"
									min="2"
									max="8"
									placeholder="Example: 2"
									class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								/>
							</label>

							<label class="block">
								<span class="text-sm font-black text-slate-700 dark:text-slate-200">
									Playoff spots
								</span>

								<p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
									How many {registrationType === 'team' ? 'teams' : 'players'} qualify from the groups
									into the knockout stage.
								</p>

								<input
									bind:value={playoffSpots}
									type="number"
									min="2"
									max="16"
									placeholder="Example: 4"
									class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								/>
							</label>
						</div>
					{/if}
				</section>

				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Registration</h2>

					<div class="mt-5 space-y-3">
						<label
							class={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${
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
							<span class="font-black">Teams</span>
						</label>

						<label
							class={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${
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
							<span class="font-black">Individual players</span>
						</label>
					</div>

					{#if registrationType === 'team'}
						<div class="mt-5 grid gap-3">
							<label class="block">
								<span class="text-sm font-black text-slate-700 dark:text-slate-200">
									Players on field/court
								</span>

								<p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
									Number of players that actively play at the same time. Example: 5 for a 5v5
									football tournament.
								</p>

								<input
									bind:value={teamSize}
									type="number"
									min="1"
									placeholder="Example: 5"
									class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								/>
							</label>

							<label class="block">
								<span class="text-sm font-black text-slate-700 dark:text-slate-200">
									Minimum players per team
								</span>

								<p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
									Minimum number of players needed for a team to be accepted in the tournament.
								</p>

								<input
									bind:value={minTeamSize}
									type="number"
									min="1"
									placeholder="Example: 5"
									class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								/>
							</label>

							<label class="block">
								<span class="text-sm font-black text-slate-700 dark:text-slate-200">
									Maximum players per team
								</span>

								<p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
									Maximum squad size, including substitutes. Example: 8 means 5 players plus up to 3
									substitutes.
								</p>

								<input
									bind:value={maxTeamSize}
									type="number"
									min="1"
									placeholder="Example: 8"
									class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								/>
							</label>

							<label
								class="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"
							>
								<span>
									<span class="block font-black text-slate-950 dark:text-slate-50"
										>Allow open teams</span
									>
									<span class="mt-1 block text-xs font-bold text-slate-500 dark:text-slate-400">
										Players can join teams that have not yet reached the maximum team size.
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

				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Cost and prize</h2>

					<div class="mt-5 space-y-3">
						<select
							bind:value={entryFeeType}
							class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
						>
							<option value="free">Free entry</option>
							<option value="split">Split cost</option>
							<option value="paid" disabled={!isVerified}
								>Paid entry {isVerified ? '' : '(verified only)'}</option
							>
						</select>

						{#if entryFeeType !== 'free'}
							<label class="block">
								<span class="text-sm font-black text-slate-700 dark:text-slate-200">
									Entry fee
								</span>

								<p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
									Amount paid per {registrationType === 'team' ? 'team' : 'player'} to enter the tournament.
								</p>

								<input
									bind:value={entryFeeAmount}
									type="number"
									min="0"
									step="0.01"
									placeholder={registrationType === 'team'
										? 'Example: 25 €/team'
										: 'Example: 10 €/player'}
									class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								/>
							</label>
						{/if}

						<select
							bind:value={prizeType}
							class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
						>
							<option value="none">No prize</option>
							<option value="trophy">Trophy / medal</option>
							<option value="product">Product / voucher</option>
							<option value="cash" disabled={!isVerified}
								>Cash prize {isVerified ? '' : '(verified only)'}</option
							>
							<option value="other">Other prize</option>
						</select>

						{#if prizeType !== 'none'}
							<input
								bind:value={prizeDescription}
								placeholder="Prize description"
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							/>
							<label class="block">
								<span class="text-sm font-black text-slate-700 dark:text-slate-200">
									Estimated prize value
								</span>

								<p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
									Approximate value of the prize. This helps users understand how attractive the
									tournament is.
								</p>

								<input
									bind:value={prizeValue}
									type="number"
									min="0"
									step="0.01"
									placeholder="Example: 100 €"
									class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								/>
							</label>
						{/if}
					</div>
				</section>

				<button
					type="submit"
					disabled={creating}
					class="w-full rounded-2xl bg-blue-600 px-5 py-4 font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
				>
					{creating ? 'Creating tournament...' : 'Create tournament'}
				</button>
			</aside>
		</form>
	{/if}
</main>
