<!--src/routes/organizations/[id]/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import { auth } from '$lib/firebase';
	import type { EventStatus, Organization, OrganizationReview, Sport, SportEvent, UserProfile } from '$lib/schema';
	import {
		followOrganization,
		getOrganizationById,
		getOrganizationFollowerIds,
		getOrganizationReviews,
		getUserOrganizationReview,
		isFollowingOrganization,
		isOrganizationAdmin,
		replyToOrganizationReview,
		submitOrganizationReview,
		unfollowOrganization,
		updateOrganizationProfile
	} from '$lib/services/organization.service';
	import { getFriendsForUser } from '$lib/services/social.service';
	import { uploadOrganizationLogo } from '$lib/services/storage.service';
	import { getEventsCreatedByOrganization, getUpcomingEvents } from '$lib/services/event.service';
	import { getOrCreateOrganizationConversation } from '$lib/services/chat.service';
	import EventCard from '$lib/components/EventCard.svelte';
	import {
		subscribeToEventCatalogChanges,
		subscribeToOrganizationChanges
	} from '$lib/services/realtime.service';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';

	let organization = $state<Organization | null>(null);
	let events = $state<SportEvent[]>([]);
	let currentUserId = $state('');
	let loading = $state(true);
	let actionLoading = $state(false);
	let following = $state(false);
	let canManage = $state(false);
	let error = $state('');
	let messageLoading = $state(false);
	let showOrganizationSettings = $state(false);
	let orgNotificationsEnabled = $state(true);
	let orgDarkModeEnabled = $state(false);
	let reviews = $state<OrganizationReview[]>([]);
	let reviewRating = $state(0);
	let reviewComment = $state('');
	let reviewSubmitting = $state(false);
	let reviewMessage = $state('');
	let coverInput = $state<HTMLInputElement | null>(null);
	let galleryInput = $state<HTMLInputElement | null>(null);
	let uploadingCover = $state(false);
	let uploadingGallery = $state(false);
	let savingSports = $state(false);
	let mutualFollowerFriends = $state<UserProfile[]>([]);
	let followerIds = $state<string[]>([]);
	let showGalleryModal = $state(false);
	let selectedGalleryPhoto = $state('');
	let selectedOrganizationSports = $state<Sport[]>([]);
	let reviewPage = $state(0);
	let replyingToReviewId = $state<string | null>(null);
	let replyComment = $state('');
	let replySubmitting = $state(false);
	let replyMessage = $state('');
	const reviewsPerPage = 4;

	let upcomingEvents = $derived(getUpcomingEvents(events));
	let promotedEvents = $derived(
		upcomingEvents.filter((event) => event.isPromoted && event.promotionStatus === 'active')
	);
	let normalUpcomingEvents = $derived(
		upcomingEvents.filter((event) => !(event.isPromoted && event.promotionStatus === 'active'))
	);
	let featuredEvents = $derived([...promotedEvents, ...normalUpcomingEvents].slice(0, 3));
	let organizationSports = $derived.by(() => {
		if (organization?.sports?.length) return organization.sports.slice(0, 3);
		const sports = new Set<string>();
		for (const event of events) sports.add(event.sport);
		return Array.from(sports).slice(0, 3);
	});
	let extraSportCount = $derived.by(() => {
		const allSports = organization?.sports?.length
			? organization.sports
			: Array.from(new Set(events.map((event) => event.sport)));
		return Math.max(0, allSports.length - 3);
	});
	let playersReached = $derived(
		new Set(events.flatMap((event) => event.participantIds ?? [])).size
	);
	let averageRating = $derived(
		reviews.length > 0
			? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
			: 0
	);
	let displayedFollowersCount = $derived(
		Math.max(organization?.followersCount ?? 0, followerIds.length)
	);
	let reviewPages = $derived(Math.max(1, Math.ceil(reviews.length / reviewsPerPage)));
	let paginatedReviews = $derived(
		reviews.slice(reviewPage * reviewsPerPage, reviewPage * reviewsPerPage + reviewsPerPage)
	);

	let coverPhotoURL = $derived(organization?.coverPhotoURL ?? '');
	let galleryPhotoURLs = $derived((organization?.galleryPhotoURLs ?? []).filter(Boolean));

	const availableSports: Sport[] = [
		'football',
		'padel',
		'basketball',
		'running',
		'gym',
		'tennis',
		'cycling',
		'volleyball',
		'other'
	];

	function formatOrganizationType(type: string) {
		return type.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
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

	function getEventTimestampMillis(value: unknown) {
		try {
			const timestamp = value as { toDate?: () => Date; toMillis?: () => number };
			if (timestamp?.toMillis) return timestamp.toMillis();
			if (timestamp?.toDate) return timestamp.toDate().getTime();
			return 0;
		} catch {
			return 0;
		}
	}

	function getEffectiveStatus(event: SportEvent): EventStatus {
		if (event.status === 'cancelled') return 'cancelled';
		if (event.status === 'finished') return 'finished';
		const finishAtMs = getEventTimestampMillis(event.endAt) || getEventTimestampMillis(event.startAt);
		if (finishAtMs && finishAtMs < Date.now()) return 'finished';
		return event.status;
	}

	function getStatusLabel(event: SportEvent) {
		const status = getEffectiveStatus(event);
		if (status === 'cancelled') return 'Cancelled';
		if (status === 'finished') return 'Finished';
		if (status === 'full') return 'Full';
		if (status === 'open') return 'Open';
		return status;
	}

	function formatDate(dateValue: unknown) {
		try {
			const timestamp = dateValue as { toDate?: () => Date };
			if (!timestamp?.toDate) return 'Date not set';
			return timestamp.toDate().toLocaleString('en-GB', {
				day: '2-digit',
				month: 'short',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return 'Date not set';
		}
	}

	function openGallery(photoURL = '') {
		if (galleryPhotoURLs.length === 0) return;
		selectedGalleryPhoto = photoURL || galleryPhotoURLs[0];
		showGalleryModal = true;
	}

	function closeGallery() {
		showGalleryModal = false;
		selectedGalleryPhoto = '';
	}

	function goToReviewPage(pageNumber: number) {
		reviewPage = Math.min(Math.max(pageNumber, 0), reviewPages - 1);
		replyingToReviewId = null;
		replyComment = '';
		replyMessage = '';
	}

	function getReplyAuthorName() {
		const user = auth.currentUser;
		if (canManage && organization) return organization.name;
		return user?.displayName ?? user?.email?.split('@')[0] ?? 'Rally user';
	}

	function reviewCanReply() {
		return Boolean(auth.currentUser && organization);
	}

	async function submitReviewReply(review: OrganizationReview) {
		const user = auth.currentUser;
		if (!user || !organization || !replyComment.trim()) return;

		replySubmitting = true;
		replyMessage = '';

		try {
			await replyToOrganizationReview({
				reviewId: review.id,
				userId: user.uid,
				authorName: getReplyAuthorName(),
				authorPhotoURL: canManage ? organization.logoURL ?? null : user.photoURL ?? null,
				authorRole: canManage ? 'organization' : 'user',
				comment: replyComment
			});
			reviews = await getOrganizationReviews(organization.id);
			replyingToReviewId = null;
			replyComment = '';
			replyMessage = '';
		} catch (err) {
			console.error('Reply to organization review error:', err);
			const friendlyMessage = getFriendlyErrorMessage(err, 'Could not save your reply.');
			replyMessage =
				friendlyMessage.includes('permission') || friendlyMessage.includes('permiss')
					? 'Reply permissions are not active yet. Deploy the Firestore rules and try again.'
					: friendlyMessage;
		} finally {
			replySubmitting = false;
		}
	}

	function formatShortDate(dateValue: unknown) {
		try {
			const timestamp = dateValue as { toDate?: () => Date };
			if (!timestamp?.toDate) return 'Soon';
			return timestamp.toDate().toLocaleDateString('en-GB', {
				day: '2-digit',
				month: 'short'
			});
		} catch {
			return 'Soon';
		}
	}

	function formatSport(sport: string) {
		return sport.charAt(0).toUpperCase() + sport.slice(1);
	}

	function toggleOrganizationSport(sport: Sport) {
		if (selectedOrganizationSports.includes(sport)) {
			selectedOrganizationSports = selectedOrganizationSports.filter((item) => item !== sport);
		} else {
			selectedOrganizationSports = [...selectedOrganizationSports, sport];
		}
	}

	async function saveOrganizationSports() {
		const user = auth.currentUser;
		if (!user || !organization) return;

		savingSports = true;
		error = '';

		try {
			await updateOrganizationProfile({
				organizationId: organization.id,
				userId: user.uid,
				name: organization.name,
				type: organization.type,
				description: organization.description ?? '',
				contactEmail: organization.contactEmail,
				phone: organization.phone ?? '',
				website: organization.website ?? '',
				address: organization.address ?? '',
				city: organization.city ?? '',
				nif: organization.nif ?? '',
				logoURL: organization.logoURL ?? null,
				logoPath: organization.logoPath ?? null,
				sports: selectedOrganizationSports
			});
			organization = { ...organization, sports: selectedOrganizationSports };
		} catch (err) {
			console.error('Save organization sports error:', err);
			error = getFriendlyErrorMessage(err, 'Could not update organization sports.');
		} finally {
			savingSports = false;
		}
	}

	function formatPrice(event: SportEvent) {
		if (event.entryFeeAmount && event.entryFeeAmount > 0) return `€${event.entryFeeAmount}`;
		if (event.pricePerPerson && event.pricePerPerson > 0) return `€${event.pricePerPerson}`;
		if (event.priceTotal && event.priceTotal > 0) return `€${event.priceTotal}`;
		return 'Free';
	}

	function formatCapacity(event: SportEvent) {
		if (event.eventKind === 'tournament') {
			return `${event.participantIds.length}/${event.maxTournamentEntries ?? event.maxParticipants} entries`;
		}
		return `${event.participantIds.length}/${event.maxParticipants} joined`;
	}

	function getMiniMapUrl(event: SportEvent) {
		const lat = event.location?.lat;
		const lng = event.location?.lng;
		if (!PUBLIC_MAPBOX_ACCESS_TOKEN || typeof lat !== 'number' || typeof lng !== 'number') return '';
		const marker = `pin-s+2563eb(${lng},${lat})`;
		return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${marker}/${lng},${lat},13,0/144x104@2x?access_token=${PUBLIC_MAPBOX_ACCESS_TOKEN}`;
	}

	function getOrganizationLocation() {
		return (
			organization?.publicLocation?.name ||
			organization?.publicLocation?.address ||
			organization?.city ||
			organization?.address ||
			'Location not set'
		);
	}

	function getVenueMapUrl() {
		const lat = organization?.publicLocation?.lat;
		const lng = organization?.publicLocation?.lng;
		if (!PUBLIC_MAPBOX_ACCESS_TOKEN || typeof lat !== 'number' || typeof lng !== 'number') return '';
		const marker = `pin-s+2563eb(${lng},${lat})`;
		return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${marker}/${lng},${lat},14,0/280x120@2x?access_token=${PUBLIC_MAPBOX_ACCESS_TOKEN}`;
	}

	function formatEventDay(dateValue: unknown) {
		try {
			const timestamp = dateValue as { toDate?: () => Date };
			if (!timestamp?.toDate) return 'Soon';
			return timestamp.toDate().toLocaleDateString('en-GB', {
				weekday: 'short',
				month: 'short',
				day: '2-digit'
			});
		} catch {
			return 'Soon';
		}
	}

	async function messageOrganization() {
		const user = auth.currentUser;
		if (!user || !organization) return;
		messageLoading = true;
		error = '';

		try {
			const conversationId = await getOrCreateOrganizationConversation({
				organizationId: organization.id,
				userId: user.uid,
				currentUserId: user.uid
			});
			await goto(resolve(`/messages/${conversationId}`));
		} catch (err) {
			console.error('Message organization error:', err);
			error = getFriendlyErrorMessage(err, 'Could not open organization chat.');
		} finally {
			messageLoading = false;
		}
	}

	function toggleOrganizationNotifications() {
		orgNotificationsEnabled = !orgNotificationsEnabled;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('rally-org-notifications', orgNotificationsEnabled ? 'on' : 'off');
		}
	}

	function toggleOrganizationDarkMode() {
		orgDarkModeEnabled = !orgDarkModeEnabled;
		if (typeof document !== 'undefined') {
			document.documentElement.classList.toggle('dark', orgDarkModeEnabled);
		}
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('theme', orgDarkModeEnabled ? 'dark' : 'light');
		}
	}

	async function loadPage(userId: string) {
		loading = true;
		error = '';

		try {
			const organizationIdFromUrl = page.params.id;
			if (!organizationIdFromUrl) {
				error = 'Organization ID not found.';
				return;
			}

			const loadedOrganization = await getOrganizationById(organizationIdFromUrl);
			if (!loadedOrganization) {
				error = 'Organization not found.';
				return;
			}

			organization = loadedOrganization;
			selectedOrganizationSports = loadedOrganization.sports ?? [];
			canManage = isOrganizationAdmin(loadedOrganization, userId);

			const [
				loadedEvents,
				loadedFollowing,
				loadedReviews,
				ownReview,
				friends,
				loadedFollowerIds
			] = await Promise.all([
				getEventsCreatedByOrganization(loadedOrganization.id),
				isFollowingOrganization({ organizationId: loadedOrganization.id, userId }),
				getOrganizationReviews(loadedOrganization.id),
				getUserOrganizationReview({ organizationId: loadedOrganization.id, userId }),
				getFriendsForUser(userId),
				getOrganizationFollowerIds(loadedOrganization.id)
			]);

			events = loadedEvents;
			following = loadedFollowing;
			reviews = loadedReviews;
			reviewPage = 0;
			reviewRating = ownReview?.rating ?? 0;
			reviewComment = ownReview?.comment ?? '';
			followerIds = loadedFollowerIds;
			const followerIdSet = new Set(loadedFollowerIds);
			mutualFollowerFriends = friends.filter((friend) => followerIdSet.has(friend.id)).slice(0, 5);
		} catch (err) {
			console.error('Organization public page error:', err);
			error = getFriendlyErrorMessage(err, 'Could not load organization.');
		} finally {
			loading = false;
		}
	}

	async function toggleFollow() {
		if (!organization || !currentUserId) return;
		actionLoading = true;
		error = '';

		try {
			if (following) {
				await unfollowOrganization({ organizationId: organization.id, userId: currentUserId });
				following = false;
				followerIds = followerIds.filter((id) => id !== currentUserId);
				organization = {
					...organization,
					followersCount: Math.max((organization.followersCount ?? 1) - 1, 0)
				};
			} else {
				await followOrganization({ organizationId: organization.id, userId: currentUserId });
				following = true;
				followerIds = followerIds.includes(currentUserId)
					? followerIds
					: [...followerIds, currentUserId];
				organization = { ...organization, followersCount: (organization.followersCount ?? 0) + 1 };
			}
		} catch (err) {
			console.error('Follow organization error:', err);
			error = getFriendlyErrorMessage(err, 'Could not update follow status.');
		} finally {
			actionLoading = false;
		}
	}

	async function submitReview() {
		const user = auth.currentUser;
		if (!user || !organization || reviewRating < 1) return;

		reviewSubmitting = true;
		error = '';
		reviewMessage = '';

		try {
			await submitOrganizationReview({
				organizationId: organization.id,
				userId: user.uid,
				rating: reviewRating,
				comment: reviewComment,
				authorName: user.displayName ?? user.email?.split('@')[0] ?? 'Rally user',
				authorPhotoURL: user.photoURL ?? null
			});
			reviews = await getOrganizationReviews(organization.id);
			reviewPage = 0;
			reviewMessage = 'Review saved.';
		} catch (err) {
			console.error('Submit organization review error:', err);
			const friendlyMessage = getFriendlyErrorMessage(err, 'Could not save your review.');
			reviewMessage =
				friendlyMessage.includes('permission') || friendlyMessage.includes('permiss')
					? 'Review permissions are not active yet. Deploy the Firestore rules and try again.'
					: friendlyMessage;
		} finally {
			reviewSubmitting = false;
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

		try {
			const uploaded = await uploadOrganizationLogo({
				organizationId: organization.id,
				userId: user.uid,
				file
			});

			await updateOrganizationProfile({
				organizationId: organization.id,
				userId: user.uid,
				name: organization.name,
				type: organization.type,
				description: organization.description ?? '',
				contactEmail: organization.contactEmail,
				phone: organization.phone ?? '',
				website: organization.website ?? '',
				address: organization.address ?? '',
				city: organization.city ?? '',
				nif: organization.nif ?? '',
				logoURL: organization.logoURL ?? null,
				logoPath: organization.logoPath ?? null,
				coverPhotoURL: uploaded.url,
				coverPhotoPath: uploaded.path
			});

			await loadPage(user.uid);
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
				name: currentOrganization.name,
				type: currentOrganization.type,
				description: currentOrganization.description ?? '',
				contactEmail: currentOrganization.contactEmail,
				phone: currentOrganization.phone ?? '',
				website: currentOrganization.website ?? '',
				address: currentOrganization.address ?? '',
				city: currentOrganization.city ?? '',
				nif: currentOrganization.nif ?? '',
				logoURL: currentOrganization.logoURL ?? null,
				logoPath: currentOrganization.logoPath ?? null,
				galleryPhotoURLs: [
					...(currentOrganization.galleryPhotoURLs ?? []),
					...uploads.map((item) => item.url)
				].slice(0, 12),
				galleryPhotoPaths: [
					...(currentOrganization.galleryPhotoPaths ?? []),
					...uploads.map((item) => item.path)
				].slice(0, 12)
			});

			await loadPage(user.uid);
		} catch (err) {
			console.error('Upload organization gallery error:', err);
			error = getFriendlyErrorMessage(err, 'Could not upload gallery images.');
		} finally {
			uploadingGallery = false;
			input.value = '';
		}
	}

	onMount(() => {
		orgDarkModeEnabled = document.documentElement.classList.contains('dark');
		orgNotificationsEnabled = localStorage.getItem('rally-org-notifications') !== 'off';

		let unsubscribeOrganization = () => {};
		let unsubscribeEvents = () => {};
		const unsubscribe = onAuthStateChanged(auth, async (user) => {
			unsubscribeOrganization();
			unsubscribeEvents();
			if (!user) {
				await goto(resolve('/login'));
				return;
			}

			currentUserId = user.uid;
			await loadPage(user.uid);
			const organizationId = page.params.id;
			if (organizationId) {
				unsubscribeOrganization = subscribeToOrganizationChanges(
					organizationId,
					() => void loadPage(user.uid)
				);
				unsubscribeEvents = subscribeToEventCatalogChanges(() => void loadPage(user.uid));
			}
		});

		return () => {
			unsubscribe();
			unsubscribeOrganization();
			unsubscribeEvents();
		};
	});
</script>

<main class="mx-auto w-full max-w-6xl overflow-x-hidden px-6 pb-28 pt-5 sm:px-6 sm:py-8">
	{#if loading}
		<section class="rounded-[2rem] bg-white p-6 shadow-sm dark:bg-slate-900">
			<p class="font-bold text-slate-500 dark:text-slate-400">Loading organization...</p>
		</section>
	{:else if error && !organization}
		<section class="rounded-[2rem] bg-red-50 p-6 font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
			{error}
		</section>
		{:else if organization}
			{#if !canManage}
				<div class="-mx-6 -mt-5 sm:-mx-6 sm:-mt-8">
					<section>
						<div class="relative h-36 overflow-hidden bg-gradient-to-br from-blue-500 via-blue-700 to-slate-950 shadow-sm sm:h-48 md:h-64">
							{#if coverPhotoURL}
								<img src={coverPhotoURL} alt="" class="h-full w-full object-cover" />
							{/if}
							<div class="absolute inset-0 bg-gradient-to-t from-white via-white/10 to-transparent dark:from-slate-950"></div>
							<button
								type="button"
								onclick={() => history.back()}
								class="absolute left-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full text-3xl font-black text-slate-950 drop-shadow-[0_1px_0_rgba(255,255,255,0.75)] transition hover:bg-white/20 dark:text-white"
								aria-label="Go back"
							>
								‹
							</button>
						</div>

						<div class="mx-auto max-w-5xl px-6 pb-5">
							<div class="-mt-12 flex items-end gap-4 sm:-mt-16">
								<div class="relative z-10 ml-4 grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-white bg-slate-100 text-4xl font-black text-blue-600 shadow-xl dark:border-slate-950 dark:bg-slate-800 dark:text-blue-300 sm:ml-8 sm:h-32 sm:w-32">
									{#if organization.logoURL}
										<img src={organization.logoURL} alt={organization.name} class="h-full w-full object-cover" />
									{:else}
										{organization.name.charAt(0).toUpperCase()}
									{/if}
								</div>
							</div>

							<div class="mt-3 px-0 sm:px-0">
								<div class="flex min-w-0 items-center gap-2">
									<h1 class="min-w-0 text-3xl font-black leading-none tracking-tight text-slate-950 dark:text-slate-50 sm:text-5xl">
										{organization.name}
									</h1>
									{#if organization.verificationStatus === 'verified'}
										<span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-600 text-xs font-black text-white sm:h-7 sm:w-7">✓</span>
									{/if}
								</div>
								<p class="mt-2 text-base font-black text-blue-600 dark:text-blue-400 sm:text-lg">
									{organization.description || `${formatOrganizationType(organization.type)} on Rally.`}
								</p>
								<p class="mt-3 flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400">
									<span>📍</span>
									<span class="truncate">{getOrganizationLocation()}</span>
								</p>
							</div>

							<div class="mt-4 flex gap-2 overflow-x-auto pb-1">
								{#each organizationSports as sport}
									<span class="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm font-bold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
										{formatSport(sport)}
									</span>
								{/each}
								{#if extraSportCount > 0}
									<span class="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm font-bold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
										+ {extraSportCount} more
									</span>
								{:else if organizationSports.length === 0}
									<span class="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm font-bold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
										{formatOrganizationType(organization.type)}
									</span>
								{/if}
							</div>

							<div class="mt-5 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-200 py-3 dark:divide-slate-800 dark:border-slate-800">
								<div class="text-center">
									<p class="text-xl font-black text-slate-950 dark:text-slate-50">{playersReached}</p>
									<p class="text-xs font-bold text-slate-500 dark:text-slate-400">Players</p>
								</div>
								<div class="text-center">
									<p class="text-xl font-black text-slate-950 dark:text-slate-50">{displayedFollowersCount}</p>
									<p class="text-xs font-bold text-slate-500 dark:text-slate-400">Followers</p>
								</div>
								<div class="text-center">
									<p class="text-xl font-black text-slate-950 dark:text-slate-50">{events.length}</p>
									<p class="text-xs font-bold text-slate-500 dark:text-slate-400">Events</p>
								</div>
							</div>

							{#if mutualFollowerFriends.length > 0}
								<div class="mt-3 flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400">
									<div class="flex -space-x-2">
										{#each mutualFollowerFriends.slice(0, 3) as friend (friend.id)}
											<div class="grid h-7 w-7 place-items-center overflow-hidden rounded-full border-2 border-white bg-blue-100 text-xs font-black text-blue-700 dark:border-slate-950 dark:bg-blue-950 dark:text-blue-200">
												{#if friend.photoURL}
													<img src={friend.photoURL} alt={friend.displayName} class="h-full w-full object-cover" />
												{:else}
													{friend.displayName?.charAt(0).toUpperCase() ?? 'U'}
												{/if}
											</div>
										{/each}
									</div>
									<p class="min-w-0 truncate">
										Followed by {mutualFollowerFriends.map((friend) => friend.displayName).slice(0, 2).join(', ')}
										{mutualFollowerFriends.length > 2 ? ` and ${mutualFollowerFriends.length - 2} more` : ''}
									</p>
								</div>
							{/if}

							<div class="mt-5 grid grid-cols-3 gap-2">
								<button type="button" onclick={toggleFollow} disabled={actionLoading} class="rounded-2xl bg-blue-600 px-3 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60">
									{actionLoading ? '...' : following ? 'Following' : '+ Follow'}
								</button>
								<button type="button" onclick={messageOrganization} disabled={messageLoading} class="rounded-2xl border border-blue-200 bg-white px-3 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-50 disabled:opacity-60 dark:border-blue-900 dark:bg-slate-950 dark:text-blue-300 dark:hover:bg-blue-950">
									{messageLoading ? '...' : 'Message'}
								</button>
								{#if galleryPhotoURLs.length > 0}
									<button type="button" onclick={() => openGallery()} class="rounded-2xl bg-orange-500 px-3 py-3 text-center text-sm font-black text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600">
										Photos
									</button>
								{:else}
									<a href="#organization-reviews" class="rounded-2xl bg-orange-500 px-3 py-3 text-center text-sm font-black text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600">
										Reviews
									</a>
								{/if}
							</div>
						</div>
					</section>

					<section id="organization-events" class="mx-auto max-w-5xl border-t border-slate-200 px-6 py-5 dark:border-slate-800">
						<div class="mb-3 flex items-center justify-between gap-3">
							<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Upcoming Events</h2>
							{#if upcomingEvents.length > 2}
								<a href="#organization-events" class="text-sm font-black text-blue-600 dark:text-blue-400">View All Events ›</a>
							{/if}
						</div>

						{#if featuredEvents.length === 0}
							<div class="rounded-[1.5rem] border border-dashed border-slate-200 p-5 text-center dark:border-slate-800">
								<p class="font-black text-slate-950 dark:text-slate-50">No upcoming events yet</p>
								<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">New events from this organization will appear here.</p>
							</div>
						{:else}
							<div class="grid max-w-3xl gap-4">
								{#each featuredEvents as event (event.id)}
									<EventCard {event} variant="hero" miniHero heroCtaLabel="View event" />
								{/each}
							</div>
						{/if}
					</section>

					<section class="mx-auto max-w-5xl border-t border-slate-200 px-6 py-5 dark:border-slate-800">
						<div class="flex items-center justify-between gap-3">
							<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">About</h2>
							<span class={`rounded-full px-3 py-1 text-xs font-black ${verificationClasses()}`}>{verificationLabel()}</span>
						</div>
						<p class="mt-2 max-w-3xl leading-relaxed text-slate-700 dark:text-slate-300">
							{organization.description || 'This organization has not added an about description yet.'}
						</p>

						<div class="mt-4 grid gap-4 sm:grid-cols-[1fr_11rem]">
							<div class="space-y-3">
								<div class="flex gap-3">
									<div class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">📍</div>
									<div>
										<p class="font-black text-slate-950 dark:text-slate-50">{organization.publicLocation?.name || 'Home venue'}</p>
										<p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
											{organization.publicLocation?.address || organization.address || organization.city || 'No public venue set yet.'}
										</p>
									</div>
								</div>

								<div class="flex flex-wrap gap-2 text-sm font-bold">
									{#if organization.contactEmail}
										<a href={`mailto:${organization.contactEmail}`} class="rounded-full bg-slate-50 px-3 py-2 text-slate-700 transition hover:text-blue-600 dark:bg-slate-900 dark:text-slate-200">✉️ {organization.contactEmail}</a>
									{/if}
									{#if organization.phone}
										<a href={`tel:${organization.phone}`} class="rounded-full bg-slate-50 px-3 py-2 text-slate-700 transition hover:text-blue-600 dark:bg-slate-900 dark:text-slate-200">📞 {organization.phone}</a>
									{/if}
									{#if organization.website}
										<a href={organization.website} target="_blank" rel="noreferrer" class="rounded-full bg-blue-50 px-3 py-2 text-blue-700 dark:bg-blue-950 dark:text-blue-300">Website</a>
									{/if}
								</div>
							</div>

							{#if getVenueMapUrl()}
								<img src={getVenueMapUrl()} alt="Venue map" class="h-24 w-full rounded-2xl object-cover sm:h-full" />
							{/if}
						</div>
					</section>

					{#if galleryPhotoURLs.length > 0}
						<section class="mx-auto max-w-5xl border-t border-slate-200 px-6 py-5 dark:border-slate-800">
							<div class="flex items-center justify-between gap-3">
								<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Gallery</h2>
								<button type="button" onclick={() => openGallery()} class="text-sm font-black text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
									View All Photos ›
								</button>
							</div>
							<div class="mt-3 flex gap-2 overflow-x-auto pb-1">
								{#each galleryPhotoURLs as photoURL}
									<button type="button" onclick={() => openGallery(photoURL)} class="shrink-0 overflow-hidden rounded-2xl shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
										<img
											src={photoURL}
											alt=""
											class="h-20 w-32 object-cover sm:h-24 sm:w-40"
											onerror={(event) => ((event.currentTarget as HTMLImageElement).hidden = true)}
										/>
									</button>
								{/each}
							</div>
						</section>
					{/if}

					<section id="organization-reviews" class="mx-auto max-w-5xl border-t border-slate-200 px-6 py-5 dark:border-slate-800">
						<div class="flex flex-wrap items-end justify-between gap-3">
							<div>
								<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Reviews</h2>
								<p class="text-sm font-bold text-slate-500 dark:text-slate-400">
									{#if reviews.length > 0}
										⭐ {averageRating.toFixed(1)} from {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
									{:else}
										No reviews yet
									{/if}
								</p>
							</div>
						</div>

						<div class="mt-4 rounded-[1.5rem] bg-slate-50 p-4 dark:bg-slate-900">
							<p class="font-black text-slate-950 dark:text-slate-50">Rate this organization</p>
							<div class="mt-2 flex gap-1">
								{#each [1, 2, 3, 4, 5] as star}
									<button type="button" onclick={() => (reviewRating = star)} class={`text-2xl transition ${reviewRating >= star ? 'text-yellow-400' : 'text-slate-300 dark:text-slate-700'}`} aria-label={`Rate ${star} stars`}>
										★
									</button>
								{/each}
							</div>
							<textarea bind:value={reviewComment} rows="2" class="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:focus:ring-blue-950" placeholder="Leave a comment..."></textarea>
							<button type="button" onclick={submitReview} disabled={reviewSubmitting || reviewRating < 1} class="mt-3 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60">
								{reviewSubmitting ? 'Saving...' : 'Save review'}
							</button>
							{#if reviewMessage}
								<p class={`mt-3 text-sm font-bold ${reviewMessage === 'Review saved.' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
									{reviewMessage}
								</p>
							{/if}
						</div>

						{#if reviews.length > 0}
							<div class="mt-4 grid gap-3 sm:grid-cols-2">
								{#each paginatedReviews as review (review.id)}
									<div class="rounded-[1.35rem] bg-slate-50 p-4 dark:bg-slate-900">
										<div class="flex items-center justify-between gap-3">
											<p class="truncate font-black text-slate-950 dark:text-slate-50">{review.authorName ?? 'Rally user'}</p>
											<p class="shrink-0 text-sm font-black text-yellow-500">{'★'.repeat(review.rating)}</p>
										</div>
										{#if review.comment}
											<p class="mt-2 text-sm font-bold leading-relaxed text-slate-500 dark:text-slate-400">{review.comment}</p>
										{/if}
										{#if review.replies?.length}
											<div class="mt-3 space-y-2 border-l-2 border-blue-100 pl-3 dark:border-blue-950">
												{#each review.replies.slice(-3) as reply (reply.id)}
													<div class="rounded-2xl bg-white px-3 py-2 dark:bg-slate-950">
														<div class="flex items-center gap-2">
															<p class="text-xs font-black text-slate-950 dark:text-slate-50">{reply.authorName ?? 'Rally user'}</p>
															{#if reply.authorRole === 'organization'}
																<span class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-blue-700 dark:bg-blue-950 dark:text-blue-300">Org</span>
															{/if}
														</div>
														<p class="mt-1 text-xs font-bold leading-relaxed text-slate-500 dark:text-slate-400">{reply.comment}</p>
													</div>
												{/each}
											</div>
										{/if}
										{#if reviewCanReply()}
											<div class="mt-3">
												{#if replyingToReviewId === review.id}
													<textarea bind:value={replyComment} rows="2" class="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:focus:ring-blue-950" placeholder="Reply to this review..."></textarea>
													<div class="mt-2 flex gap-2">
														<button type="button" onclick={() => submitReviewReply(review)} disabled={replySubmitting || !replyComment.trim()} class="rounded-full bg-blue-600 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-700 disabled:opacity-60">
															{replySubmitting ? 'Sending...' : 'Reply'}
														</button>
														<button type="button" onclick={() => { replyingToReviewId = null; replyComment = ''; replyMessage = ''; }} class="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-600 transition hover:text-slate-950 dark:bg-slate-950 dark:text-slate-300">
															Cancel
														</button>
													</div>
													{#if replyMessage}
														<p class="mt-2 text-xs font-bold text-red-600 dark:text-red-400">{replyMessage}</p>
													{/if}
												{:else}
													<button type="button" onclick={() => { replyingToReviewId = review.id; replyComment = ''; replyMessage = ''; }} class="text-xs font-black text-blue-600 transition hover:text-blue-700 dark:text-blue-400">
														Reply
													</button>
												{/if}
											</div>
										{/if}
									</div>
								{/each}
							</div>
							{#if reviewPages > 1}
								<div class="mt-4 flex items-center justify-center gap-2">
									<button type="button" onclick={() => goToReviewPage(reviewPage - 1)} disabled={reviewPage === 0} class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:text-blue-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
										Previous
									</button>
									{#each Array(reviewPages) as _, index}
										<button type="button" onclick={() => goToReviewPage(index)} class={`h-8 min-w-8 rounded-full px-3 text-xs font-black transition ${reviewPage === index ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:text-blue-600 dark:bg-slate-950 dark:text-slate-300'}`}>
											{index + 1}
										</button>
									{/each}
									<button type="button" onclick={() => goToReviewPage(reviewPage + 1)} disabled={reviewPage >= reviewPages - 1} class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:text-blue-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
										Next
									</button>
								</div>
							{/if}
						{/if}
					</section>
				</div>
			{:else}
		<section class="max-w-full px-0 md:px-0">
			{#if coverPhotoURL}
				<div class="mb-6 h-40 overflow-hidden rounded-[2rem] bg-slate-100 shadow-sm dark:bg-slate-900 sm:h-56 md:h-72">
					<img src={coverPhotoURL} alt="" class="h-full w-full object-cover" />
				</div>
			{/if}

			<div class="mb-6 rounded-[1.7rem] bg-white p-4 shadow-sm dark:bg-slate-900">
				<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<h2 class="font-black text-slate-950 dark:text-slate-50">Public profile media</h2>
						<p class="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">
							Change the cover image and add gallery photos shown on your organization profile.
						</p>
					</div>
					<div class="flex flex-wrap gap-2">
						<input
							bind:this={coverInput}
							type="file"
							accept="image/*"
							class="hidden"
							onchange={handleCoverUpload}
						/>
						<button
							type="button"
							onclick={() => coverInput?.click()}
							disabled={uploadingCover}
							class="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
						>
							{uploadingCover ? 'Uploading...' : 'Change cover'}
						</button>

						<input
							bind:this={galleryInput}
							type="file"
							accept="image/*"
							multiple
							class="hidden"
							onchange={handleGalleryUpload}
						/>
						<button
							type="button"
							onclick={() => galleryInput?.click()}
							disabled={uploadingGallery}
							class="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
						>
							{uploadingGallery ? 'Uploading...' : 'Add gallery photos'}
						</button>
					</div>
				</div>

				{#if galleryPhotoURLs.length > 0}
					<div class="mt-4 flex gap-2 overflow-x-auto pb-1">
						{#each galleryPhotoURLs.slice(0, 6) as photoURL}
							<img src={photoURL} alt="" class="h-20 w-32 shrink-0 rounded-2xl object-cover" />
						{/each}
					</div>
				{/if}

				<div class="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<h3 class="font-black text-slate-950 dark:text-slate-50">Public sports</h3>
							<p class="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">
								Choose the sports shown on the public organization profile.
							</p>
						</div>
						<button
							type="button"
							onclick={saveOrganizationSports}
							disabled={savingSports}
							class="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
						>
							{savingSports ? 'Saving...' : 'Save sports'}
						</button>
					</div>

					<div class="mt-3 flex flex-wrap gap-2">
						{#each availableSports as sport}
							<button
								type="button"
								onclick={() => toggleOrganizationSport(sport)}
								class={`rounded-full px-3.5 py-2 text-sm font-black transition ${
									selectedOrganizationSports.includes(sport)
										? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
										: 'bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-blue-950 dark:hover:text-blue-300'
								}`}
							>
								{formatSport(sport)}
							</button>
						{/each}
					</div>
				</div>
			</div>

			<div class="flex items-start justify-between gap-3 md:gap-6">
				<div class="flex min-w-0 flex-1 items-center gap-4 md:gap-5">
					<div class="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[1.6rem] bg-slate-100 text-3xl font-black text-blue-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-blue-300 dark:ring-slate-700 md:h-28 md:w-28 md:rounded-[2rem] md:text-5xl">
						{#if organization.logoURL}
							<img src={organization.logoURL} alt={organization.name} class="h-full w-full object-cover" />
						{:else}
							{organization.name.charAt(0).toUpperCase()}
						{/if}
					</div>

					<div class="min-w-0 flex-1">
						<div class="flex min-w-0 items-center gap-2">
							<h1 class="truncate text-2xl font-black tracking-tight text-slate-950 dark:text-slate-50 md:text-4xl">
								{organization.name}
							</h1>
							{#if organization.verificationStatus === 'verified'}
								<span class="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-600 text-[11px] font-black text-white md:h-6 md:w-6">✓</span>
							{/if}
						</div>

						<p class="mt-1 truncate text-sm font-bold text-slate-500 dark:text-slate-400">
							@{organization.handle}
						</p>
						<p class="mt-0.5 text-sm font-bold text-slate-500 dark:text-slate-400">
							{formatOrganizationType(organization.type)}
						</p>
					</div>
				</div>

				{#if canManage}
					<a href={resolve(`/organizations/${organization.id}/manage`)} class="shrink-0 rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
						Manage
					</a>
				{:else}
					<button type="button" onclick={toggleFollow} disabled={actionLoading} class="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60">
						{actionLoading ? '...' : following ? 'Following' : 'Follow'}
					</button>
				{/if}
			</div>

			<div class="mt-5 grid max-w-xl grid-cols-3 divide-x divide-slate-200 border-y border-slate-200 py-4 text-center dark:divide-slate-800 dark:border-slate-800 md:mt-7">
				<div>
					<p class="text-lg font-black text-slate-950 dark:text-slate-50 md:text-2xl">{events.length}</p>
					<p class="text-xs font-bold text-slate-500 dark:text-slate-400">Events</p>
				</div>
				<div>
					<p class="text-lg font-black text-slate-950 dark:text-slate-50 md:text-2xl">{upcomingEvents.length}</p>
					<p class="text-xs font-bold text-slate-500 dark:text-slate-400">Upcoming</p>
				</div>
				<div>
					<p class="text-lg font-black text-slate-950 dark:text-slate-50 md:text-2xl">{displayedFollowersCount}</p>
					<p class="text-xs font-bold text-slate-500 dark:text-slate-400">Followers</p>
				</div>
			</div>

			<p class="mt-5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 md:text-base">
				{organization.description || 'Follow this organization to keep up with new events, tournaments and community updates.'}
			</p>

			<div class="mt-4 flex flex-wrap gap-2 text-xs font-black text-slate-500 dark:text-slate-400">
				{#if organization.city}<span class="rounded-full bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">📍 {organization.city}</span>{/if}
				{#if organization.website}<a href={organization.website} target="_blank" rel="noreferrer" class="rounded-full bg-blue-50 px-3 py-2 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-900">Website</a>{/if}
				<span class={`rounded-full px-3 py-2 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800 ${verificationClasses()}`}>{verificationLabel()}</span>
			</div>

			{#if !canManage}
				<button type="button" onclick={messageOrganization} disabled={messageLoading} class="mt-5 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 sm:w-auto">
					{messageLoading ? 'Opening...' : 'Contact organizer'}
				</button>
			{/if}
		</section>

		<div class="mt-5 grid max-w-full gap-5 md:mt-8 md:grid-cols-[minmax(0,1fr)_22rem]">
			<section class="min-w-0 max-w-full space-y-5 overflow-hidden">
				<div class="flex items-center justify-between gap-3">
					<div>
						<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 md:text-2xl">Upcoming events</h2>
						<p class="text-sm font-bold text-slate-500 dark:text-slate-400">Events hosted by {organization.name}</p>
					</div>
					{#if upcomingEvents.length > 2}
						<span class="text-sm font-black text-blue-600 dark:text-blue-400">See all</span>
					{/if}
				</div>

				{#if upcomingEvents.length === 0}
					<div class="rounded-[2rem] bg-white p-8 text-center shadow-sm dark:bg-slate-900">
						<p class="text-4xl">📅</p>
						<p class="mt-3 font-black text-slate-950 dark:text-slate-50">No upcoming events yet</p>
						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">New events from this organization will appear here.</p>
					</div>
				{:else}
					<div class="grid gap-4">
						{#each promotedEvents as event (event.id)}
							<EventCard {event} variant="hero" compactHero heroCtaLabel="View event" />
						{/each}

						{#each normalUpcomingEvents as event (event.id)}
							<EventCard {event} variant="hero" compactHero heroCtaLabel="View event" />
						{/each}
					</div>
				{/if}
			</section>

			<aside class="min-w-0 max-w-full space-y-4 overflow-hidden">
				{#if canManage}
					<div class="max-w-full overflow-hidden rounded-[1.7rem] bg-white p-4 shadow-sm dark:bg-slate-900">
						<div class="flex items-center justify-between gap-3">
							<div>
								<h3 class="font-black text-slate-950 dark:text-slate-50">Manage club</h3>
								<p class="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">Create, message and update your organization.</p>
							</div>
						</div>

						<div class="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4 md:grid-cols-2">
							<a href={resolve(`/organizations/${organization.id}/events/create`)} class="rounded-2xl bg-slate-50 p-3 text-xs font-black text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-blue-950 dark:hover:text-blue-300">📅<br />Events</a>
							<a href={resolve(`/organizations/${organization.id}/tournaments/create`)} class="rounded-2xl bg-slate-50 p-3 text-xs font-black text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-blue-950 dark:hover:text-blue-300">🏆<br />Tournaments</a>
							<a href={resolve('/messages')} class="rounded-2xl bg-slate-50 p-3 text-xs font-black text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-blue-950 dark:hover:text-blue-300">💬<br />Inbox</a>
							<button type="button" onclick={() => (showOrganizationSettings = true)} class="rounded-2xl bg-slate-50 p-3 text-xs font-black text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-blue-950 dark:hover:text-blue-300">⚙️<br />Settings</button>
						</div>
					</div>

					<a href={resolve(`/organizations/${organization.id}/manage`)} class="block max-w-full overflow-hidden rounded-[1.7rem] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900">
						<div class="flex items-center gap-3">
							<div class="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-lg dark:bg-blue-950">📣</div>
							<div class="min-w-0 flex-1">
								<p class="font-black text-slate-950 dark:text-slate-50">Promote an event</p>
								<p class="truncate text-sm font-bold text-slate-500 dark:text-slate-400">Choose an event to boost from manage.</p>
							</div>
							<span class="text-xl text-slate-300">›</span>
						</div>
					</a>
				{/if}

				<div class="max-w-full overflow-hidden rounded-[1.7rem] bg-white p-4 shadow-sm dark:bg-slate-900">
					<h3 class="font-black text-slate-950 dark:text-slate-50">Club info</h3>
					<div class="mt-3 space-y-3 text-sm font-bold text-slate-500 dark:text-slate-400">
						<p>Type · {formatOrganizationType(organization.type)}</p>
						<p>Status · {verificationLabel()}</p>
						{#if organization.phone}<p>Phone · {organization.phone}</p>{/if}
						{#if organization.city}<p>City · {organization.city}</p>{/if}
						{#if organization.contactEmail}<p class="truncate">Email · {organization.contactEmail}</p>{/if}
					</div>
				</div>
			</aside>
		</div>

		{#if galleryPhotoURLs.length > 0}
			<section class="mt-8 max-w-full overflow-hidden">
				<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 md:text-2xl">Gallery</h2>
				<div class="mt-3 flex gap-3 overflow-x-auto pb-1">
					{#each galleryPhotoURLs as photoURL}
						<img src={photoURL} alt="" class="h-28 w-44 shrink-0 rounded-[1.4rem] object-cover shadow-sm sm:h-36 sm:w-56" />
					{/each}
				</div>
			</section>
		{/if}

		<section class="mt-8 max-w-full overflow-hidden">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 md:text-2xl">Reviews</h2>
					<p class="text-sm font-bold text-slate-500 dark:text-slate-400">
						{#if reviews.length > 0}
							⭐ {averageRating.toFixed(1)} from {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
						{:else}
							No reviews yet
						{/if}
					</p>
				</div>
			</div>

			{#if !canManage}
				<div class="mt-4 rounded-[1.7rem] bg-white p-4 shadow-sm dark:bg-slate-900">
					<p class="font-black text-slate-950 dark:text-slate-50">Rate this organization</p>
					<div class="mt-3 flex gap-1">
						{#each [1, 2, 3, 4, 5] as star}
							<button
								type="button"
								onclick={() => (reviewRating = star)}
								class={`text-3xl transition ${reviewRating >= star ? 'text-yellow-400' : 'text-slate-300 dark:text-slate-700'}`}
								aria-label={`Rate ${star} stars`}
							>
								★
							</button>
						{/each}
					</div>
					<textarea
						bind:value={reviewComment}
						rows="3"
						class="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:ring-blue-950"
						placeholder="Leave a comment..."
					></textarea>
					<button
						type="button"
						onclick={submitReview}
						disabled={reviewSubmitting || reviewRating < 1}
						class="mt-3 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
					>
						{reviewSubmitting ? 'Saving...' : 'Save review'}
					</button>
				</div>
			{/if}

			{#if reviews.length > 0}
				<div class="mt-4 grid gap-3 sm:grid-cols-2">
					{#each paginatedReviews as review (review.id)}
						<div class="rounded-[1.5rem] bg-white p-4 shadow-sm dark:bg-slate-900">
							<div class="flex items-center justify-between gap-3">
								<p class="truncate font-black text-slate-950 dark:text-slate-50">{review.authorName ?? 'Rally user'}</p>
								<p class="shrink-0 text-sm font-black text-yellow-500">{'★'.repeat(review.rating)}</p>
							</div>
							{#if review.comment}
								<p class="mt-2 text-sm font-bold leading-relaxed text-slate-500 dark:text-slate-400">{review.comment}</p>
							{/if}
							{#if review.replies?.length}
								<div class="mt-3 space-y-2 border-l-2 border-blue-100 pl-3 dark:border-blue-950">
									{#each review.replies.slice(-3) as reply (reply.id)}
										<div class="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-950">
											<div class="flex items-center gap-2">
												<p class="text-xs font-black text-slate-950 dark:text-slate-50">{reply.authorName ?? 'Rally user'}</p>
												{#if reply.authorRole === 'organization'}
													<span class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-blue-700 dark:bg-blue-950 dark:text-blue-300">Org</span>
												{/if}
											</div>
											<p class="mt-1 text-xs font-bold leading-relaxed text-slate-500 dark:text-slate-400">{reply.comment}</p>
										</div>
									{/each}
								</div>
							{/if}
							{#if reviewCanReply()}
								<div class="mt-3">
									{#if replyingToReviewId === review.id}
										<textarea bind:value={replyComment} rows="2" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:ring-blue-950" placeholder="Reply to this review..."></textarea>
										<div class="mt-2 flex gap-2">
											<button type="button" onclick={() => submitReviewReply(review)} disabled={replySubmitting || !replyComment.trim()} class="rounded-full bg-blue-600 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-700 disabled:opacity-60">
												{replySubmitting ? 'Sending...' : 'Reply'}
											</button>
											<button type="button" onclick={() => { replyingToReviewId = null; replyComment = ''; replyMessage = ''; }} class="rounded-full bg-slate-50 px-4 py-2 text-xs font-black text-slate-600 transition hover:text-slate-950 dark:bg-slate-800 dark:text-slate-300">
												Cancel
											</button>
										</div>
										{#if replyMessage}
											<p class="mt-2 text-xs font-bold text-red-600 dark:text-red-400">{replyMessage}</p>
										{/if}
									{:else}
										<button type="button" onclick={() => { replyingToReviewId = review.id; replyComment = ''; replyMessage = ''; }} class="text-xs font-black text-blue-600 transition hover:text-blue-700 dark:text-blue-400">
											Reply
										</button>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
				{#if reviewPages > 1}
					<div class="mt-4 flex items-center justify-center gap-2">
						<button type="button" onclick={() => goToReviewPage(reviewPage - 1)} disabled={reviewPage === 0} class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:text-blue-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
							Previous
						</button>
						{#each Array(reviewPages) as _, index}
							<button type="button" onclick={() => goToReviewPage(index)} class={`h-8 min-w-8 rounded-full px-3 text-xs font-black transition ${reviewPage === index ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:text-blue-600 dark:bg-slate-950 dark:text-slate-300'}`}>
								{index + 1}
							</button>
						{/each}
						<button type="button" onclick={() => goToReviewPage(reviewPage + 1)} disabled={reviewPage >= reviewPages - 1} class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:text-blue-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
							Next
						</button>
					</div>
				{/if}
			{/if}
		</section>

		{#if showOrganizationSettings}
			<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true">
				<div class="max-h-[calc(100svh-2rem)] w-full max-w-md overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl dark:bg-slate-900">
					<div class="flex items-start justify-between gap-4">
						<div>
							<p class="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Organization</p>
							<h2 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50">Settings</h2>
						</div>
						<button type="button" onclick={() => (showOrganizationSettings = false)} class="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-lg font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">×</button>
					</div>

					<div class="mt-5 space-y-3">
						<button type="button" onclick={toggleOrganizationNotifications} class="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-left dark:bg-slate-800">
							<span>
								<span class="block font-black text-slate-950 dark:text-slate-50">Notifications</span>
								<span class="text-sm font-bold text-slate-500 dark:text-slate-400">{orgNotificationsEnabled ? 'Enabled' : 'Disabled'} for this organization</span>
							</span>
							<span class={`h-7 w-12 rounded-full p-1 transition ${orgNotificationsEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
								<span class={`block h-5 w-5 rounded-full bg-white transition ${orgNotificationsEnabled ? 'translate-x-5' : ''}`}></span>
							</span>
						</button>

						<button type="button" onclick={toggleOrganizationDarkMode} class="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-left dark:bg-slate-800">
							<span>
								<span class="block font-black text-slate-950 dark:text-slate-50">Appearance</span>
								<span class="text-sm font-bold text-slate-500 dark:text-slate-400">{orgDarkModeEnabled ? 'Dark mode' : 'Light mode'}</span>
							</span>
							<span class="text-xl">{orgDarkModeEnabled ? '🌙' : '☀️'}</span>
						</button>

						<a href={resolve(`/organizations/${organization.id}/manage`)} class="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 font-black text-slate-950 dark:bg-slate-800 dark:text-slate-50">
							Edit organization
							<span class="text-slate-300">›</span>
						</a>
					</div>
				</div>
			</div>
		{/if}
		{/if}
		{#if showGalleryModal && galleryPhotoURLs.length > 0}
			<div
				class="fixed inset-0 z-50 flex items-center justify-center p-4"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
			>
				<button
					type="button"
					class="absolute inset-0 bg-slate-950/85 backdrop-blur-sm"
					aria-label="Close gallery"
					onclick={closeGallery}
				></button>
				<div
					class="relative z-10 flex max-h-[calc(100svh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-slate-950"
				>
					<div class="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5">
						<div>
							<p class="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Gallery</p>
							<h2 class="text-lg font-black text-slate-950 dark:text-slate-50">{organization.name} photos</h2>
						</div>
						<button type="button" onclick={closeGallery} class="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xl font-black text-slate-600 transition hover:text-slate-950 dark:bg-slate-900 dark:text-slate-300">
							×
						</button>
					</div>

					<div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
						{#if selectedGalleryPhoto}
							<img src={selectedGalleryPhoto} alt="" class="mx-auto max-h-[56svh] w-full rounded-[1.5rem] object-contain bg-slate-100 dark:bg-slate-900" />
						{/if}

						<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
							{#each galleryPhotoURLs as photoURL}
								<button
									type="button"
									onclick={() => (selectedGalleryPhoto = photoURL)}
									class={`overflow-hidden rounded-2xl ring-2 transition ${selectedGalleryPhoto === photoURL ? 'ring-blue-600' : 'ring-transparent hover:ring-blue-200'}`}
								>
									<img src={photoURL} alt="" class="h-28 w-full object-cover sm:h-32" />
								</button>
							{/each}
						</div>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</main>
