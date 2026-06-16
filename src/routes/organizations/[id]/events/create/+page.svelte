<!--src/routes/organizations/[id]/events/create/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth } from '$lib/firebase';
	import type {
		EventPaymentMode,
		EventVisibility,
		Organization,
		Sport,
		SportLevel
	} from '$lib/schema';
	import { assertCanManageOrganization, canCreateOfficialPaidEvents } from '$lib/services/organization.service';
	import { createSportEvent, promoteEvent } from '$lib/services/event.service';
    import LocationPickerMap from '$lib/components/maps/LocationPickerMap.svelte';

	let organization = $state<Organization | null>(null);

	let loading = $state(true);
	let creating = $state(false);
	let error = $state('');

	let title = $state('');
	let description = $state('');
	let sport = $state<Sport>('football');
	let level = $state<SportLevel>('casual');

	let locationName = $state('');
	let address = $state('');
	let lat = $state('');
	let lng = $state('');

	let date = $state('');
	let startTime = $state('');
	let endTime = $state('');

	let maxParticipants = $state('10');
	let visibility = $state<EventVisibility>('public');

	let paymentMode = $state<EventPaymentMode>('none');
	let priceTotal = $state('');

	let promote = $state(false);
	let promotionBudget = $state('25');
	let promotionDurationDays = $state('7');
	let promotionTargetCity = $state('');
	let promotionTargetSport = $state<Sport | ''>('');

	let eventKind = $state<'free' | 'training' | 'tournament' | 'paid' | 'promotion'>('free');

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

	let pricePerPerson = $derived.by(() => {
		const total = Number(priceTotal);
		const participants = Number(maxParticipants);

		if (!total || !participants || participants <= 0) return 0;

		return total / participants;
	});

	function verificationLabel() {
		if (!organization) return 'Not verified';
		if (organization.verificationStatus === 'verified') return 'Verified';
		if (organization.verificationStatus === 'pending') return 'Verification pending';
		if (organization.verificationStatus === 'rejected') return 'Verification rejected';
		return 'Not verified';
	}

	function verificationClasses() {
		if (!organization) return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

		if (organization.verificationStatus === 'verified') {
			return 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300';
		}

		if (organization.verificationStatus === 'pending') {
			return 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300';
		}

		if (organization.verificationStatus === 'rejected') {
			return 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300';
		}

		return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
	}

	function setEventKind(nextKind: typeof eventKind) {
		eventKind = nextKind;

		if (nextKind === 'paid') {
			paymentMode = 'official';
			visibility = 'public';
		} else if (nextKind === 'promotion') {
			paymentMode = 'none';
			visibility = 'public';
			promote = true;
		} else {
			paymentMode = 'none';
		}
	}

	function buildStartDate() {
		if (!date || !startTime) {
			throw new Error('Choose a date and start time.');
		}

		const start = new Date(`${date}T${startTime}`);

		if (Number.isNaN(start.getTime())) {
			throw new Error('Invalid event date.');
		}

		return start;
	}

	function buildEndDate() {
		if (!date || !endTime) return undefined;

		const end = new Date(`${date}T${endTime}`);

		if (Number.isNaN(end.getTime())) return undefined;

		return end;
	}

	function validateForm() {
		if (!title.trim()) {
			throw new Error('Add an event title.');
		}

		if (!locationName.trim() || !lat.trim() || !lng.trim()) {
            throw new Error('Choose the event location on the map.');
        }

		const participants = Number(maxParticipants);

		if (!Number.isInteger(participants) || participants < 2 || participants > 500) {
			throw new Error('Max participants must be between 2 and 500.');
		}

		if (paymentMode === 'official' && !isVerified) {
			throw new Error('Only verified organizations can create official paid events.');
		}

		if (paymentMode !== 'none') {
			const total = Number(priceTotal);

			if (!total || total <= 0) {
				throw new Error('Add a valid price for this event.');
			}
		}

		if (promote && !isVerified) {
			throw new Error('Only verified organizations can promote events.');
		}
	}

	async function handleCreateEvent() {
		const user = auth.currentUser;

		if (!user || !organization) return;

		creating = true;
		error = '';

		try {
			validateForm();

			const startAt = buildStartDate();
			const endAt = buildEndDate();

			const createdEvent = await createSportEvent({
				title: title.trim(),
				description: description.trim(),
				sport,
				level,
				creatorId: user.uid,
				hostType: 'organization',
				organizationId: organization.id,
				locationName: locationName.trim(),
				address: address.trim(),
				lat: lat.trim() ? Number(lat) : undefined,
				lng: lng.trim() ? Number(lng) : undefined,
				startAt,
				endAt,
				maxParticipants: Number(maxParticipants),
				visibility,
				priceTotal: paymentMode === 'none' ? undefined : Number(priceTotal),
				paymentMode
			});

			if (promote) {
				await promoteEvent({
					eventId: createdEvent.id,
					userId: user.uid,
					budget: Number(promotionBudget) || 0,
					durationDays: Number(promotionDurationDays) || 7,
					targetCity: promotionTargetCity,
					targetSport: promotionTargetSport || null
				});
			}

			await goto(resolve(`/events/${createdEvent.id}`));
		} catch (err) {
			console.error('Create organization event error:', err);
			error = err instanceof Error ? err.message : 'Could not create event.';
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

				organization = await assertCanManageOrganization({
					organizationId,
					userId: user.uid
				});
			} catch (err) {
				console.error('Load organization create event page error:', err);
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
		<section
			class="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
		>
			<p class="text-slate-500 dark:text-slate-400">Loading organization...</p>
		</section>
	{:else if error && !organization}
		<section
			class="rounded-[2rem] border border-red-200 bg-red-50 p-8 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
		>
			{error}
		</section>
	{:else if organization}
		<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
			<div class="flex min-w-0 items-center gap-4">
				<div
					class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.4rem] bg-slate-100 text-2xl font-black text-blue-600 shadow-lg dark:bg-slate-800 dark:text-blue-300"
				>
					{#if organization.logoURL}
						<img
							src={organization.logoURL}
							alt={organization.name}
							class="h-full w-full object-cover"
						/>
					{:else}
						{organization.name.charAt(0).toUpperCase()}
					{/if}
				</div>

				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						<h1 class="truncate text-4xl font-black tracking-tight text-slate-950 dark:text-slate-50">
							Create organization event
						</h1>

						<span class={`rounded-full px-3 py-1 text-xs font-black ${verificationClasses()}`}>
							{verificationLabel()}
						</span>
					</div>

					<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
						Hosted by <span class="font-black">{organization.name}</span>
					</p>
				</div>
			</div>

			<a
				href={resolve(`/organizations/${organization.id}/manage`)}
				class="rounded-2xl bg-slate-100 px-5 py-3 font-black text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
			>
				Back to organization
			</a>
		</div>

		{#if error}
			<div
				class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
			>
				{error}
			</div>
		{/if}

		<form
			class="mt-8 grid gap-6 lg:grid-cols-[1fr_0.75fr]"
			onsubmit={(event) => {
				event.preventDefault();
				handleCreateEvent();
			}}
		>
			<div class="space-y-6">
				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<h2 class="text-2xl font-black text-slate-950 dark:text-slate-50">
						Event type
					</h2>

					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Choose how this organization event should appear on Rally.
					</p>

					<div class="mt-5 grid gap-3 md:grid-cols-2">
						<button
							type="button"
							onclick={() => setEventKind('free')}
							class={`rounded-3xl border p-5 text-left transition ${
								eventKind === 'free'
									? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
									: 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-slate-800'
							}`}
						>
							<p class="font-black text-slate-950 dark:text-slate-50">
								Free official event
							</p>
							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								For open trainings, community activities or brand events.
							</p>
						</button>

						<button
							type="button"
							onclick={() => setEventKind('training')}
							class={`rounded-3xl border p-5 text-left transition ${
								eventKind === 'training'
									? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
									: 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-slate-800'
							}`}
						>
							<p class="font-black text-slate-950 dark:text-slate-50">
								Training session
							</p>
							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								Best for clubs, gyms or recurring sports sessions.
							</p>
						</button>

						<button
							type="button"
							onclick={() => setEventKind('tournament')}
							class={`rounded-3xl border p-5 text-left transition ${
								eventKind === 'tournament'
									? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
									: 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-slate-800'
							}`}
						>
							<p class="font-black text-slate-950 dark:text-slate-50">
								Tournament
							</p>
							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								For competitions, challenges or structured events.
							</p>
						</button>

						<button
							type="button"
							onclick={() => isVerified && setEventKind('paid')}
							disabled={!isVerified}
							class={`rounded-3xl border p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
								eventKind === 'paid'
									? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
									: 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-slate-800'
							}`}
						>
							<div class="flex items-center justify-between gap-3">
								<p class="font-black text-slate-950 dark:text-slate-50">
									Official paid event
								</p>

								{#if !isVerified}
									<span
										class="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400"
									>
										Locked
									</span>
								{/if}
							</div>

							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								Sell paid spots with Rally payment protection. Requires verification.
							</p>
						</button>
					</div>
				</section>

				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<h2 class="text-2xl font-black text-slate-950 dark:text-slate-50">
						Event details
					</h2>

					<div class="mt-5 space-y-4">
						<input
							bind:value={title}
							placeholder="Event title"
							class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
						/>

						<textarea
							bind:value={description}
							rows="4"
							placeholder="Description, rules, what people should bring..."
							class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
						></textarea>

						<div class="grid gap-3 md:grid-cols-3">
							<select
								bind:value={sport}
								class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							>
								{#each sports as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>

							<select
								bind:value={level}
								class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							>
								{#each levels as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>

							<input
								bind:value={maxParticipants}
								type="number"
								min="2"
								max="500"
								placeholder="Max participants"
								class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							/>
						</div>
					</div>
				</section>

				<section
                    class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
                >
                    <h2 class="text-2xl font-black text-slate-950 dark:text-slate-50">
                        Location and schedule
                    </h2>

                    <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Search the place or click directly on the map to select the exact event location.
                    </p>

                    <div class="mt-5 space-y-5">
                        <div class="grid gap-3 md:grid-cols-2">
                            <input
                                bind:value={date}
                                type="date"
                                class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
                            />

                            <input
                                bind:value={startTime}
                                type="time"
                                class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
                            />
                        </div>

                        <input
                            bind:value={endTime}
                            type="time"
                            class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
                        />

                        <LocationPickerMap bind:lat bind:lng bind:address />
                    </div>
                </section>
			</div>

			<aside class="space-y-6">
				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">
						Visibility
					</h2>

					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Official organization events are usually public.
					</p>

					<select
						bind:value={visibility}
						class="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
					>
						<option value="public">Public</option>
						<option value="private">Private</option>
						<option value="friends">Followers / friends</option>
					</select>
				</section>

				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">
						Monetization
					</h2>

					<div class="mt-5 space-y-3">
						<label
							class={`block cursor-pointer rounded-2xl border p-4 transition ${
								paymentMode === 'none'
									? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
									: 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
							}`}
						>
							<input bind:group={paymentMode} type="radio" value="none" class="sr-only" />
							<p class="font-black text-slate-950 dark:text-slate-50">Free</p>
							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								No payment required.
							</p>
						</label>

						<label
							class={`block cursor-pointer rounded-2xl border p-4 transition ${
								paymentMode === 'split'
									? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
									: 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
							}`}
						>
							<input bind:group={paymentMode} type="radio" value="split" class="sr-only" />
							<p class="font-black text-slate-950 dark:text-slate-50">Split cost</p>
							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								Split the court/session cost between participants.
							</p>
						</label>

						<label
							class={`block rounded-2xl border p-4 transition ${
								!isVerified
									? 'cursor-not-allowed opacity-60'
									: 'cursor-pointer'
							} ${
								paymentMode === 'official'
									? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
									: 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
							}`}
						>
							<input
								bind:group={paymentMode}
								type="radio"
								value="official"
								disabled={!isVerified}
								class="sr-only"
							/>
							<div class="flex items-center justify-between gap-3">
								<p class="font-black text-slate-950 dark:text-slate-50">
									Official paid event
								</p>

								{#if !isVerified}
									<span
										class="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400"
									>
										Locked
									</span>
								{/if}
							</div>
							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								Protected paid event. Requires verified organization.
							</p>
						</label>
					</div>

					{#if paymentMode !== 'none'}
						<div class="mt-5">
							<input
								bind:value={priceTotal}
								type="number"
								min="1"
								step="0.01"
								placeholder="Total price (€)"
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							/>

							{#if pricePerPerson}
								<p class="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">
									≈ €{pricePerPerson.toFixed(2)} / participant
								</p>
							{/if}
						</div>
					{/if}
				</section>

				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">
						Promotion
					</h2>

					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Promoted events appear with more visibility in Explore.
					</p>

					<label
						class={`mt-5 flex items-center justify-between rounded-2xl border p-4 ${
							isVerified
								? 'cursor-pointer border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800'
								: 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-800'
						}`}
					>
						<div>
							<p class="font-black text-slate-950 dark:text-slate-50">
								Promote this event
							</p>
							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								{isVerified ? 'Boost this event in Explore.' : 'Requires verified organization.'}
							</p>
						</div>

						<input bind:checked={promote} type="checkbox" disabled={!isVerified} class="h-5 w-5" />
					</label>

					{#if promote}
						<div class="mt-5 space-y-3">
							<input
								bind:value={promotionBudget}
								type="number"
								min="0"
								step="1"
								placeholder="Budget"
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							/>

							<select
								bind:value={promotionDurationDays}
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							>
								<option value="3">3 days</option>
								<option value="7">7 days</option>
								<option value="14">14 days</option>
								<option value="30">30 days</option>
							</select>

							<input
								bind:value={promotionTargetCity}
								placeholder="Target city optional"
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							/>

							<select
								bind:value={promotionTargetSport}
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							>
								<option value="">Same as event sport</option>
								{#each sports as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</div>
					{/if}
				</section>

				<section
					class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
				>
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">
						Trust & safety
					</h2>

					<div class="mt-4 space-y-3 text-sm text-slate-500 dark:text-slate-400">
						<p>
							Official paid events are only available to verified organizations.
						</p>

						<p>
							Promoted events are highlighted in Explore and should represent real activities.
						</p>

						{#if paymentMode === 'official'}
							<div
								class="rounded-2xl bg-blue-50 p-4 font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
							>
								This event will be shown as protected by Rally.
							</div>
						{/if}
					</div>
				</section>

				<button
					type="submit"
					disabled={creating}
					class="w-full rounded-2xl bg-blue-600 px-5 py-4 font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
				>
					{creating ? 'Creating event...' : 'Create organization event'}
				</button>
			</aside>
		</form>
	{/if}
</main>