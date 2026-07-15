<!--src/routes/organizations/[id]/manage/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth } from '$lib/firebase';
	import { authService } from '$lib/services/auth.service';
	import type { EventStatus, Organization, OrganizationType, SportEvent, UserProfile } from '$lib/schema';
	import LocationPickerMap from '$lib/components/maps/LocationPickerMap.svelte';
	import NavIcon from '$lib/components/NavIcon.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import {
		assertCanManageOrganization,
		getOrganizationFollowerIds,
		requestOrganizationVerification,
		updateOrganizationProfile
	} from '$lib/services/organization.service';
	import { ensureUserProfile } from '$lib/services/user.service';
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
	import {
		canFastSwitchDeviceAccount,
		getDeviceAccounts,
		rememberDeviceAccount,
		removeDeviceAccount,
		type DeviceAccount
	} from '$lib/services/device-accounts.service';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { getCurrencySymbol } from '$lib/utils/format.utils';

	let organization = $state<Organization | null>(null);
	let organizationEvents = $state<SportEvent[]>([]);
	let followerIds = $state<string[]>([]);

	let loading = $state(true);
	let saving = $state(false);
	let requesting = $state(false);
	let uploadingLogo = $state(false);
	let uploadingCover = $state(false);
	let uploadingGallery = $state(false);
	let logoutLoading = $state(false);
	let showSettingsModal = $state(false);
	let notificationsEnabled = $state(true);
	let selectedLanguage = $state('en');
	let showAccountSwitcher = $state(false);
	let deviceAccounts = $state<DeviceAccount[]>([]);
	let switchingAccountId = $state<string | null>(null);
	let activeManageTab = $state<'overview' | 'events' | 'insights'>('overview');
	let eventFilter = $state<'upcoming' | 'promoted' | 'past' | 'all'>('upcoming');

	let error = $state('');
	let success = $state('');

	let logoInput = $state<HTMLInputElement | null>(null);
	let coverInput = $state<HTMLInputElement | null>(null);
	let galleryInput = $state<HTMLInputElement | null>(null);

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
	let displayedFollowersCount = $derived(
		Math.max(organization?.followersCount ?? 0, followerIds.length)
	);
	let filteredManageEvents = $derived.by(() => {
		if (eventFilter === 'promoted') return activePromotedEvents;
		if (eventFilter === 'past') return pastEvents;
		if (eventFilter === 'all') return organizationEvents;
		return upcomingEvents;
	});
	let totalEventCapacity = $derived(
		organizationEvents.reduce((sum, event) => sum + getMaxEventCapacity(event), 0)
	);
	let totalEventParticipants = $derived(
		organizationEvents.reduce((sum, event) => sum + (event.participantIds?.length ?? 0), 0)
	);
	let averageFillRate = $derived(
		totalEventCapacity > 0 ? (totalEventParticipants / totalEventCapacity) * 100 : 0
	);

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

	function getTimestampMillis(value: unknown) {
		try {
			const timestamp = value as { toDate?: () => Date; toMillis?: () => number };
			if (timestamp?.toMillis) return timestamp.toMillis();
			if (timestamp?.toDate) return timestamp.toDate().getTime();
		} catch {
			// fall through
		}

		return 0;
	}

	function getEffectiveStatus(event: SportEvent): EventStatus {
		if (event.status === 'cancelled') return 'cancelled';
		if (event.status === 'finished') return 'finished';
		const finishAtMs = getTimestampMillis(event.endAt) || getTimestampMillis(event.startAt);
		if (finishAtMs && finishAtMs < Date.now()) return 'finished';
		return event.status;
	}

	function getStatusLabel(event: SportEvent) {
		const status = getEffectiveStatus(event);
		if (status === 'cancelled') return 'Cancelled';
		if (status === 'finished') return 'Finished';
		if (status === 'full') return 'Full';
		if (event.eventKind === 'tournament') return 'Tournament';
		return 'Upcoming';
	}

	function getStatusClasses(event: SportEvent) {
		const status = getEffectiveStatus(event);
		if (status === 'cancelled') return 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300';
		if (status === 'finished') return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300';
		if (isPromotionActive(event)) return 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300';
		return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
	}

	function formatEventDate(dateValue: unknown) {
		try {
			const timestamp = dateValue as { toDate?: () => Date };
			if (!timestamp?.toDate) return 'Date not set';
			return timestamp.toDate().toLocaleString('en-GB', {
				weekday: 'short',
				day: '2-digit',
				month: 'short',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return 'Date not set';
		}
	}

	function formatEventCapacity(event: SportEvent) {
		return `${event.participantIds?.length ?? 0}/${getMaxEventCapacity(event)}`;
	}

	function getMaxEventCapacity(event: SportEvent) {
		return event.eventKind === 'tournament'
			? (event.maxTournamentEntries ?? event.maxParticipants ?? 0)
			: (event.maxParticipants ?? 0);
	}

	function formatSportLabel(sport: string) {
		return sport.charAt(0).toUpperCase() + sport.slice(1);
	}

	function getManageEventImage(event: SportEvent) {
		return event.groupPhotoURL || `/event-backgrounds/${event.sport || 'other'}.png`;
	}

	function formatEventLocation(event: SportEvent) {
		return event.location?.name || event.location?.address || 'Location not set';
	}

	function formatManageEventPrice(event: SportEvent) {
		const price = event.pricePerPerson ?? event.priceTotal;
		if (!price) return 'Free';
		return `${getCurrencySymbol(event.currency)}${price.toFixed(2)}`;
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

			const [loadedEvents, loadedFollowerIds] = await Promise.all([
				getEventsCreatedByOrganization(loadedOrganization.id),
				getOrganizationFollowerIds(loadedOrganization.id)
			]);

			organization = loadedOrganization;
			organizationEvents = loadedEvents;
			followerIds = loadedFollowerIds;
			resetForm(loadedOrganization);
		} catch (err) {
			console.error('Organization manage error:', err);
			error = getFriendlyErrorMessage(err, 'Could not load organization.');
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
			error = getFriendlyErrorMessage(err, 'Could not save organization.');
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
			error = getFriendlyErrorMessage(err, 'Could not upload logo.');
		} finally {
			uploadingLogo = false;
			input.value = '';
		}
	}

	async function handleCoverUpload(event: Event) {
		const user = auth.currentUser;
		if (!user || !organization) return;

		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploadingCover = true;
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
				logoURL: organization.logoURL ?? null,
				logoPath: organization.logoPath ?? null,
				coverPhotoURL: uploaded.url,
				coverPhotoPath: uploaded.path
			});

			success = 'Organization cover updated.';
			await loadManagePage(user.uid);
		} catch (err) {
			console.error('Upload organization cover error:', err);
			error = getFriendlyErrorMessage(err, 'Could not upload cover image.');
		} finally {
			uploadingCover = false;
			input.value = '';
		}
	}

	async function handleGalleryUpload(event: Event) {
		const user = auth.currentUser;
		if (!user || !organization) return;
		const currentOrganization = organization;

		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		if (files.length === 0) return;

		uploadingGallery = true;
		error = '';
		success = '';

		try {
			const uploads = await Promise.all(
				files.slice(0, 6).map((file) =>
					uploadOrganizationLogo({
						organizationId: currentOrganization.id,
						userId: user.uid,
						file
					})
				)
			);

			await updateOrganizationProfile({
				organizationId: currentOrganization.id,
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
				logoURL: currentOrganization.logoURL ?? null,
				logoPath: currentOrganization.logoPath ?? null,
				galleryPhotoURLs: [...(currentOrganization.galleryPhotoURLs ?? []), ...uploads.map((item) => item.url)].slice(
					0,
					12
				),
				galleryPhotoPaths: [...(currentOrganization.galleryPhotoPaths ?? []), ...uploads.map((item) => item.path)].slice(
					0,
					12
				)
			});

			success = 'Gallery updated.';
			await loadManagePage(user.uid);
		} catch (err) {
			console.error('Upload organization gallery error:', err);
			error = getFriendlyErrorMessage(err, 'Could not upload gallery images.');
		} finally {
			uploadingGallery = false;
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
			error = getFriendlyErrorMessage(err, 'Could not request verification.');
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

	function getCurrentOrganizationDeviceProfile(): UserProfile | null {
		if (!organization || !auth.currentUser) return null;

		return {
			id: auth.currentUser.uid,
			email: auth.currentUser.email ?? contactEmail,
			displayName: organization.name,
			photoURL: organization.logoURL ?? auth.currentUser.photoURL ?? null,
			rallyTag: organization.handle,
			accountType: 'organization',
			activeOrganizationId: organization.id,
			sports: [],
			createdAt: organization.createdAt,
			updatedAt: organization.updatedAt
		};
	}

	async function handleAddAccount() {
		logoutLoading = true;

		try {
			const currentDeviceProfile = getCurrentOrganizationDeviceProfile();
			if (currentDeviceProfile) {
				deviceAccounts = rememberDeviceAccount(currentDeviceProfile, auth.currentUser);
			}
			showSettingsModal = false;
			showAccountSwitcher = false;
			await authService.logout();
			await goto(resolve('/login?returnTo=/dashboard'));
		} finally {
			logoutLoading = false;
		}
	}

	async function handleSwitchAccount(account: DeviceAccount) {
		if (account.id === auth.currentUser?.uid) {
			showAccountSwitcher = false;
			return;
		}

		logoutLoading = true;
		switchingAccountId = account.id;

		try {
			const currentDeviceProfile = getCurrentOrganizationDeviceProfile();
			if (currentDeviceProfile) {
				deviceAccounts = rememberDeviceAccount(currentDeviceProfile, auth.currentUser);
			}

			if (canFastSwitchDeviceAccount(account)) {
				const switchedUser = await authService.signInWithGoogle();

				if (switchedUser.uid !== account.id) {
					deviceAccounts = getDeviceAccounts();
					error = `You signed in as ${switchedUser.email ?? 'another account'}. Choose ${account.email} to switch to ${account.displayName}.`;
					return;
				}

				const switchedProfile = await ensureUserProfile(switchedUser);
				deviceAccounts = rememberDeviceAccount(switchedProfile, switchedUser);
				showSettingsModal = false;
				showAccountSwitcher = false;
				await goto(getPostSwitchHref(deviceAccounts.find((item) => item.id === switchedUser.uid) ?? account));
				return;
			}

			await authService.logout();
			showSettingsModal = false;
			showAccountSwitcher = false;
			await goto(
				resolve(
					`/login?returnTo=${encodeURIComponent(getPostSwitchHref(account))}&email=${encodeURIComponent(account.email)}`
				)
			);
		} catch (err) {
			console.error('Switch account error:', err);
			error = getFriendlyErrorMessage(err, 'Could not switch account.');
		} finally {
			logoutLoading = false;
			switchingAccountId = null;
		}
	}

	function handleForgetDeviceAccount(accountId: string) {
		deviceAccounts = removeDeviceAccount(accountId);
	}

	function getPostSwitchHref(account?: DeviceAccount | null) {
		if (account?.accountType === 'organization' && account.activeOrganizationId) {
			return `/organizations/${account.activeOrganizationId}/manage`;
		}
		return '/dashboard';
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
			error = getFriendlyErrorMessage(err, 'Could not stop promotion.');
		} finally {
			stoppingPromotionId = '';
		}
	}

	onMount(() => {
		deviceAccounts = getDeviceAccounts();
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

<main class="mx-auto max-w-6xl px-4 pb-28 pt-4 sm:px-5 sm:py-8">
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
		<section class="relative flex flex-col gap-3 pr-12 md:flex-row md:items-center md:justify-between md:pr-0">
			<div class="flex min-w-0 items-center gap-3 sm:gap-4">
				<div
					class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[1.35rem] bg-slate-100 text-xl font-black text-blue-600 shadow-sm dark:bg-slate-800 dark:text-blue-300 sm:h-20 sm:w-20 sm:rounded-[1.8rem] sm:text-3xl"
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
							class="truncate text-2xl font-black tracking-tight text-slate-950 dark:text-slate-50 sm:text-4xl"
						>
							{organization.name}
						</h1>

						<span class={`rounded-full px-3 py-1 text-xs font-black ${verificationClasses()}`}>
							{verificationLabel()}
						</span>
					</div>

					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:mt-2 sm:text-sm">
						Organization dashboard · manage official events, verification and promotions.
					</p>
				</div>
			</div>

			<a
				href={resolve('/settings')}
				class="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800 dark:hover:bg-slate-800 md:hidden"
				aria-label="Open settings"
			>
				<NavIcon name="settings" class="h-5 w-5" />
			</a>
		</section>

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

		<section class="mt-5 rounded-[1.5rem] bg-white p-1 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 sm:mt-7">
			<div class="grid grid-cols-3 gap-1">
				{#each ['overview', 'events', 'insights'] as tab}
					<button
						type="button"
						onclick={() => (activeManageTab = tab as 'overview' | 'events' | 'insights')}
						class={`rounded-[1.2rem] px-3 py-3 text-sm font-black capitalize transition ${
							activeManageTab === tab
								? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
								: 'text-slate-500 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50'
						}`}
					>
						{tab}
					</button>
				{/each}
			</div>
		</section>

		{#if activeManageTab === 'overview'}
			<section class="mt-5 grid grid-cols-4 divide-x divide-slate-200 rounded-[1.4rem] border-y border-slate-200 bg-white/55 py-3 text-center shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/45 sm:py-4">
				<div class="px-2">
					<svg class="mx-auto h-5 w-5 text-slate-500 dark:text-slate-400 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16 19a4 4 0 0 0-8 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 19a3.5 3.5 0 0 0-5-3.15M2 19a3.5 3.5 0 0 1 5-3.15" /></svg>
					<p class="mt-1 text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl">{displayedFollowersCount}</p>
					<p class="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400 sm:text-xs">Followers</p>
				</div>
				<div class="px-2">
					<svg class="mx-auto h-5 w-5 text-slate-500 dark:text-slate-400 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /></svg>
					<p class="mt-1 text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl">{upcomingEvents.length}</p>
					<p class="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400 sm:text-xs">Upcoming</p>
				</div>
				<div class="px-2">
					<svg class="mx-auto h-5 w-5 text-slate-500 dark:text-slate-400 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4 13h3l9 4V7l-9 4H4v2Zm3 0 1 6h3" /></svg>
					<p class="mt-1 text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl">{activePromotedEvents.length}</p>
					<p class="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400 sm:text-xs">Promoted</p>
				</div>
				<div class="px-2">
					<svg class="mx-auto h-5 w-5 text-slate-500 dark:text-slate-400 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 19V9M12 19V5M19 19v-7" /></svg>
					<p class="mt-1 text-lg font-black text-slate-950 dark:text-slate-50 sm:text-2xl">{organizationEvents.length}</p>
					<p class="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400 sm:text-xs">Total</p>
				</div>
			</section>

			<section class="mt-6">
				<div class="flex items-end justify-between gap-3">
					<div>
						<p class="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Quick actions</p>
						<h2 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50">Manage your club</h2>
					</div>
				</div>

				<div class="mt-4 grid grid-cols-5 gap-2 sm:gap-3">
					<a href={resolve(`/organizations/${organization.id}/events/create`)} class="rounded-[1.1rem] bg-white p-2 text-center shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:ring-blue-200 dark:bg-slate-900 dark:ring-slate-800 sm:rounded-[1.4rem] sm:p-4">
						<span class="mx-auto grid h-8 w-8 place-items-center rounded-xl bg-slate-50 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 sm:h-10 sm:w-10 sm:rounded-2xl"><svg class="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path stroke-linecap="round" d="M12 5v14M5 12h14" /></svg></span>
						<span class="mt-2 block truncate text-[0.65rem] font-black text-slate-950 dark:text-slate-50 sm:mt-3 sm:text-xs">Event</span>
					</a>
					<a href={resolve(`/organizations/${organization.id}/tournaments/create`)} class="rounded-[1.1rem] bg-white p-2 text-center shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:ring-orange-200 dark:bg-slate-900 dark:ring-slate-800 sm:rounded-[1.4rem] sm:p-4">
						<span class="mx-auto grid h-8 w-8 place-items-center rounded-xl bg-slate-50 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 sm:h-10 sm:w-10 sm:rounded-2xl"><svg class="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Zm0 2H4a3 3 0 0 0 3 3m10-3h3a3 3 0 0 1-3 3" /></svg></span>
						<span class="mt-2 block truncate text-[0.65rem] font-black text-slate-950 dark:text-slate-50 sm:mt-3 sm:text-xs">Tourney</span>
					</a>
					<a href={resolve(`/organizations/${organization.id}`)} class="rounded-[1.1rem] bg-white p-2 text-center shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:ring-blue-200 dark:bg-slate-900 dark:ring-slate-800 sm:rounded-[1.4rem] sm:p-4">
						<span class="mx-auto grid h-8 w-8 place-items-center rounded-xl bg-slate-50 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 sm:h-10 sm:w-10 sm:rounded-2xl"><svg class="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM5 21a7 7 0 0 1 14 0" /></svg></span>
						<span class="mt-2 block truncate text-[0.65rem] font-black text-slate-950 dark:text-slate-50 sm:mt-3 sm:text-xs">Profile</span>
					</a>
					<a href={resolve('/messages')} class="rounded-[1.1rem] bg-white p-2 text-center shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:ring-blue-200 dark:bg-slate-900 dark:ring-slate-800 sm:rounded-[1.4rem] sm:p-4">
						<span class="mx-auto grid h-8 w-8 place-items-center rounded-xl bg-slate-50 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 sm:h-10 sm:w-10 sm:rounded-2xl"><svg class="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6a8 8 0 1 1 18-5Z" /></svg></span>
						<span class="mt-2 block truncate text-[0.65rem] font-black text-slate-950 dark:text-slate-50 sm:mt-3 sm:text-xs">Inbox</span>
					</a>
					<button type="button" onclick={() => (activeManageTab = 'events')} class="rounded-[1.1rem] bg-white p-2 text-center shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:ring-orange-200 dark:bg-slate-900 dark:ring-slate-800 sm:rounded-[1.4rem] sm:p-4">
						<span class="mx-auto grid h-8 w-8 place-items-center rounded-xl bg-slate-50 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 sm:h-10 sm:w-10 sm:rounded-2xl"><svg class="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4 13h3l9 4V7l-9 4H4v2Zm3 0 1 6h3" /></svg></span>
						<span class="mt-2 block truncate text-[0.65rem] font-black text-slate-950 dark:text-slate-50 sm:mt-3 sm:text-xs">Promote</span>
					</button>
				</div>
			</section>

			<section class="mt-5 grid gap-3 sm:mt-6 lg:grid-cols-[1fr_0.85fr]">
				<div class="rounded-[1.35rem] bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 sm:rounded-[1.7rem] sm:p-5">
					<div class="flex items-center justify-between gap-3">
						<div class="min-w-0">
							<p class="text-[0.65rem] font-black uppercase tracking-[0.14em] text-orange-600 sm:text-xs sm:tracking-[0.18em]">Promotions</p>
							<h2 class="mt-0.5 truncate text-base font-black text-slate-950 dark:text-slate-50 sm:mt-1 sm:text-xl">Advertising snapshot</h2>
						</div>
						<button type="button" onclick={() => (activeManageTab = 'insights')} class="shrink-0 text-xs font-black text-blue-600 dark:text-blue-400 sm:text-sm">Details</button>
					</div>
					<div class="mt-3 grid grid-cols-4 gap-2 sm:mt-4">
						<div>
							<p class="text-base font-black text-slate-950 dark:text-slate-50 sm:text-lg">{totalPromotionViews}</p>
							<p class="text-[0.65rem] font-bold text-slate-500 dark:text-slate-400 sm:text-xs">Views</p>
						</div>
						<div>
							<p class="text-base font-black text-slate-950 dark:text-slate-50 sm:text-lg">{totalPromotionClicks}</p>
							<p class="text-[0.65rem] font-bold text-slate-500 dark:text-slate-400 sm:text-xs">Clicks</p>
						</div>
						<div>
							<p class="text-base font-black text-slate-950 dark:text-slate-50 sm:text-lg">{averageCtr.toFixed(1)}%</p>
							<p class="text-[0.65rem] font-bold text-slate-500 dark:text-slate-400 sm:text-xs">CTR</p>
						</div>
						<div>
							<p class="text-base font-black text-slate-950 dark:text-slate-50 sm:text-lg">€{totalEstimatedSpend.toFixed(2)}</p>
							<p class="text-[0.65rem] font-bold text-slate-500 dark:text-slate-400 sm:text-xs">Spend</p>
						</div>
					</div>
				</div>

				<div class="rounded-[1.35rem] bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 sm:rounded-[1.7rem] sm:p-5">
					<p class="text-[0.65rem] font-black uppercase tracking-[0.14em] text-blue-600 sm:text-xs sm:tracking-[0.18em]">Verification</p>
					<h2 class="mt-0.5 text-base font-black text-slate-950 dark:text-slate-50 sm:mt-1 sm:text-xl">{verificationLabel()}</h2>
					<p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400 sm:mt-2 sm:text-sm">
						Verified organizations can create official paid events and promote events.
					</p>
					<button type="button" onclick={() => (activeManageTab = 'insights')} class="mt-3 w-full rounded-2xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 sm:mt-4 sm:py-3 sm:text-sm">
						Manage verification
					</button>
				</div>
			</section>

			<section class="mt-6">
				<div class="mb-3 flex items-center justify-between gap-3">
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Upcoming events</h2>
					<button type="button" onclick={() => (activeManageTab = 'events')} class="text-sm font-black text-blue-600 dark:text-blue-400">View all</button>
				</div>
				{#if upcomingEvents.length === 0}
					<div class="rounded-[1.5rem] border border-dashed border-slate-300 bg-white p-6 text-center text-sm font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
						No upcoming events yet.
					</div>
				{:else}
					<div class="grid gap-3 lg:grid-cols-2">
						{#each upcomingEvents.slice(0, 2) as event (event.id)}
							<a
								href={resolve(`/events/${event.id}`)}
								class="group flex gap-2.5 overflow-hidden rounded-[1.15rem] bg-white p-2 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:ring-blue-200 dark:bg-slate-900 dark:ring-slate-800 sm:gap-4 sm:rounded-[1.45rem] sm:p-3.5"
							>
								<img src={getManageEventImage(event)} alt="" class="h-20 w-20 shrink-0 rounded-[0.95rem] object-cover sm:h-24 sm:w-36 sm:rounded-2xl lg:w-44" />
								<div class="min-w-0 flex-1">
									<div class="flex items-start justify-between gap-2 sm:gap-3">
										<div class="min-w-0">
											<p class="truncate text-sm font-black text-slate-950 dark:text-slate-50 sm:text-base">{event.title}</p>
											<p class="mt-0.5 truncate text-[0.7rem] font-bold text-slate-500 dark:text-slate-400 sm:mt-1 sm:text-xs">
												{formatSportLabel(event.sport)} · {formatEventLocation(event)}
											</p>
										</div>
										<div class="shrink-0 text-right">
											<p class="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-600 dark:bg-blue-950 dark:text-blue-300">{formatEventCapacity(event)}</p>
											<p class="text-[0.68rem] font-bold text-slate-400">players</p>
										</div>
									</div>
									<div class="mt-1.5 flex items-center gap-1.5 overflow-hidden sm:gap-2">
										<span class={`shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-black sm:px-2.5 sm:py-1 sm:text-[0.68rem] ${getStatusClasses(event)}`}>{getStatusLabel(event)}</span>
										{#if isPromotionActive(event)}
											<span class="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[0.62rem] font-black text-orange-700 dark:bg-orange-950 dark:text-orange-300 sm:px-2.5 sm:py-1 sm:text-[0.68rem]">Promoted</span>
										{/if}
									</div>
									<div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.68rem] font-bold text-slate-500 dark:text-slate-400 sm:mt-2 sm:text-xs">
										<span class="inline-flex min-w-0 items-center gap-1.5 truncate">
											<svg viewBox="0 0 24 24" class="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true">
												<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
											</svg>
											<span class="truncate">{formatEventDate(event.startAt)}</span>
										</span>
										<span>{formatManageEventPrice(event)}</span>
									</div>
								</div>
							</a>
						{/each}
					</div>
				{/if}
			</section>
		{:else if activeManageTab === 'events'}
			<section id="upcoming-events" class="mt-6 scroll-mt-8">
				<div class="mb-3 flex items-center justify-between gap-3 sm:mb-4">
					<div class="min-w-0">
						<h2 class="text-xl font-black text-slate-950 dark:text-slate-50 sm:text-2xl">Events</h2>
						<p class="mt-0.5 truncate text-xs font-bold text-slate-500 dark:text-slate-400 sm:mt-1 sm:text-sm">Promote and manage organization events.</p>
					</div>
					<a href={resolve(`/organizations/${organization.id}/events/create`)} class="shrink-0 rounded-2xl bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 sm:px-5 sm:py-3 sm:text-sm">
						<span class="sm:hidden">Create</span>
						<span class="hidden sm:inline">Create event</span>
					</a>
				</div>
				<div class="mb-4 flex gap-2 overflow-x-auto pb-3 pt-0.5">
					{#each [
						{ key: 'upcoming', label: 'Upcoming', count: upcomingEvents.length },
						{ key: 'promoted', label: 'Promoted', count: activePromotedEvents.length },
						{ key: 'past', label: 'Past', count: pastEvents.length },
						{ key: 'all', label: 'All', count: organizationEvents.length }
					] as filter}
						<button
							type="button"
							onclick={() => (eventFilter = filter.key as 'upcoming' | 'promoted' | 'past' | 'all')}
							class={`shrink-0 rounded-full px-3.5 py-2 text-xs font-black transition sm:px-4 sm:text-sm ${
								eventFilter === filter.key
									? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
									: 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-blue-600 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'
							}`}
						>
							{filter.label} <span class="opacity-70">{filter.count}</span>
						</button>
					{/each}
				</div>
				{#if filteredManageEvents.length === 0}
					<div class="rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
						No events match this filter.
					</div>
				{:else}
					<div class="grid gap-3">
						{#each filteredManageEvents as event (event.id)}
							<a
								href={resolve(`/events/${event.id}`)}
							class="group flex gap-2.5 overflow-hidden rounded-[1.15rem] bg-white p-2 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:ring-blue-200 dark:bg-slate-900 dark:ring-slate-800 sm:gap-4 sm:rounded-[1.45rem] sm:p-3.5"
							>
								<img src={getManageEventImage(event)} alt="" class="h-20 w-20 shrink-0 rounded-[0.95rem] object-cover sm:h-24 sm:w-36 sm:rounded-2xl lg:w-44" />
								<div class="min-w-0 flex-1">
									<div class="flex items-start justify-between gap-2 sm:gap-3">
										<div class="min-w-0">
											<p class="truncate text-sm font-black text-slate-950 dark:text-slate-50 sm:text-base">{event.title}</p>
											<p class="mt-0.5 truncate text-[0.7rem] font-bold text-slate-500 dark:text-slate-400 sm:mt-1 sm:text-xs">
												{formatSportLabel(event.sport)} · {formatEventLocation(event)}
											</p>
										</div>
										<div class="shrink-0 text-right">
											<p class="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-600 dark:bg-blue-950 dark:text-blue-300">{formatEventCapacity(event)}</p>
											<p class="text-[0.68rem] font-bold text-slate-400">players</p>
										</div>
									</div>
									<div class="mt-1.5 flex items-center gap-1.5 overflow-hidden sm:gap-2">
										<span class={`shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-black sm:px-2.5 sm:py-1 sm:text-[0.68rem] ${getStatusClasses(event)}`}>{getStatusLabel(event)}</span>
										{#if isPromotionActive(event)}
											<span class="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[0.62rem] font-black text-orange-700 dark:bg-orange-950 dark:text-orange-300 sm:px-2.5 sm:py-1 sm:text-[0.68rem]">Promoted</span>
										{/if}
									</div>
									<div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.68rem] font-bold text-slate-500 dark:text-slate-400 sm:mt-2 sm:text-xs">
										<span class="inline-flex min-w-0 items-center gap-1.5 truncate">
											<svg viewBox="0 0 24 24" class="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true">
												<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
											</svg>
											<span class="truncate">{formatEventDate(event.startAt)}</span>
										</span>
										<span>{formatManageEventPrice(event)}</span>
									</div>
								</div>
							</a>
						{/each}
					</div>
				{/if}
			</section>
		{:else}
			<section class="mt-5 rounded-[1.35rem] border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:mt-6 sm:rounded-[2rem] sm:p-6">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="text-[0.65rem] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400 sm:text-sm sm:tracking-[0.25em]">Insights</p>
						<h2 class="mt-0.5 truncate text-lg font-black text-slate-950 dark:text-slate-50 sm:mt-1 sm:text-2xl">Performance dashboard</h2>
						<p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400 sm:mt-1 sm:text-sm">Promotion reach, event capacity and activity.</p>
					</div>
					<a href="#upcoming-events" onclick={() => (activeManageTab = 'events')} class="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:px-5 sm:py-3 sm:text-base">
						<span class="sm:hidden">Promote</span>
						<span class="hidden sm:inline">Choose event to promote</span>
					</a>
				</div>

				<div class="mt-3 grid grid-cols-2 gap-2 sm:mt-6 md:grid-cols-4 md:gap-4">
					<div class="rounded-[1.1rem] bg-slate-50 p-2.5 dark:bg-slate-800 sm:rounded-2xl sm:p-4">
						<p class="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">Active</p>
						<p class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50 sm:mt-2 sm:text-2xl">{activePromotedEvents.length}</p>
					</div>
					<div class="rounded-[1.1rem] bg-slate-50 p-2.5 dark:bg-slate-800 sm:rounded-2xl sm:p-4">
						<p class="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">Views</p>
						<p class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50 sm:mt-2 sm:text-2xl">{totalPromotionViews}</p>
					</div>
					<div class="rounded-[1.1rem] bg-slate-50 p-2.5 dark:bg-slate-800 sm:rounded-2xl sm:p-4">
						<p class="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">Clicks</p>
						<p class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50 sm:mt-2 sm:text-2xl">{totalPromotionClicks}</p>
					</div>
					<div class="rounded-[1.1rem] bg-slate-50 p-2.5 dark:bg-slate-800 sm:rounded-2xl sm:p-4">
						<p class="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">CTR / Spend</p>
						<p class="mt-1 text-base font-black text-slate-950 dark:text-slate-50 sm:mt-2 sm:text-lg">{averageCtr.toFixed(1)}% · €{totalEstimatedSpend.toFixed(2)}</p>
					</div>
				</div>

				<div class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
					<div class="rounded-[1.1rem] bg-slate-50 p-2.5 dark:bg-slate-800 sm:rounded-2xl sm:p-4">
						<p class="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">Total events</p>
						<p class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50 sm:mt-2 sm:text-2xl">{organizationEvents.length}</p>
					</div>
					<div class="rounded-[1.1rem] bg-slate-50 p-2.5 dark:bg-slate-800 sm:rounded-2xl sm:p-4">
						<p class="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">Participants</p>
						<p class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50 sm:mt-2 sm:text-2xl">{totalEventParticipants}</p>
					</div>
					<div class="rounded-[1.1rem] bg-slate-50 p-2.5 dark:bg-slate-800 sm:rounded-2xl sm:p-4">
						<p class="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">Avg fill</p>
						<p class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50 sm:mt-2 sm:text-2xl">{averageFillRate.toFixed(0)}%</p>
					</div>
					<div class="rounded-[1.1rem] bg-slate-50 p-2.5 dark:bg-slate-800 sm:rounded-2xl sm:p-4">
						<p class="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">Past events</p>
						<p class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50 sm:mt-2 sm:text-2xl">{pastEvents.length}</p>
					</div>
				</div>

				{#if activePromotedEvents.length}
					<div class="mt-4 space-y-2.5 sm:mt-6 sm:space-y-3">
						{#each activePromotedEvents as promotedEvent (promotedEvent.id)}
							{@const stats = calculatePromotionStats(promotedEvent)}
							<div class="rounded-[1.1rem] border border-blue-100 bg-white p-3 dark:border-blue-900 dark:bg-slate-900 sm:rounded-2xl sm:p-4">
								<div class="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
									<div class="min-w-0">
										<p class="truncate text-sm font-black text-slate-950 dark:text-slate-50 sm:text-base">{promotedEvent.title}</p>
										<p class="mt-1 truncate text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
											{promotedEvent.promotionPlan ?? 'boost'} · {stats.remainingImpressions ?? 0} impressions left
										</p>
									</div>
									<div class="flex flex-wrap gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 sm:text-sm">
										<span>{stats.views} views</span>
										<span>{stats.clicks} clicks</span>
										<span>{stats.ctr.toFixed(1)}% CTR</span>
									</div>
									<button type="button" onclick={() => handleStopPromotion(promotedEvent.id)} disabled={stoppingPromotionId === promotedEvent.id} class="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-red-900 dark:hover:bg-red-950 dark:hover:text-red-300 sm:px-4 sm:text-sm">
										{stoppingPromotionId === promotedEvent.id ? 'Stopping...' : 'Stop'}
									</button>
								</div>
								<div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
									<div class="h-full rounded-full bg-blue-600 transition-all" style={`width: ${stats.progress}%`}></div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="mt-6 rounded-2xl border border-dashed border-blue-200 bg-white/70 p-5 text-sm font-bold text-slate-500 dark:border-blue-900 dark:bg-slate-900/70 dark:text-slate-400">
						No active promoted events yet. Open one of your organization events and choose Promote event.
					</div>
				{/if}
			</section>

			<section class="mt-6 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-[2rem] sm:p-6">
				<h2 class="text-xl font-black text-slate-950 dark:text-slate-50 sm:text-2xl">Verification centre</h2>
				<p class="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:mt-2 sm:text-sm">
					Confirm the legal identity of the organization. A public venue is optional and only applies to organizations that own or operate a physical sports space.
				</p>
				<div class="mt-4 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800 sm:mt-5 sm:p-4">
					<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Current status</p>
					<p class="mt-1 font-black text-slate-950 dark:text-slate-50 sm:mt-2">{verificationLabel()}</p>
				</div>
				{#if organization.verificationStatus !== 'verified'}
					<div class="mt-4 space-y-3 sm:mt-5">
						<div class="rounded-2xl border border-slate-200 p-3 text-xs dark:border-slate-700 sm:p-4 sm:text-sm">
							<p class="font-black text-slate-950 dark:text-slate-50">Required identity details</p>
							<p class="mt-1 text-slate-500 dark:text-slate-400">Legal name, NIF and contact email. Website and notes can help the review.</p>
						</div>
						<input bind:value={legalName} class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50" placeholder="Legal name" />
						<label class="flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
							<input type="checkbox" bind:checked={hasPublicVenue} class="mt-1 h-4 w-4" />
							<span>
								<span class="block font-black text-slate-950 dark:text-slate-50">This organization operates a public venue</span>
								<span class="mt-1 block text-xs text-slate-500 dark:text-slate-400 sm:text-sm">For courts, gyms, stadiums or other places customers can visit.</span>
							</span>
						</label>
						{#if hasPublicVenue}
							<input bind:value={publicVenueName} class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50" placeholder="Public venue name" />
							<LocationPickerMap bind:lat={publicVenueLat} bind:lng={publicVenueLng} bind:address={publicVenueAddress} autofillAddress={address} />
							<input bind:value={googleMapsURL} class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50" placeholder="Google Maps link (optional evidence)" />
						{/if}
						<textarea bind:value={verificationNote} rows="3" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50" placeholder="Notes for verification"></textarea>
						<button type="button" onclick={requestVerification} disabled={requesting || organization.verificationStatus === 'pending'} class="w-full rounded-2xl bg-slate-950 px-5 py-3 font-black text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
							{requesting ? 'Sending...' : organization.verificationStatus === 'pending' ? 'Review pending' : 'Request identity verification'}
						</button>
					</div>
				{:else}
					<div class="mt-5 rounded-2xl bg-blue-50 p-4 text-sm font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
						This organization can create official paid events and promote events.
					</div>
				{/if}
			</section>
		{/if}

		{#if showSettingsModal}
			<dialog
				open
				class="fixed inset-0 z-[120] m-0 flex h-full w-full max-w-none items-end justify-center border-0 bg-slate-950/60 px-0 backdrop-blur-sm sm:items-center sm:px-5"
				onclick={(event) => {
					if (event.target === event.currentTarget) {
						showSettingsModal = false;
						showAccountSwitcher = false;
					}
				}}
				aria-labelledby="organization-settings-title"
			>
				<div
					class="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl dark:bg-slate-900 sm:rounded-[2rem] sm:p-6"
				>
					<div class="flex items-start justify-between gap-4">
						<div>
							<h2
								id="organization-settings-title"
								class="text-2xl font-black text-slate-950 dark:text-slate-50"
							>
								Settings
							</h2>
							<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
								Notifications, appearance, language and account.
							</p>
						</div>

						<button
							type="button"
							onclick={() => {
								showSettingsModal = false;
								showAccountSwitcher = false;
							}}
							class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
							aria-label="Close settings"
						>
							×
						</button>
					</div>

					<div class="mt-6 space-y-5">
						<section>
							<p class="mb-2 text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
								App
							</p>

							<div
								class="divide-y divide-slate-200 overflow-hidden rounded-3xl bg-slate-50 dark:divide-slate-700 dark:bg-slate-800"
							>
								<div class="flex items-center justify-between gap-4 p-4">
									<div>
										<p class="font-black text-slate-950 dark:text-slate-50">Notifications</p>
										<p class="text-xs text-slate-500 dark:text-slate-400">
											Event invites, messages and organization updates.
										</p>
									</div>
									<button
										type="button"
										onclick={() => (notificationsEnabled = !notificationsEnabled)}
										class={`relative h-7 w-12 rounded-full transition ${notificationsEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
										aria-label="Toggle notifications"
									>
										<span
											class={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${notificationsEnabled ? 'left-6' : 'left-1'}`}
										></span>
									</button>
								</div>

								<div class="flex items-center justify-between gap-4 p-4">
									<div>
										<p class="font-black text-slate-950 dark:text-slate-50">Appearance</p>
										<p class="text-xs text-slate-500 dark:text-slate-400">
											Switch light or dark mode.
										</p>
									</div>
									<ThemeToggle />
								</div>

								<label class="flex items-center justify-between gap-4 p-4">
									<div>
										<p class="font-black text-slate-950 dark:text-slate-50">Language</p>
										<p class="text-xs text-slate-500 dark:text-slate-400">App language.</p>
									</div>
									<select
										bind:value={selectedLanguage}
										class="rounded-2xl border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
									>
										<option value="en">English</option>
										<option value="pt">Português</option>
									</select>
								</label>
							</div>
						</section>

						<section>
							<p class="mb-2 text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
								Organization
							</p>

							<div
								class="divide-y divide-slate-200 overflow-hidden rounded-3xl bg-slate-50 dark:divide-slate-700 dark:bg-slate-800"
							>
								<a
									href="#upcoming-events"
									onclick={() => (showSettingsModal = false)}
									class="flex items-center justify-between gap-4 p-4 transition hover:bg-slate-100 dark:hover:bg-slate-700"
								>
									<span>
										<span class="block font-black text-slate-950 dark:text-slate-50">
											Promote events
										</span>
										<span class="block text-xs text-slate-500 dark:text-slate-400">
											Choose an event to boost.
										</span>
									</span>
									<span class="text-slate-300">›</span>
								</a>
							</div>
						</section>

						<section>
							<div class="mb-2 flex items-center justify-between gap-3">
								<p class="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
									Account
								</p>
								{#if showAccountSwitcher}
									<button
										type="button"
										onclick={() => (showAccountSwitcher = false)}
										class="text-xs font-black text-blue-600 dark:text-blue-400"
									>
										Back
									</button>
								{/if}
							</div>

							{#if showAccountSwitcher}
								<div class="overflow-hidden rounded-3xl bg-slate-50 dark:bg-slate-800">
									<div class="divide-y divide-slate-200 dark:divide-slate-700">
										{#each deviceAccounts as account (account.id)}
											<div class="flex items-center gap-3 p-4">
												<button
													type="button"
													onclick={() => handleSwitchAccount(account)}
													disabled={logoutLoading}
													class="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
												>
													<UserAvatar
														photoURL={account.photoURL}
														displayName={account.displayName}
														email={account.email}
														size="md"
													/>
													<div class="min-w-0 flex-1">
														<div class="flex min-w-0 items-center gap-2">
															<p class="truncate font-black text-slate-950 dark:text-slate-50">
																{account.displayName}
															</p>
															{#if account.accountType === 'organization'}
																<span class="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[0.65rem] font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">
																	Org
																</span>
															{/if}
														</div>
														<p class="truncate text-xs text-slate-500 dark:text-slate-400">
															{account.rallyTag ? `@${account.rallyTag}` : account.email}
														</p>
														{#if account.id !== auth.currentUser?.uid}
															<p class="mt-0.5 text-[0.68rem] font-bold text-slate-400 dark:text-slate-500">
																{#if switchingAccountId === account.id}
																	Switching...
																{:else if canFastSwitchDeviceAccount(account)}
																	Quick switch with Google
																{:else}
																	Password required
																{/if}
															</p>
														{/if}
													</div>
												</button>

												{#if account.id === auth.currentUser?.uid}
													<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">
														✓
													</span>
												{:else}
													<button
														type="button"
														onclick={() => handleForgetDeviceAccount(account.id)}
														class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-red-500 dark:hover:bg-slate-900"
														aria-label="Forget account on this device"
													>
														×
													</button>
												{/if}
											</div>
										{/each}
									</div>

									<button
										type="button"
										onclick={handleAddAccount}
										disabled={logoutLoading}
										class="flex w-full items-center gap-3 border-t border-slate-200 p-4 text-left transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-700"
									>
										<span class="flex h-11 w-11 items-center justify-center rounded-full bg-white text-2xl font-light text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
											+
										</span>
										<span>
											<span class="block font-black text-slate-950 dark:text-slate-50">
												Add another account
											</span>
											<span class="block text-xs text-slate-500 dark:text-slate-400">
												It will be saved on this device.
											</span>
										</span>
									</button>

									<div class="px-4 pb-4 pt-1">
										<p class="text-[0.7rem] leading-relaxed text-slate-400 dark:text-slate-500">
											Google accounts can quick switch. Email/password accounts still require the
											password for security.
										</p>
									</div>
								</div>
							{:else}
								<div class="overflow-hidden rounded-3xl bg-slate-50 dark:bg-slate-800">
									<div class="flex items-center gap-3 p-4">
										<UserAvatar
											photoURL={organization.logoURL ?? auth.currentUser?.photoURL ?? null}
											displayName={organization.name}
											email={contactEmail}
											size="md"
										/>
										<div class="min-w-0 flex-1">
											<p class="truncate font-black text-slate-950 dark:text-slate-50">
												{organization.name}
											</p>
											<p class="truncate text-xs text-slate-500 dark:text-slate-400">
												{contactEmail}
											</p>
										</div>
									</div>

									<div class="grid grid-cols-2 gap-2 p-3 pt-0">
										<button
											type="button"
											onclick={() => (showAccountSwitcher = true)}
											class="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-900 shadow-sm transition hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-700"
										>
											Switch
										</button>

										<button
											type="button"
											onclick={handleLogout}
											disabled={logoutLoading}
											class="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-950 dark:hover:bg-slate-200"
										>
											{logoutLoading ? '...' : 'Log out'}
										</button>
									</div>
								</div>
							{/if}
						</section>
					</div>
				</div>
			</dialog>
		{/if}
	{/if}
</main>
