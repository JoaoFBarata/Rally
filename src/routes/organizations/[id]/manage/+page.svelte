<!--src/routes/organizations/[id]/manage/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth } from '$lib/firebase';
	import { authService } from '$lib/services/auth.service';
	import type { Organization, OrganizationType, SportEvent, UserProfile } from '$lib/schema';
	import EventCard from '$lib/components/EventCard.svelte';
	import LocationPickerMap from '$lib/components/maps/LocationPickerMap.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
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
	import {
		canFastSwitchDeviceAccount,
		getDeviceAccounts,
		rememberDeviceAccount,
		removeDeviceAccount,
		type DeviceAccount
	} from '$lib/services/device-accounts.service';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';

	let organization = $state<Organization | null>(null);
	let organizationEvents = $state<SportEvent[]>([]);

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
				await authService.signInWithGoogle();
				deviceAccounts = getDeviceAccounts();
				showSettingsModal = false;
				showAccountSwitcher = false;
				await goto(getPostSwitchHref(account));
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
		<section class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
				class="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800 dark:hover:bg-slate-800 md:hidden"
				aria-label="Open settings"
			>
				⚙
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

		<section class="mt-4 grid max-w-2xl grid-cols-3 divide-x divide-slate-200 border-y border-slate-200 py-3 text-center dark:divide-slate-800 dark:border-slate-800 sm:mt-6 sm:py-4">
			<div>
				<p class="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">Followers</p>
				<p class="mt-0.5 text-xl font-black text-slate-950 dark:text-slate-50 sm:mt-1 sm:text-2xl">
					{organization.followersCount ?? 0}
				</p>
			</div>

			<div>
				<p class="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">Upcoming</p>
				<p class="mt-0.5 text-xl font-black text-slate-950 dark:text-slate-50 sm:mt-1 sm:text-2xl">
					{upcomingEvents.length}
				</p>
			</div>

			<div>
				<p class="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">Promoted</p>
				<p class="mt-0.5 text-xl font-black text-slate-950 dark:text-slate-50 sm:mt-1 sm:text-2xl">
					{activePromotedEvents.length}
				</p>
			</div>
		</section>

		<section class="mt-5 sm:mt-7">
			<div class="flex flex-col gap-3 sm:gap-5">
				<div>
					<p class="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400 sm:text-sm sm:tracking-[0.25em]">
						Quick actions
					</p>

					<h2 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50 sm:text-2xl">
						Create and manage activities
					</h2>

					<p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400 sm:mt-1 sm:text-sm">
						Start a regular event, create a tournament, or open messages from players.
					</p>
				</div>

				<div class="grid grid-cols-3 gap-2 sm:gap-3">
					<a
						href={resolve(`/organizations/${organization.id}/events/create`)}
						class="rounded-[1.1rem] bg-blue-600 p-3 text-center text-white shadow-sm shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 sm:rounded-[1.4rem] sm:p-4 sm:text-left"
					>
						<span class="block text-xl sm:text-2xl">＋</span>
						<span class="mt-1 block text-xs font-black sm:mt-3 sm:text-base">Event</span>
						<span class="mt-1 hidden text-xs font-bold text-blue-100 sm:block">Open games, runs and sessions</span>
					</a>

					<a
						href={resolve(`/organizations/${organization.id}/tournaments/create`)}
						class="rounded-[1.1rem] bg-slate-950 p-3 text-center text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 sm:rounded-[1.4rem] sm:p-4 sm:text-left"
					>
						<span class="block text-xl sm:text-2xl">🏆</span>
						<span class="mt-1 block text-xs font-black sm:mt-3 sm:text-base">Tournament</span>
						<span class="mt-1 hidden text-xs font-bold text-slate-300 dark:text-slate-500 sm:block">Brackets, teams and winners</span>
					</a>

					<a
						href={resolve('/messages')}
						class="rounded-[1.1rem] border border-slate-200 bg-slate-50 p-3 text-center text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:rounded-[1.4rem] sm:p-4 sm:text-left"
					>
						<span class="block text-xl sm:text-2xl">💬</span>
						<span class="mt-1 block text-xs font-black sm:mt-3 sm:text-base">Inbox</span>
						<span class="mt-1 hidden text-xs font-bold text-slate-500 dark:text-slate-400 sm:block">Reply to users and teams</span>
					</a>
				</div>
			</div>
		</section>

		<section
			class="mt-6 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:mt-8 sm:rounded-[2rem] sm:p-6 sm:shadow-xl sm:shadow-slate-200/70"
		>
			<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<p
						class="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400 sm:text-sm sm:tracking-[0.25em]"
					>
						Promotions
					</p>

					<h2 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50 sm:text-2xl">
						Advertising dashboard
					</h2>

					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
						Track promoted events, impressions, clicks and estimated spend.
					</p>
				</div>

				<a
					href="#upcoming-events"
					class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:px-5 sm:py-3 sm:text-base"
				>
					Choose event to promote
				</a>
			</div>

			<div class="mt-4 grid grid-cols-4 gap-2 sm:mt-6 md:gap-4">
				<div class="rounded-2xl bg-slate-50 p-2.5 dark:bg-slate-800 sm:bg-white sm:p-4 sm:dark:bg-slate-900">
					<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Active</p>
					<p class="mt-1 text-lg font-black text-slate-950 dark:text-slate-50 sm:mt-2 sm:text-2xl">
						{activePromotedEvents.length}
					</p>
				</div>

				<div class="rounded-2xl bg-slate-50 p-2.5 dark:bg-slate-800 sm:bg-white sm:p-4 sm:dark:bg-slate-900">
					<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Views</p>
					<p class="mt-1 text-lg font-black text-slate-950 dark:text-slate-50 sm:mt-2 sm:text-2xl">
						{totalPromotionViews}
					</p>
				</div>

				<div class="rounded-2xl bg-slate-50 p-2.5 dark:bg-slate-800 sm:bg-white sm:p-4 sm:dark:bg-slate-900">
					<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Clicks</p>
					<p class="mt-1 text-lg font-black text-slate-950 dark:text-slate-50 sm:mt-2 sm:text-2xl">
						{totalPromotionClicks}
					</p>
				</div>

				<div class="rounded-2xl bg-slate-50 p-2.5 dark:bg-slate-800 sm:bg-white sm:p-4 sm:dark:bg-slate-900">
					<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">CTR / Spend</p>
					<p class="mt-1 text-xs font-black text-slate-950 dark:text-slate-50 sm:mt-2 sm:text-lg">
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

		<div class="mt-6 grid gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-[0.9fr_1.1fr]">
			<section
				class="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-[2rem] sm:p-6 sm:shadow-xl sm:shadow-slate-200/70"
			>
				<div class="flex items-start justify-between gap-4">
					<div>
						<h2 class="text-xl font-black text-slate-950 dark:text-slate-50 sm:text-2xl">
							Organization profile
						</h2>
						<p class="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
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
							class="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:px-4 sm:py-3 sm:text-sm"
						>
							{uploadingLogo ? 'Uploading...' : 'Change logo'}
						</button>
					</div>
				</div>

				<div class="mt-4 space-y-3 sm:mt-6 sm:space-y-4">
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
				class="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-[2rem] sm:p-6 sm:shadow-xl sm:shadow-slate-200/70"
			>
				<h2 class="text-xl font-black text-slate-950 dark:text-slate-50 sm:text-2xl">Verification centre</h2>

				<p class="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:mt-2 sm:text-sm">
					Confirm the legal identity of the organization. A public venue is optional and only
					applies to organizations that own or operate a physical sports space.
				</p>

				<div class="mt-4 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800 sm:mt-5 sm:p-4">
					<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Current status</p>
					<p class="mt-1 font-black text-slate-950 dark:text-slate-50 sm:mt-2">
						{verificationLabel()}
					</p>
				</div>

				{#if organization.verificationStatus !== 'verified'}
					<div class="mt-4 space-y-3 sm:mt-5">
						<div class="rounded-2xl border border-slate-200 p-3 text-xs dark:border-slate-700 sm:p-4 sm:text-sm">
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
								<span class="mt-1 block text-xs text-slate-500 dark:text-slate-400 sm:text-sm"
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

		<section id="upcoming-events" class="mt-6 scroll-mt-8 sm:mt-8">
			<div class="mb-3 flex items-center justify-between sm:mb-5">
				<h2 class="text-xl font-black text-slate-950 dark:text-slate-50 sm:text-2xl">
					Upcoming organization events
				</h2>

				<a
					href={resolve(`/organizations/${organization.id}/events/create`)}
					class="rounded-2xl bg-blue-600 px-4 py-2 text-xs font-black text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 sm:px-5 sm:py-3 sm:text-sm sm:shadow-lg"
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
				<div class="grid gap-2.5 sm:gap-4 lg:grid-cols-2">
					{#each upcomingEvents as event (event.id)}
						<EventCard {event} />
					{/each}
				</div>
			{/if}
		</section>

		{#if pastEvents.length}
			<section class="mt-6 sm:mt-8">
				<h2 class="mb-3 text-xl font-black text-slate-950 dark:text-slate-50 sm:mb-5 sm:text-2xl">
					Past / cancelled events
				</h2>

				<div class="grid gap-2.5 sm:gap-4 lg:grid-cols-2">
					{#each pastEvents as event (event.id)}
						<EventCard {event} />
					{/each}
				</div>
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
