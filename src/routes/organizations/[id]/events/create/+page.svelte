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
		EventPromotionPlan,
		EventVisibility,
		EventCurrency,
		Organization,
		Sport,
		SportLevel
	} from '$lib/schema';
	import {
		assertCanManageOrganization,
		canCreateOfficialPaidEvents
	} from '$lib/services/organization.service';
	import {
		createSportEvent,
		getAvailablePromotionPlanOptions,
		PROMOTION_COUNTRIES
	} from '$lib/services/event.service';
	import { createEventPromotionCheckout } from '$lib/services/event-payment.service';
	import LocationPickerMap from '$lib/components/maps/LocationPickerMap.svelte';
	import RouteEditorMap from '$lib/components/maps/RouteEditorMap.svelte';
	import TimeSelect from '$lib/components/TimeSelect.svelte';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { goBack } from '$lib/utils/navigation';
	import { getCurrencySymbol } from '$lib/utils/format.utils';
	import { TEXT_LIMITS } from '$lib/constants/text-limits';
	import { i18n } from '$lib/services/i18n.svelte';
	import VoiceRecordButton from '$lib/components/VoiceRecordButton.svelte';
	import CreationTypeSwitch from '$lib/components/CreationTypeSwitch.svelte';
	import type { VoiceExtractedFields } from '$lib/services/voice-event.service';

	let organization = $state<Organization | null>(null);

	let loading = $state(true);
	let creating = $state(false);
	let error = $state('');
	let submitAttempted = $state(false);

	let title = $state('');
	let description = $state('');
	let sport = $state<Sport>('football');
	let customSport = $state('');
	let level = $state<SportLevel>('casual');

	let locationName = $state('');
	let address = $state('');
	let lat = $state<number | null>(null);
	let lng = $state<number | null>(null);
	let route = $state<{ lat: number; lng: number }[]>([]);
	let autofillAddress = $state('');

	let date = $state('');
	let startTime = $state('');
	let endTime = $state('');
	const todayStr = new Date().toLocaleDateString('en-CA');

	let maxParticipants = $state('10');
	let enableMinParticipants = $state(false);
	let minParticipants = $state<string>('');
	let minParticipantsDeadlineHours = $state(8);
	let visibility = $state<EventVisibility>('public');

	let paymentMode = $state<EventPaymentMode>('none');
	let priceTotal = $state('');
	let currency = $state<EventCurrency>('EUR');

	let promote = $state(false);
	let promotionPlan = $state<EventPromotionPlan>('sport');
	let promotionBudget = $state('25');
	let promotionDurationDays = $state('7');
	let promotionTargetCity = $state('');
	let promotionTargetCountry = $state('PT');
	let promotionTargetSport = $state<Sport | ''>('');

	let eventKind = $state<'free' | 'training' | 'tournament' | 'paid' | 'promotion'>('free');

	const sportValues: Sport[] = [
		'football',
		'padel',
		'basketball',
		'running',
		'gym',
		'tennis',
		'cycling',
		'volleyball',
		'bowling',
		'snooker',
		'golf',
		'swimming',
		'hiking',
		'yoga',
		'surf',
		'pingpong',
		'rugby',
		'americanfootball',
		'other'
	];

	const levelValues: SportLevel[] = ['beginner', 'casual', 'intermediate', 'advanced'];
	const currencyOptions: { value: EventCurrency; label: string }[] = [
		{ value: 'EUR', label: 'EUR €' },
		{ value: 'USD', label: 'USD $' },
		{ value: 'GBP', label: 'GBP £' },
		{ value: 'BRL', label: 'BRL R$' }
	];

	const promotionPlanOptions = getAvailablePromotionPlanOptions();
	const cardClass =
		'rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-[2rem] sm:p-6';
	const inputClass =
		'w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950 sm:px-4 sm:py-3 sm:text-base';
	const sectionTitleClass = 'text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl';
	const labelClass = 'text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400';
	const requiredAsteriskClass = 'ml-1 text-red-500';
	const invalidInputClass =
		'border-red-400 bg-red-50/70 focus:border-red-500 focus:ring-red-100 dark:border-red-700 dark:bg-red-950/30 dark:focus:ring-red-950';
	const fieldErrorClass = 'mt-1.5 text-xs font-bold text-red-600 dark:text-red-300';

	let isVerified = $derived(organization ? canCreateOfficialPaidEvents(organization) : false);
	let currencySymbol = $derived(getCurrencySymbol(currency));

	let pricePerPerson = $derived.by(() => {
		const total = Number(priceTotal);
		const participants = Number(maxParticipants);

		if (!total || !participants || participants <= 0) return 0;

		return total / participants;
	});
	let canCreateEvent = $derived.by(() => {
		const start = date && startTime ? new Date(`${date}T${startTime}`) : null;
		const end = date && endTime ? new Date(`${date}T${endTime}`) : null;
		const participants = Number(maxParticipants);
		const minimum = Number(minParticipants);
		const hasValidStart = Boolean(
			start && !Number.isNaN(start.getTime()) && start.getTime() > Date.now()
		);
		const hasValidEnd = !endTime || Boolean(end && start && end.getTime() > start.getTime());
		const hasValidMinimum =
			!enableMinParticipants ||
			(Number.isInteger(minimum) && minimum >= 1 && minimum <= participants);

		return Boolean(
			organization &&
			title.trim() &&
			(sport !== 'other' || customSport.trim()) &&
			address.trim() &&
			lat !== null &&
			lng !== null &&
			hasValidStart &&
			hasValidEnd &&
			Number.isInteger(participants) &&
			participants >= 2 &&
			participants <= 500 &&
			hasValidMinimum &&
			(paymentMode === 'none' || Number(priceTotal) > 0) &&
			(paymentMode !== 'official' || isVerified) &&
			(!promote || (isVerified && promotionTargetCountry))
		);
	});

	function getPromotionPlanTranslationKey(
		plan: EventPromotionPlan,
		field: 'label' | 'description'
	) {
		const keyByPlan = {
			local: {
				label: 'regional_boost',
				description: 'regional_boost_desc'
			},
			sport: {
				label: 'sport_targeting',
				description: 'sport_targeting_desc'
			},
			featured: {
				label: 'legacy_featured',
				description: 'legacy_featured_desc'
			}
		} satisfies Record<EventPromotionPlan, Record<'label' | 'description', string>>;

		return keyByPlan[plan][field];
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

	function handleVoiceExtracted(fields: VoiceExtractedFields) {
		if (fields.title) title = fields.title;
		if (fields.sport) sport = fields.sport;
		if (fields.customSport) customSport = fields.customSport;
		if (fields.level) level = fields.level;
		if (fields.description) description = fields.description;
		if (fields.location) {
			locationName = fields.location;
			autofillAddress = fields.location;
		}
		if (fields.date) date = fields.date;
		if (fields.time) startTime = fields.time;
		if (fields.maxParticipants) maxParticipants = fields.maxParticipants.toString();
		if (fields.priceTotal !== null && fields.priceTotal !== undefined) {
			priceTotal = fields.priceTotal.toString();
			setEventKind('paid');
		}
	}

	function buildStartDate() {
		if (!date || !startTime) {
			throw new Error(i18n.t('choose_date_start_time_error'));
		}

		const start = new Date(`${date}T${startTime}`);

		if (Number.isNaN(start.getTime())) {
			throw new Error(i18n.t('invalid_event_date_error'));
		}

		if (start <= new Date()) {
			throw new Error(i18n.t('future_date_error'));
		}

		return start;
	}

	function buildEndDate(start: Date) {
		if (!date || !endTime) return undefined;

		const end = new Date(`${date}T${endTime}`);

		if (Number.isNaN(end.getTime())) return undefined;

		if (end <= start) {
			throw new Error(i18n.t('end_after_start_error'));
		}

		return end;
	}

	function getCleanLocationName() {
		const cleanAddress = address.trim();

		if (locationName.trim()) {
			return locationName.trim();
		}

		if (cleanAddress.includes(',')) {
			return cleanAddress.split(',')[0].trim();
		}

		return cleanAddress;
	}

	function validateForm() {
		if (!title.trim()) {
			throw new Error(i18n.t('add_event_title_error'));
		}

		if (!address.trim() || lat === null || lng === null) {
			throw new Error(i18n.t('choose_event_location_error'));
		}

		const participants = Number(maxParticipants);

		if (!Number.isInteger(participants) || participants < 2 || participants > 500) {
			throw new Error(i18n.t('max_participants_range_error'));
		}

		if (enableMinParticipants) {
			const min = Number(minParticipants);
			if (!min || min < 1) {
				throw new Error(i18n.t('min_participants_min_error'));
			}
			if (min > participants) {
				throw new Error(i18n.t('min_greater_than_max_error'));
			}
		}

		if (paymentMode === 'official' && !isVerified) {
			throw new Error(i18n.t('official_paid_verified_error'));
		}

		if (paymentMode !== 'none') {
			const total = Number(priceTotal);

			if (!total || total <= 0) {
				throw new Error(i18n.t('valid_event_price_error'));
			}
		}

		if (sport === 'other' && !customSport.trim()) {
			throw new Error(i18n.t('specify_sport_error'));
		}

		if (promote && !isVerified) {
			throw new Error(i18n.t('promote_verified_error'));
		}
		if (promote && !promotionTargetCountry) {
			throw new Error(i18n.t('choose_campaign_country_error'));
		}
	}

	const formErrors = $derived.by(() => {
		const start = date && startTime ? new Date(`${date}T${startTime}`) : null;
		const end = date && endTime ? new Date(`${date}T${endTime}`) : null;
		const participants = Number(maxParticipants);
		const errors: Record<string, string> = {};

		if (!title.trim()) errors.title = i18n.t('add_event_title_error');
		if (sport === 'other' && !customSport.trim())
			errors.customSport = i18n.t('specify_sport_error');
		if (!address.trim() || lat === null || lng === null) {
			errors.location = i18n.t('choose_event_location_error');
		}
		if (!date || !startTime) errors.start = i18n.t('choose_date_start_time_error');
		else if (!start || Number.isNaN(start.getTime()) || start <= new Date()) {
			errors.start = i18n.t('future_date_error');
		}
		if (endTime && (!end || !start || end.getTime() <= start.getTime())) {
			errors.endTime = i18n.t('end_after_start_error');
		}
		if (!Number.isInteger(participants) || participants < 2 || participants > 500) {
			errors.maxParticipants = i18n.t('max_participants_range_error');
		}
		if (enableMinParticipants) {
			const min = Number(minParticipants);
			if (!min || min < 1) errors.minParticipants = i18n.t('min_participants_min_error');
			else if (min > participants) errors.minParticipants = i18n.t('min_greater_than_max_error');
		}
		if (paymentMode !== 'none' && (!Number(priceTotal) || Number(priceTotal) <= 0)) {
			errors.price = i18n.t('valid_event_price_error');
		}
		if (paymentMode === 'official' && !isVerified) {
			errors.payment = i18n.t('official_paid_verified_error');
		}
		if (promote && !isVerified) errors.promotion = i18n.t('promote_verified_error');
		if (promote && !promotionTargetCountry) {
			errors.promotionTargetCountry = i18n.t('choose_campaign_country_error');
		}

		return errors;
	});

	function hasFieldError(field: string) {
		return submitAttempted && Boolean(formErrors[field]);
	}

	async function handleCreateEvent() {
		const user = auth.currentUser;

		if (!user || !organization) return;

		submitAttempted = true;
		creating = true;
		error = '';

		try {
			validateForm();

			const startAt = buildStartDate();
			const endAt = buildEndDate(startAt);

			const createdEvent = await createSportEvent({
				title: title.trim(),
				description: description.trim(),
				sport,
				customSport: sport === 'other' ? customSport.trim() : undefined,
				level,
				creatorId: user.uid,
				hostType: 'organization',
				organizationId: organization.id,
				locationName: getCleanLocationName(),
				address: address.trim(),
				route: sport === 'running' || sport === 'cycling' || sport === 'hiking' ? route : null,
				lat: lat ?? undefined,
				lng: lng ?? undefined,
				startAt,
				endAt,
				maxParticipants: Number(maxParticipants),
				minParticipants: enableMinParticipants ? Number(minParticipants) : null,
				minParticipantsDeadlineHours: enableMinParticipants
					? Number(minParticipantsDeadlineHours)
					: null,
				visibility,
				priceTotal: paymentMode === 'none' ? undefined : Number(priceTotal),
				currency,
				paymentMode
			});
			if (promote) {
				const { checkoutUrl } = await createEventPromotionCheckout({
					eventId: createdEvent.id,
					budget: Number(promotionBudget) || 15,
					durationDays: Number(promotionDurationDays) || 7,
					plan: promotionPlan,
					targetCity: promotionTargetCity,
					targetCountry: promotionTargetCountry,
					targetSport: promotionTargetSport || null
				});
				window.location.assign(checkoutUrl);
				return;
			}

			await goto(resolve(`/events/${createdEvent.id}`));
		} catch (err) {
			console.error('Create organization event error:', err);
			error = getFriendlyErrorMessage(err, 'Could not create event.');
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
				console.error('Load organization create event page error:', err);
				error = getFriendlyErrorMessage(err, 'Could not load organization.');
			} finally {
				loading = false;
			}
		});

		return unsubscribe;
	});
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-4 sm:px-5 sm:py-8">
	{#if loading}
		<section
			class="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
		>
			<p class="text-slate-500 dark:text-slate-400">{i18n.t('loading_org')}</p>
		</section>
	{:else if error && !organization}
		<section
			class="rounded-[2rem] border border-red-200 bg-red-50 p-8 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
		>
			{error}
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
			<div class="min-w-0">
				<p class="text-sm font-black uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
					{i18n.t('official_event')}
				</p>

				<h1
					class="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-slate-50 sm:text-4xl"
				>
					{i18n.t('create_event')}
				</h1>

				<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
					{i18n.t('hosted_by')} <span class="font-black">{organization.name}</span>
				</p>
			</div>
			<div
				class="flex items-center gap-2 rounded-2xl bg-blue-50/70 p-3 ring-1 ring-blue-100/80 dark:bg-blue-950/30 dark:ring-blue-900/40"
			>
				<VoiceRecordButton onExtracted={handleVoiceExtracted} />
			</div>
		</div>

		<div class="mt-5">
			<CreationTypeSwitch organizationId={organization.id} active="event" />
		</div>

		{#if error}
			<div
				class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
			>
				{error}
			</div>
		{/if}

		<form
			class="mt-6 grid min-w-0 gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-[1fr_0.75fr]"
			onsubmit={(event) => {
				event.preventDefault();
				handleCreateEvent();
			}}
		>
			<div class="min-w-0 space-y-4 sm:space-y-6">
				<section class="hidden">
					<h2 class="text-2xl font-black text-slate-950 dark:text-slate-50">Event type</h2>

					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Choose how this organization event should appear on Rally.
					</p>

					<div class="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3">
						<button
							type="button"
							onclick={() => setEventKind('free')}
							class={`rounded-2xl border p-3 text-left transition sm:rounded-3xl sm:p-5 ${
								eventKind === 'free'
									? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
									: 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-slate-800'
							}`}
						>
							<p class="font-black text-slate-950 dark:text-slate-50">
								{i18n.t('free_official_event')}
							</p>
							<p class="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">
								For open trainings, community activities or brand events.
							</p>
						</button>

						<button
							type="button"
							onclick={() => setEventKind('training')}
							class={`rounded-2xl border p-3 text-left transition sm:rounded-3xl sm:p-5 ${
								eventKind === 'training'
									? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
									: 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-slate-800'
							}`}
						>
							<p class="font-black text-slate-950 dark:text-slate-50">Training session</p>
							<p class="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">
								Best for clubs, gyms or recurring sports sessions.
							</p>
						</button>

						<button
							type="button"
							onclick={() => setEventKind('tournament')}
							class={`rounded-2xl border p-3 text-left transition sm:rounded-3xl sm:p-5 ${
								eventKind === 'tournament'
									? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
									: 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-slate-800'
							}`}
						>
							<p class="font-black text-slate-950 dark:text-slate-50">Tournament</p>
							<p class="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">
								For competitions, challenges or structured events.
							</p>
						</button>

						<button
							type="button"
							onclick={() => isVerified && setEventKind('paid')}
							disabled={!isVerified}
							class={`rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-3xl sm:p-5 ${
								eventKind === 'paid'
									? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
									: 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-slate-800'
							}`}
						>
							<div class="flex items-center justify-between gap-3">
								<p class="font-black text-slate-950 dark:text-slate-50">Official paid event</p>

								{#if !isVerified}
									<span
										class="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400"
									>
										Locked
									</span>
								{/if}
							</div>

							<p class="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">
								Sell paid spots with Rally payment protection. Requires verification.
							</p>
						</button>
					</div>
				</section>

				<section class={cardClass}>
					<h2 class={sectionTitleClass}>{i18n.t('event_details')}</h2>

					<div class="mt-4 space-y-3 sm:mt-5 sm:space-y-4">
						<label class="block">
							<span class={labelClass}
								>{i18n.t('event_title_label')}<span class={requiredAsteriskClass}>*</span></span
							>
							<input
								bind:value={title}
								maxlength={TEXT_LIMITS.eventTitle}
								placeholder={i18n.t('event_title_label')}
								aria-invalid={hasFieldError('title')}
								class={`mt-2 ${inputClass} ${hasFieldError('title') ? invalidInputClass : ''}`}
							/>
							{#if hasFieldError('title')}
								<p class={fieldErrorClass}>{formErrors.title}</p>
							{/if}
						</label>

						<textarea
							bind:value={description}
							maxlength={TEXT_LIMITS.eventDescription}
							rows="3"
							placeholder={i18n.t('organization_event_description_placeholder')}
							class={inputClass}
						></textarea>

						<div class="grid grid-cols-2 items-end gap-3 md:grid-cols-3">
							<div class="flex flex-col gap-2">
								<label for="organization-event-sport" class={labelClass}
									>{i18n.t('sport')}<span class={requiredAsteriskClass}>*</span></label
								>
								<select id="organization-event-sport" bind:value={sport} class={inputClass}>
									{#each sportValues as option (option)}
										<option value={option}>{i18n.t(`sport_${option}`)}</option>
									{/each}
								</select>

								{#if sport === 'other'}
									<input
										bind:value={customSport}
										maxlength={TEXT_LIMITS.customSport}
										placeholder={i18n.t('custom_sport_placeholder')}
										aria-invalid={hasFieldError('customSport')}
										class={`${inputClass} ${hasFieldError('customSport') ? invalidInputClass : ''}`}
									/>
									{#if hasFieldError('customSport')}
										<p class={fieldErrorClass}>{formErrors.customSport}</p>
									{/if}
								{/if}
							</div>

							<div class="flex min-w-0 flex-col gap-2">
								<label for="organization-event-level" class={labelClass}
									>{i18n.t('level_label')}<span class={requiredAsteriskClass}>*</span></label
								>
								<select id="organization-event-level" bind:value={level} class={inputClass}>
									{#each levelValues as option (option)}
										<option value={option}>{i18n.t(option)}</option>
									{/each}
								</select>
							</div>

							<div class="col-span-2 flex min-w-0 flex-col gap-2 md:col-span-1">
								<label for="organization-event-capacity" class={labelClass}
									>{i18n.t('maximum_participants')}<span class={requiredAsteriskClass}>*</span
									></label
								>
								<input
									id="organization-event-capacity"
									bind:value={maxParticipants}
									type="number"
									min="2"
									max="500"
									placeholder="e.g. 20"
									aria-invalid={hasFieldError('maxParticipants')}
									class={`${inputClass} ${hasFieldError('maxParticipants') ? invalidInputClass : ''}`}
								/>
								{#if hasFieldError('maxParticipants')}
									<p class={fieldErrorClass}>{formErrors.maxParticipants}</p>
								{/if}
							</div>

							<div
								class="col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800 sm:p-4"
							>
								<label class="flex cursor-pointer items-center justify-between gap-4">
									<div>
										<p class="text-sm font-bold text-slate-700 dark:text-slate-300">
											{i18n.t('min_participants_label')}
										</p>
										<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
											{i18n.t('min_participants_help')}
										</p>
									</div>

									<input
										type="checkbox"
										bind:checked={enableMinParticipants}
										class="h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 accent-blue-600 dark:border-slate-600"
									/>
								</label>

								{#if enableMinParticipants}
									<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
										<div>
											<label for="org-minParticipants" class={labelClass}>
												{i18n.t('min_participants')}<span class={requiredAsteriskClass}>*</span>
											</label>
											<input
												id="org-minParticipants"
												type="number"
												min="1"
												max={maxParticipants}
												bind:value={minParticipants}
												placeholder="e.g. 4"
												aria-invalid={hasFieldError('minParticipants')}
												class={`mt-2 ${inputClass} ${hasFieldError('minParticipants') ? invalidInputClass : ''}`}
											/>
											{#if hasFieldError('minParticipants')}
												<p class={fieldErrorClass}>{formErrors.minParticipants}</p>
											{/if}
										</div>
										<div>
											<label
												for="org-minParticipantsDeadlineHours"
												class="text-xs font-bold uppercase tracking-wide text-slate-500"
											>
												{i18n.t('cancellation_deadline_hours')}
											</label>
											<select
												id="org-minParticipantsDeadlineHours"
												bind:value={minParticipantsDeadlineHours}
												class={`mt-2 ${inputClass}`}
											>
												<option value={1}>{i18n.t('hours_before_start', { hours: 1 })}</option>
												<option value={2}>{i18n.t('hours_before_start', { hours: 2 })}</option>
												<option value={4}>{i18n.t('hours_before_start', { hours: 4 })}</option>
												<option value={8}
													>{i18n.t('hours_before_start', { hours: 8 })} (Default)</option
												>
												<option value={12}>{i18n.t('hours_before_start', { hours: 12 })}</option>
												<option value={24}>{i18n.t('hours_before_start', { hours: 24 })}</option>
												<option value={48}>{i18n.t('hours_before_start', { hours: 48 })}</option>
											</select>
										</div>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</section>

				<section class={cardClass}>
					<h2 class={sectionTitleClass}>
						{i18n.t('location_schedule')}
					</h2>

					<p class="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">
						{i18n.t('location_picker_sub')}
					</p>

					<div class="mt-4 space-y-4 sm:mt-5 sm:space-y-5">
						<div class="grid grid-cols-2 gap-3">
							<label class="relative min-w-0">
								<span class="text-xs font-bold text-slate-500 dark:text-slate-400 sm:text-sm"
									>{i18n.t('date_label')}<span class={requiredAsteriskClass}>*</span></span
								>
								<input
									bind:value={date}
									type="date"
									min={todayStr}
									aria-invalid={hasFieldError('start')}
									class={`peer mt-2 min-w-0 ${inputClass} ${hasFieldError('start') ? invalidInputClass : ''}`}
								/>
								{#if !date}
									<span
										class="pointer-events-none absolute left-3 top-[2.45rem] text-sm font-semibold text-slate-400 peer-focus:hidden dark:text-slate-500 sm:left-4 sm:top-[2.7rem] sm:text-base"
									>
										{i18n.t('select_date')}
									</span>
								{/if}
								{#if hasFieldError('start')}
									<p class={fieldErrorClass}>{formErrors.start}</p>
								{/if}
							</label>

							<label class="min-w-0">
								<span class="text-xs font-bold text-slate-500 dark:text-slate-400 sm:text-sm"
									>{i18n.t('start_time_label')}<span class={requiredAsteriskClass}>*</span></span
								>
								<TimeSelect
									bind:value={startTime}
									placeholder={i18n.t('choose_time')}
									invalid={hasFieldError('start')}
								/>
							</label>
						</div>

						<div class="grid grid-cols-2 gap-3">
							<label class="min-w-0">
								<span class="text-xs font-bold text-slate-500 dark:text-slate-400 sm:text-sm"
									>{i18n.t('end_time_label')}</span
								>
								<TimeSelect
									bind:value={endTime}
									placeholder={i18n.t('optional')}
									invalid={hasFieldError('endTime')}
								/>
								{#if hasFieldError('endTime')}
									<p class={fieldErrorClass}>{formErrors.endTime}</p>
								{/if}
							</label>
						</div>

						{#if organization?.address}
							<button
								type="button"
								onclick={() => (autofillAddress = organization!.address ?? '')}
								class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="h-4 w-4 shrink-0"
								>
									<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
									<circle cx="12" cy="10" r="3" />
								</svg>
								{i18n.t('use_organization_address')}
							</button>
						{/if}

						<p
							class={`text-sm font-bold ${hasFieldError('location') ? 'text-red-600 dark:text-red-300' : 'text-slate-700 dark:text-slate-300'}`}
						>
							{i18n.t('location_schedule')}<span class={requiredAsteriskClass}>*</span>
						</p>
						<LocationPickerMap bind:lat bind:lng bind:address {autofillAddress} />
						{#if hasFieldError('location')}
							<p class={fieldErrorClass}>{formErrors.location}</p>
						{/if}
						{#if (sport === 'running' || sport === 'cycling' || sport === 'hiking') && lat !== null && lng !== null}
							<div class="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
								<h3 class="font-black text-slate-950 dark:text-slate-50">{i18n.t('route')}</h3>
								<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
									{i18n.t('route_editor_sub')}
								</p>
								<div class="mt-3"><RouteEditorMap bind:points={route} center={{ lat, lng }} /></div>
							</div>
						{/if}
					</div>
				</section>
			</div>

			<aside class="grid min-w-0 gap-3 sm:grid-cols-2 lg:block lg:space-y-6">
				<section class={cardClass}>
					<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-xl">
						{i18n.t('visibility')}
					</h2>

					<p class="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">
						{i18n.t('official_org_events_public')}
					</p>

					<select bind:value={visibility} class={`mt-3 sm:mt-5 ${inputClass}`}>
						<option value="public">{i18n.t('public')}</option>
						<option value="private">{i18n.t('private')}</option>
						<option value="friends">{i18n.t('followers_friends')}</option>
					</select>
				</section>

				<section class={`sm:col-span-2 ${cardClass}`}>
					<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-xl">
						{i18n.t('entry_payment')}
					</h2>

					<div
						class="mt-3 grid grid-cols-1 gap-2 min-[430px]:grid-cols-2 sm:mt-5 sm:gap-3 lg:grid-cols-1"
					>
						<label
							class={`block min-w-0 cursor-pointer rounded-2xl border p-2.5 transition sm:p-4 ${
								paymentMode === 'none'
									? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
									: 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
							}`}
						>
							<input bind:group={paymentMode} type="radio" value="none" class="sr-only" />
							<p
								class="text-sm font-black leading-tight text-slate-950 dark:text-slate-50 sm:text-base"
							>
								{i18n.t('free')}
							</p>
							<p class="mt-1 hidden text-xs text-slate-500 dark:text-slate-400 sm:block sm:text-sm">
								{i18n.t('no_payment_required')}
							</p>
						</label>

						<label
							class={`block min-w-0 rounded-2xl border p-2.5 transition sm:p-4 ${
								!isVerified ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
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
							<div class="flex min-w-0 items-start justify-between gap-3">
								<p
									class="min-w-0 flex-1 text-sm font-black leading-tight text-slate-950 dark:text-slate-50 sm:text-base"
								>
									{i18n.t('official')}
								</p>

								{#if !isVerified}
									<span
										class="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400"
									>
										{i18n.t('locked')}
									</span>
								{/if}
							</div>
							<p class="mt-1 hidden text-xs text-slate-500 dark:text-slate-400 sm:block sm:text-sm">
								{i18n.t('protected_paid_verified')}
							</p>
						</label>
					</div>

					{#if paymentMode !== 'none'}
						<div class="mt-3 sm:mt-5">
							<div
								class="grid grid-cols-[minmax(0,1fr)_5.75rem] gap-2 sm:grid-cols-[minmax(0,1fr)_6.5rem]"
							>
								<input
									bind:value={priceTotal}
									type="number"
									min="1"
									step="0.01"
									placeholder={i18n.t('total_price')}
									aria-invalid={hasFieldError('price')}
									class={`${inputClass} ${hasFieldError('price') ? invalidInputClass : ''}`}
								/>
								<select bind:value={currency} aria-label={i18n.t('currency')} class={inputClass}>
									{#each currencyOptions as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
							</div>
							{#if hasFieldError('price')}
								<p class={fieldErrorClass}>{formErrors.price}</p>
							{/if}
							{#if hasFieldError('payment')}
								<p class={fieldErrorClass}>{formErrors.payment}</p>
							{/if}

							{#if pricePerPerson}
								<p class="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400 sm:text-sm">
									≈ {currencySymbol}{pricePerPerson.toFixed(2)} / {i18n.t('participant')}
								</p>
							{/if}
						</div>
					{/if}
				</section>

				<section class={cardClass} class:col-span-2={promote}>
					<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-xl">
						{i18n.t('promotion')}
					</h2>

					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
						{i18n.t('promotion_visible_explore')}
					</p>

					<label
						class={`mt-3 flex items-center justify-between gap-3 rounded-2xl border p-2.5 sm:mt-5 sm:p-4 ${
							isVerified
								? 'cursor-pointer border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800'
								: 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-800'
						}`}
					>
						<div class="min-w-0">
							<p
								class="text-sm font-black leading-tight text-slate-950 dark:text-slate-50 sm:text-base"
							>
								{i18n.t('promote_event')}
							</p>
							<p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 sm:text-sm">
								{isVerified
									? i18n.t('boost_event_explore')
									: i18n.t('requires_verified_organization')}
							</p>
						</div>

						<input bind:checked={promote} type="checkbox" disabled={!isVerified} class="sr-only" />
						<span
							class={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
								promote
									? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-950'
									: 'border-slate-300 bg-white text-transparent dark:border-slate-600 dark:bg-slate-900'
							}`}
							aria-hidden="true"
						>
							{#if promote}
								<svg viewBox="0 0 20 20" fill="none" class="h-4 w-4">
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

					{#if promote}
						<div class="mt-4 space-y-3">
							<div>
								<p class="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
									{i18n.t('promotion_type')}
								</p>

								<div class="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
									{#each promotionPlanOptions as [plan, config] (plan)}
										<button
											type="button"
											onclick={() => (promotionPlan = plan)}
											class={`rounded-2xl border p-2.5 text-left transition sm:p-3 ${
												promotionPlan === plan
													? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
													: 'border-slate-200 bg-slate-50 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-500'
											}`}
										>
											<div class="flex items-start justify-between gap-3">
												<div>
													<p
														class="text-sm font-black text-slate-950 dark:text-slate-50 sm:text-base"
													>
														{i18n.t(getPromotionPlanTranslationKey(plan, 'label'))}
													</p>
													<p
														class="mt-1 hidden text-xs text-slate-500 dark:text-slate-400 sm:block"
													>
														{i18n.t(getPromotionPlanTranslationKey(plan, 'description'))}
													</p>
												</div>

												<span
													class="shrink-0 text-xs font-black text-blue-600 dark:text-blue-400 sm:text-sm"
												>
													€{config.cpm} CPM
												</span>
											</div>
										</button>
									{/each}
								</div>
							</div>

							<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
								<label class="block">
									<span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500"
										>{i18n.t('target_country')}</span
									>
									<select
										bind:value={promotionTargetCountry}
										aria-invalid={hasFieldError('promotionTargetCountry')}
										class={`${inputClass} ${hasFieldError('promotionTargetCountry') ? invalidInputClass : ''}`}
									>
										{#each PROMOTION_COUNTRIES as country (country.code)}
											<option value={country.code}>{country.label}</option>
										{/each}
									</select>
									{#if hasFieldError('promotionTargetCountry')}
										<span class={fieldErrorClass}>{formErrors.promotionTargetCountry}</span>
									{/if}
								</label>

								<label class="block">
									<span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
										{i18n.t('budget_label')}
									</span>
									<input
										bind:value={promotionBudget}
										type="number"
										min="1"
										step="1"
										placeholder="e.g. 25"
										class={inputClass}
									/>
								</label>

								<label class="block">
									<span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
										{i18n.t('duration_days_label')}
									</span>
									<select bind:value={promotionDurationDays} class={inputClass}>
										<option value="3">3 {i18n.t('days')}</option>
										<option value="7">7 {i18n.t('days')}</option>
										<option value="14">14 {i18n.t('days')}</option>
										<option value="30">30 {i18n.t('days')}</option>
									</select>
								</label>

								<label class="block">
									<span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
										{i18n.t('target_city_region')}
									</span>
									<input
										bind:value={promotionTargetCity}
										placeholder={i18n.t('optional_example')}
										class={inputClass}
									/>
								</label>

								<label class="block">
									<span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
										{i18n.t('target_sport')}
									</span>
									<select bind:value={promotionTargetSport} class={inputClass}>
										<option value="">{i18n.t('same_as_event_sport')}</option>
										{#each sportValues as option (option)}
											<option value={option}>{i18n.t(`sport_${option}`)}</option>
										{/each}
									</select>
									<span class="mt-1 hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
										{i18n.t('sport_boost_event_sport_help')}
									</span>
								</label>
							</div>
						</div>
					{/if}
				</section>

				<section
					class="rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-[2rem] sm:p-6"
				>
					<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-xl">
						{i18n.t('trust_safety')}
					</h2>

					<div
						class="mt-2 space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400 sm:mt-4 sm:space-y-3 sm:text-sm"
					>
						<p>{i18n.t('official_paid_verified_only')}</p>

						<p class="hidden sm:block">{i18n.t('promoted_real_activities')}</p>

						{#if paymentMode === 'official'}
							<div
								class="rounded-2xl bg-blue-50 p-3 font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300 sm:p-4"
							>
								{i18n.t('protected_by_rally')}
							</div>
						{/if}
					</div>
				</section>

				<button
					type="submit"
					disabled={creating}
					aria-disabled={!canCreateEvent}
					class="w-full rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-2 sm:py-4 sm:text-base"
				>
					{creating ? i18n.t('creating_event') : i18n.t('create_organization_event')}
				</button>
			</aside>
		</form>
	{/if}
</main>
