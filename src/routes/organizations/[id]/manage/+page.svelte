<!--src/routes/organizations/[id]/manage/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth } from '$lib/firebase';
	import { authService } from '$lib/services/auth.service';
	import type { Organization, OrganizationType, SportEvent } from '$lib/schema';
	import EventCard from '$lib/components/EventCard.svelte';
	import LocationPickerMap from '$lib/components/maps/LocationPickerMap.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import {
		assertCanManageOrganization,
		requestOrganizationVerification,
		updateOrganizationProfile
	} from '$lib/services/organization.service';
	import {
		calculatePromotionStats,
		getEventsCreatedByOrganization,
		getUpcomingEvents,
		isPromotionActive,
		stopEventPromotion
	} from '$lib/services/event.service';
	import { uploadOrganizationLogo } from '$lib/services/storage.service';
	import {
		subscribeToEventCatalogChanges,
		subscribeToOrganizationChanges
	} from '$lib/services/realtime.service';

	let organization = $state<Organization | null>(null);
	let organizationEvents = $state<SportEvent[]>([]);

	let loading = $state(true);
	let saving = $state(false);
	let requesting = $state(false);
	let uploadingLogo = $state(false);
	let logoutLoading = $state(false);

	let error = $state('');
	let success = $state('');

	let logoInput = $state<HTMLInputElement | null>(null);

	let name = $state('');
	let type = $state<OrganizationType>('company');
	let description = $state('');
	let contactEmail = $state('');
	let phone = $state('');
	let website = $state('');
	let address = $state('');
	let city = $state('');
	let nif = $state('');

	let legalName = $state('');
	let verificationNote = $state('');
	let hasPublicVenue = $state(false);
	let publicVenueName = $state('');
	let publicVenueAddress = $state('');
	let publicVenueLat = $state<number | null>(null);
	let publicVenueLng = $state<number | null>(null);
	let googleMapsURL = $state('');

	let upcomingEvents = $derived(getUpcomingEvents(organizationEvents));
	let pastEvents = $derived(
		organizationEvents.filter((event) => !upcomingEvents.some((item) => item.id === event.id))
	);

	let stoppingPromotionId = $state('');

	let activePromotedEvents = $derived(upcomingEvents.filter((event) => isPromotionActive(event)));

	let totalPromotionViews = $derived(
		organizationEvents.reduce((sum, event) => sum + (event.promotionViews ?? 0), 0)
	);

	let totalPromotionClicks = $derived(
		organizationEvents.reduce((sum, event) => sum + (event.promotionClicks ?? 0), 0)
	);

	let averageCtr = $derived(
		totalPromotionViews > 0 ? (totalPromotionClicks / totalPromotionViews) * 100 : 0
	);

	let totalEstimatedSpend = $derived(
		organizationEvents.reduce((sum, event) => {
			const stats = calculatePromotionStats(event);
			return sum + stats.estimatedSpend;
		}, 0)
	);

	const organizationTypes: { value: OrganizationType; label: string }[] = [
		{ value: 'company', label: 'Company / Brand' },
		{ value: 'sports_club', label: 'Sports club' },
		{ value: 'venue', label: 'Sports venue / Courts' },
		{ value: 'gym', label: 'Gym' },
		{ value: 'event_organizer', label: 'Event organizer' },
		{ value: 'university', label: 'University group' },
		{ value: 'community_group', label: 'Community group' },
		{ value: 'other', label: 'Other' }
	];

	function resetForm(nextOrganization: Organization) {
		name = nextOrganization.name;
		type = nextOrganization.type;
		description = nextOrganization.description ?? '';
		contactEmail = nextOrganization.contactEmail;
		phone = nextOrganization.phone ?? '';
		website = nextOrganization.website ?? '';
		address = nextOrganization.address ?? '';
		city = nextOrganization.city ?? '';
		nif = nextOrganization.nif ?? '';
		legalName = nextOrganization.name;
		hasPublicVenue = nextOrganization.hasPublicVenue ?? false;
		publicVenueName = nextOrganization.publicLocation?.name ?? '';
		publicVenueAddress = nextOrganization.publicLocation?.address ?? '';
		publicVenueLat = nextOrganization.publicLocation?.lat ?? null;
		publicVenueLng = nextOrganization.publicLocation?.lng ?? null;
		googleMapsURL = nextOrganization.publicLocation?.googleMapsURL ?? '';
	}

	function getPublicLocation() {
		if (!hasPublicVenue || publicVenueLat === null || publicVenueLng === null) return null;
		return {
			name: publicVenueName.trim() || name.trim(),
			address: publicVenueAddress.trim(),
			lat: publicVenueLat,
			lng: publicVenueLng,
			googleMapsURL: googleMapsURL.trim(),
			verificationStatus:
				organization?.publicLocation?.verificationStatus ?? ('unverified' as const)
		};
	}

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

	async function loadManagePage(userId: string) {
		loading = true;
		error = '';

		try {
			const organizationIdFromUrl = page.params.id;
			if (!organizationIdFromUrl) {
				throw new Error('Organization ID not found.');
			}

			const loadedOrganization = await assertCanManageOrganization({
				organizationId: organizationIdFromUrl,
				userId
			});

			const loadedEvents = await getEventsCreatedByOrganization(loadedOrganization.id);

			organization = loadedOrganization;
			organizationEvents = loadedEvents;
			resetForm(loadedOrganization);
		} catch (err) {
			console.error('Organization manage error:', err);
			error = err instanceof Error ? err.message : 'Could not load organization.';
		} finally {
			loading = false;
		}
	}

	async function saveProfile() {
		const user = auth.currentUser;
		if (!user || !organization) return;

		saving = true;
		error = '';
		success = '';

		try {
			await updateOrganizationProfile({
				organizationId: organization.id,
				userId: user.uid,
				name,
				type,
				description,
				contactEmail,
				phone,
				website,
				address,
				city,
				nif,
				logoURL: organization.logoURL ?? null,
				logoPath: organization.logoPath ?? null,
				hasPublicVenue,
				publicLocation: getPublicLocation()
			});

			success = 'Organization profile updated.';
			await loadManagePage(user.uid);
		} catch (err) {
			console.error('Save organization error:', err);
			error = err instanceof Error ? err.message : 'Could not save organization.';
		} finally {
			saving = false;
		}
	}

	async function handleLogoUpload(event: Event) {
		const user = auth.currentUser;
		if (!user || !organization) return;

		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		uploadingLogo = true;
		error = '';
		success = '';

		try {
			const uploaded = await uploadOrganizationLogo({
				organizationId: organization.id,
				userId: user.uid,
				file
			});

			await updateOrganizationProfile({
				organizationId: organization.id,
				userId: user.uid,
				name,
				type,
				description,
				contactEmail,
				phone,
				website,
				address,
				city,
				nif,
				logoURL: uploaded.url,
				logoPath: uploaded.path
			});

			success = 'Organization logo updated.';
			await loadManagePage(user.uid);
		} catch (err) {
			console.error('Upload organization logo error:', err);
			error = err instanceof Error ? err.message : 'Could not upload logo.';
		} finally {
			uploadingLogo = false;
			input.value = '';
		}
	}

	async function requestVerification() {
		const user = auth.currentUser;
		if (!user || !organization) return;

		requesting = true;
		error = '';
		success = '';

		try {
			await requestOrganizationVerification({
				organizationId: organization.id,
				userId: user.uid,
				legalName,
				nif,
				website,
				address,
				note: verificationNote,
				hasPublicVenue,
				publicLocation: getPublicLocation()
			});

			success = 'Verification request sent. Your organization is now pending review.';
			await loadManagePage(user.uid);
		} catch (err) {
			console.error('Verification request error:', err);
			error = err instanceof Error ? err.message : 'Could not request verification.';
		} finally {
			requesting = false;
		}
	}

	async function handleLogout() {
		logoutLoading = true;

		try {
			await authService.logout();
			await goto('/');
		} finally {
			logoutLoading = false;
		}
	}

	async function handleStopPromotion(eventId: string) {
		const user = auth.currentUser;
		if (!user) return;

		stoppingPromotionId = eventId;
		error = '';
		success = '';

		try {
			await stopEventPromotion({
				eventId,
				userId: user.uid
			});

			success = 'Promotion stopped.';
			await loadManagePage(user.uid);
		} catch (err) {
			console.error('Stop promotion error:', err);
			error = err instanceof Error ? err.message : 'Could not stop promotion.';
		} finally {
			stoppingPromotionId = '';
		}
	}

	onMount(() => {
		let unsubscribeOrganization = () => {};
		let unsubscribeEvents = () => {};
		const unsubscribe = onAuthStateChanged(auth, async (user) => {
			unsubscribeOrganization();
			unsubscribeEvents();
			if (!user) {
				await goto(resolve('/login'));
				return;
			}

			await loadManagePage(user.uid);
			const organizationId = page.params.id;
			if (organizationId) {
				unsubscribeOrganization = subscribeToOrganizationChanges(
					organizationId,
					() => void loadManagePage(user.uid)
				);
				unsubscribeEvents = subscribeToEventCatalogChanges(() => void loadManagePage(user.uid));
			}
		});

		return () => {
			unsubscribe();
			unsubscribeOrganization();
			unsubscribeEvents();
		};
	});
</script>

<main class="mx-auto max-w-6xl px-4 py-5 sm:px-5 sm:py-8">
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
			<div class="flex min-w-0 items-center gap-3 sm:gap-4">
				<div
					class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-2xl font-black text-blue-600 shadow-lg dark:bg-slate-800 dark:text-blue-300 sm:h-20 sm:w-20 sm:text-3xl"
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
						<h1
							class="truncate text-3xl font-black tracking-tight text-slate-950 dark:text-slate-50 sm:text-4xl"
						>
							{organization.name}
						</h1>

						<span class={`rounded-full px-3 py-1 text-xs font-black ${verificationClasses()}`}>
							{verificationLabel()}
						</span>
					</div>

					<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
						Organization dashboard · manage official events, verification and promotions.
					</p>
				</div>
			</div>

			<div
				class="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3"
			>
				<div class="col-span-2 flex justify-end md:hidden"><ThemeToggle /></div>
				<a
					href={resolve(`/organizations/${organization.id}`)}
					class="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
				>
					Public page
				</a>

				<a
					href={resolve(`/organizations/${organization.id}/events/create`)}
					class="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
				>
					Create event
				</a>

				<a
					href={resolve(`/organizations/${organization.id}/tournaments/create`)}
					class="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
				>
					Create tournament
				</a>

				<button
					type="button"
					onclick={handleLogout}
					class="rounded-2xl border border-red-100 bg-red-50 px-5 py-3 text-sm font-black text-red-700 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
				>
					Log out
				</button>
			</div>
		</div>

		{#if error}
			<div
				class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
			>
				{error}
			</div>
		{/if}

		{#if success}
			<div
				class="mt-6 rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-700 dark:bg-green-950 dark:text-green-300"
			>
				{success}
			</div>
		{/if}

		<section class="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6">
			<div
				class="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-[2rem] sm:p-6"
			>
				<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Followers</p>
				<p class="mt-2 text-3xl font-black text-slate-950 dark:text-slate-50">
					{organization.followersCount ?? 0}
				</p>
			</div>

			<div
				class="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-[2rem] sm:p-6"
			>
				<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Upcoming events</p>
				<p class="mt-2 text-3xl font-black text-slate-950 dark:text-slate-50">
					{upcomingEvents.length}
				</p>
			</div>

			<div
				class="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-[2rem] sm:p-6"
			>
				<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Promoted</p>
				<p class="mt-2 text-3xl font-black text-slate-950 dark:text-slate-50">
					{activePromotedEvents.length}
				</p>
			</div>

			<div
				class="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-[2rem] sm:p-6"
			>
				<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Inbox</p>
				<p class="mt-2 text-sm font-black text-slate-950 dark:text-slate-50">
					Users can contact this organization
				</p>
			</div>
		</section>

		<section
			class="mt-8 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
		>
			<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<h2 class="text-2xl font-black text-slate-950 dark:text-slate-50">Organization inbox</h2>

					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Users can message this organization from the public page or from events hosted by it.
					</p>
				</div>

				<a
					href={resolve('/messages')}
					class="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
				>
					Open messages
				</a>
			</div>
		</section>

		<section
			class="mt-8 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
		>
			<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<p
						class="text-sm font-black uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400"
					>
						Promotions
					</p>

					<h2 class="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50">
						Advertising dashboard
					</h2>

					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						Track promoted events, impressions, clicks and estimated spend.
					</p>
				</div>

				<a
					href="#upcoming-events"
					class="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 font-black text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
				>
					Choose event to promote
				</a>
			</div>

			<div class="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
				<div class="rounded-2xl bg-white p-4 dark:bg-slate-900">
					<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Active</p>
					<p class="mt-2 text-2xl font-black text-slate-950 dark:text-slate-50">
						{activePromotedEvents.length}
					</p>
				</div>

				<div class="rounded-2xl bg-white p-4 dark:bg-slate-900">
					<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Views</p>
					<p class="mt-2 text-2xl font-black text-slate-950 dark:text-slate-50">
						{totalPromotionViews}
					</p>
				</div>

				<div class="rounded-2xl bg-white p-4 dark:bg-slate-900">
					<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Clicks</p>
					<p class="mt-2 text-2xl font-black text-slate-950 dark:text-slate-50">
						{totalPromotionClicks}
					</p>
				</div>

				<div class="rounded-2xl bg-white p-4 dark:bg-slate-900">
					<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">CTR / Spend</p>
					<p class="mt-2 text-lg font-black text-slate-950 dark:text-slate-50">
						{averageCtr.toFixed(1)}% · €{totalEstimatedSpend.toFixed(2)}
					</p>
				</div>
			</div>

			{#if activePromotedEvents.length}
				<div class="mt-6 space-y-3">
					{#each activePromotedEvents as promotedEvent (promotedEvent.id)}
						{@const stats = calculatePromotionStats(promotedEvent)}

						<div
							class="rounded-2xl border border-blue-100 bg-white p-4 dark:border-blue-900 dark:bg-slate-900"
						>
							<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
								<div class="min-w-0">
									<p class="truncate font-black text-slate-950 dark:text-slate-50">
										{promotedEvent.title}
									</p>

									<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
										{promotedEvent.promotionPlan ?? 'boost'} · CPM €{promotedEvent.promotionCpm ??
											0}
										· remaining {stats.remainingImpressions ?? 0} impressions
									</p>
								</div>

								<div
									class="flex flex-wrap gap-2 text-sm font-bold text-slate-500 dark:text-slate-400"
								>
									<span>{stats.views} views</span>
									<span>{stats.clicks} clicks</span>
									<span>{stats.ctr.toFixed(1)}% CTR</span>
								</div>

								<button
									type="button"
									onclick={() => handleStopPromotion(promotedEvent.id)}
									disabled={stoppingPromotionId === promotedEvent.id}
									class="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-red-900 dark:hover:bg-red-950 dark:hover:text-red-300"
								>
									{stoppingPromotionId === promotedEvent.id ? 'Stopping...' : 'Stop'}
								</button>
							</div>
							<div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
								<div
									class="h-full rounded-full bg-blue-600 transition-all"
									style={`width: ${stats.progress}%`}
								></div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div
					class="mt-6 rounded-2xl border border-dashed border-blue-200 bg-white/70 p-5 text-sm font-bold text-slate-500 dark:border-blue-900 dark:bg-slate-900/70 dark:text-slate-400"
				>
					No active promoted events yet. Open one of your organization events and choose Promote
					event.
				</div>
			{/if}
		</section>

		<div class="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
			<section
				class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<div class="flex items-start justify-between gap-4">
					<div>
						<h2 class="text-2xl font-black text-slate-950 dark:text-slate-50">
							Organization profile
						</h2>
						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
							Edit your public organization page.
						</p>
					</div>

					<div class="text-center">
						<input
							bind:this={logoInput}
							type="file"
							accept="image/*"
							class="hidden"
							onchange={handleLogoUpload}
						/>

						<button
							type="button"
							onclick={() => logoInput?.click()}
							disabled={uploadingLogo}
							class="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
						>
							{uploadingLogo ? 'Uploading...' : 'Change logo'}
						</button>
					</div>
				</div>

				<div class="mt-6 space-y-4">
					<input
						bind:value={name}
						class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
						placeholder="Organization name"
					/>

					<select
						bind:value={type}
						class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
					>
						{#each organizationTypes as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>

					<textarea
						bind:value={description}
						rows="4"
						class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
						placeholder="Description"
					></textarea>

					<div class="grid gap-3 sm:grid-cols-2">
						<input
							bind:value={contactEmail}
							class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							placeholder="Contact email"
						/>
						<input
							bind:value={phone}
							class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							placeholder="Phone"
						/>
						<input
							bind:value={website}
							class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							placeholder="Website"
						/>
						<input
							bind:value={city}
							class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							placeholder="City"
						/>
					</div>

					<input
						bind:value={address}
						class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
						placeholder="Address"
					/>

					<input
						bind:value={nif}
						class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
						placeholder="NIF / tax number"
					/>

					<button
						type="button"
						onclick={saveProfile}
						disabled={saving}
						class="w-full rounded-2xl bg-blue-600 px-5 py-3 font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
					>
						{saving ? 'Saving...' : 'Save profile'}
					</button>
				</div>
			</section>

			<section
				class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<h2 class="text-2xl font-black text-slate-950 dark:text-slate-50">Verification centre</h2>

				<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
					Confirm the legal identity of the organization. A public venue is optional and only
					applies to organizations that own or operate a physical sports space.
				</p>

				<div class="mt-5 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
					<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Current status</p>
					<p class="mt-2 font-black text-slate-950 dark:text-slate-50">
						{verificationLabel()}
					</p>
				</div>

				{#if organization.verificationStatus !== 'verified'}
					<div class="mt-5 space-y-3">
						<div class="rounded-2xl border border-slate-200 p-4 text-sm dark:border-slate-700">
							<p class="font-black text-slate-950 dark:text-slate-50">Required identity details</p>
							<p class="mt-1 text-slate-500 dark:text-slate-400">
								Legal name, NIF and contact email. Website and notes can help the review.
							</p>
						</div>
						<input
							bind:value={legalName}
							class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							placeholder="Legal name"
						/>

						<label
							class="flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"
						>
							<input type="checkbox" bind:checked={hasPublicVenue} class="mt-1 h-4 w-4" />
							<span>
								<span class="block font-black text-slate-950 dark:text-slate-50"
									>This organization operates a public venue</span
								>
								<span class="mt-1 block text-sm text-slate-500 dark:text-slate-400"
									>For courts, gyms, stadiums or other places customers can visit.</span
								>
							</span>
						</label>

						{#if hasPublicVenue}
							<input
								bind:value={publicVenueName}
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								placeholder="Public venue name"
							/>
							<LocationPickerMap
								bind:lat={publicVenueLat}
								bind:lng={publicVenueLng}
								bind:address={publicVenueAddress}
								autofillAddress={address}
							/>
							<input
								bind:value={googleMapsURL}
								class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								placeholder="Google Maps link (optional evidence)"
							/>
						{/if}

						<textarea
							bind:value={verificationNote}
							rows="3"
							class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							placeholder="Notes for verification"
						></textarea>

						<button
							type="button"
							onclick={requestVerification}
							disabled={requesting || organization.verificationStatus === 'pending'}
							class="w-full rounded-2xl bg-slate-950 px-5 py-3 font-black text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
						>
							{requesting
								? 'Sending...'
								: organization.verificationStatus === 'pending'
									? 'Review pending'
									: 'Request identity verification'}
						</button>
					</div>
				{:else}
					<div
						class="mt-5 rounded-2xl bg-blue-50 p-4 text-sm font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
					>
						This organization can create official paid events and promote events.
					</div>
				{/if}
			</section>
		</div>

		<section id="upcoming-events" class="mt-8 scroll-mt-8">
			<div class="mb-5 flex items-center justify-between">
				<h2 class="text-2xl font-black text-slate-950 dark:text-slate-50">
					Upcoming organization events
				</h2>

				<a
					href={resolve(`/organizations/${organization.id}/events/create`)}
					class="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
				>
					Create event
				</a>
			</div>

			{#if upcomingEvents.length === 0}
				<div
					class="rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
				>
					No upcoming events yet.
				</div>
			{:else}
				<div class="grid gap-4 lg:grid-cols-2">
					{#each upcomingEvents as event (event.id)}
						<EventCard {event} />
					{/each}
				</div>
			{/if}
		</section>

		{#if pastEvents.length}
			<section class="mt-8">
				<h2 class="mb-5 text-2xl font-black text-slate-950 dark:text-slate-50">
					Past / cancelled events
				</h2>

				<div class="grid gap-4 lg:grid-cols-2">
					{#each pastEvents as event (event.id)}
						<EventCard {event} showImage={false} />
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</main>
