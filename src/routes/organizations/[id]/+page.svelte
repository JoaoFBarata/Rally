<!--src/routes/organizations/[id]/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { i18n } from '$lib/services/i18n.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
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
		updateOrganizationProfile,
		getOrganizationLogo
	} from '$lib/services/organization.service';
	import { getFriendsForUser } from '$lib/services/social.service';
	import { uploadOrganizationLogo } from '$lib/services/storage.service';
	import ImageCropperModal from '$lib/components/ImageCropperModal.svelte';
	import { getEventsCreatedByOrganization } from '$lib/services/event.service';
	import { getOrCreateOrganizationConversation } from '$lib/services/chat.service';
	import PublicProfileEventCard from '$lib/components/PublicProfileEventCard.svelte';
	import ExpandableText from '$lib/components/ExpandableText.svelte';
	import {
		subscribeToEventCatalogChanges,
		subscribeToOrganizationChanges
	} from '$lib/services/realtime.service';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import {
		formatSport,
		getCurrentLocale,
		getMiniMapUrl as getMiniMapUrlUtil
	} from '$lib/utils/format.utils';
	import { TEXT_LIMITS } from '$lib/constants/text-limits';
	import { getEventTemporalState } from '$lib/utils/event-lifecycle.utils';

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
	let showCropper = $state(false);
	let cropperImageSrc = $state('');
	let cropperTarget = $state<'logo' | 'cover' | null>(null);
	let cropperInputRef = $state<HTMLInputElement | null>(null);
	let logoInput = $state<HTMLInputElement | null>(null);
	let coverInput = $state<HTMLInputElement | null>(null);
	let galleryInput = $state<HTMLInputElement | null>(null);
	let uploadingGallery = $state(false);
	let savingSports = $state(false);
	let mutualFollowerFriends = $state<UserProfile[]>([]);
	let followerIds = $state<string[]>([]);
	let showGalleryModal = $state(false);
	let selectedGalleryPhoto = $state('');
	let selectedOrganizationSports = $state<Sport[]>([]);
	let showEditProfile = $state(false);
	let editName = $state('');
	let editType = $state<Organization['type']>('company');
	let editDescription = $state('');
	let editContactEmail = $state('');
	let editPhone = $state('');
	let editWebsite = $state('');
	let editAddress = $state('');
	let editCity = $state('');
	let editNif = $state('');
	let savingProfile = $state(false);
	let removingGalleryPhoto = $state('');
	let draftLogoFile = $state<File | null>(null);
	let draftLogoPreview = $state('');
	let draftCoverFile = $state<File | null>(null);
	let draftCoverPreview = $state('');
	let reviewPage = $state(0);
	let replyingToReviewId = $state<string | null>(null);
	let replyComment = $state('');
	let replySubmitting = $state(false);
	let replyMessage = $state('');
	let visibleEventCount = $state(3);
	let visiblePastEventCount = $state(3);
	const reviewsPerPage = 4;

	let liveEvents = $derived.by(() =>
		sortUpcomingEvents(events.filter((event) => getEventTemporalState(event) === 'live'))
	);
	let upcomingEvents = $derived.by(() =>
		sortUpcomingEvents(
			events.filter(
				(event) =>
					!isPastOrganizationEvent(event) && getEventTemporalState(event) !== 'live'
			)
		)
	);
	let pastEvents = $derived.by(() =>
		[...events]
			.filter((event) => isPastOrganizationEvent(event))
			.sort((a, b) => getEventTimestampMillis(b.startAt) - getEventTimestampMillis(a.startAt))
	);
	let orderedUpcomingEvents = $derived(upcomingEvents);
	let visibleUpcomingEvents = $derived(orderedUpcomingEvents.slice(0, visibleEventCount));
	let hasMoreUpcomingEvents = $derived(orderedUpcomingEvents.length > visibleEventCount);
	let visiblePastEvents = $derived(pastEvents.slice(0, visiblePastEventCount));
	let hasMorePastEvents = $derived(pastEvents.length > visiblePastEventCount);
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

	function formatOrganizationType(type: string) {
		return type.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
	}

	function verificationLabel() {
		if (!organization) return i18n.t('not_verified');
		if (organization.verificationStatus === 'verified') return i18n.t('verified');
		if (organization.verificationStatus === 'pending') return i18n.t('verification_pending');
		if (organization.verificationStatus === 'rejected') return i18n.t('verification_rejected');
		return i18n.t('not_verified');
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
		if (getEventTemporalState(event) === 'finished') return 'finished';
		return event.status;
	}

	function isPastOrganizationEvent(event: SportEvent) {
		const status = getEffectiveStatus(event);
		return status === 'finished' || status === 'cancelled';
	}

	function sortUpcomingEvents(items: SportEvent[]) {
		return [...items].sort((a, b) => getEventTimestampMillis(a.startAt) - getEventTimestampMillis(b.startAt));
	}

	function getStatusLabel(event: SportEvent) {
		const status = getEffectiveStatus(event);
		if (status === 'cancelled') return i18n.t('status_cancelled');
		if (status === 'finished') return i18n.t('status_finished');
		if (status === 'full') return i18n.t('status_full');
		if (status === 'open') return i18n.t('status_open');
		return status;
	}

	function showMoreEvents() {
		visibleEventCount = Math.min(visibleEventCount + 6, orderedUpcomingEvents.length);
	}

	function showMorePastEvents() {
		visiblePastEventCount = Math.min(visiblePastEventCount + 6, pastEvents.length);
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



	function getWebsiteHref(website?: string | null) {
		if (!website) return '';
		const trimmedWebsite = website.trim();
		if (!trimmedWebsite) return '';
		return /^https?:\/\//i.test(trimmedWebsite) ? trimmedWebsite : `https://${trimmedWebsite}`;
	}

	function toggleOrganizationSport(sport: Sport) {
		if (selectedOrganizationSports.includes(sport)) {
			selectedOrganizationSports = selectedOrganizationSports.filter((item) => item !== sport);
		} else {
			selectedOrganizationSports = [...selectedOrganizationSports, sport];
		}
	}

	function clearDraftMedia() {
		if (draftLogoPreview) URL.revokeObjectURL(draftLogoPreview);
		if (draftCoverPreview) URL.revokeObjectURL(draftCoverPreview);
		draftLogoFile = null;
		draftLogoPreview = '';
		draftCoverFile = null;
		draftCoverPreview = '';
	}

	function handleDraftLogoUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		cropperInputRef = input;
		cropperTarget = 'logo';

		const reader = new FileReader();
		reader.onload = () => {
			cropperImageSrc = reader.result as string;
			showCropper = true;
		};
		reader.readAsDataURL(file);
	}

	function handleDraftCoverUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		cropperInputRef = input;
		cropperTarget = 'cover';

		const reader = new FileReader();
		reader.onload = () => {
			cropperImageSrc = reader.result as string;
			showCropper = true;
		};
		reader.readAsDataURL(file);
	}

	function resetEditProfileForm() {
		if (!organization) return;
		clearDraftMedia();
		editName = organization.name;
		editType = organization.type;
		editDescription = organization.description ?? '';
		editContactEmail = organization.contactEmail;
		editPhone = organization.phone ?? '';
		editWebsite = organization.website ?? '';
		editAddress = organization.address ?? '';
		editCity = organization.city ?? '';
		editNif = organization.nif ?? '';
		selectedOrganizationSports = organization.sports ?? [];
	}

	function openEditProfile() {
		resetEditProfileForm();
		showEditProfile = true;
		error = '';
	}

	function closeEditProfile() {
		clearDraftMedia();
		showEditProfile = false;
	}

	async function saveEditableOrganizationProfile() {
		const user = auth.currentUser;
		if (!user || !organization) return;

		savingProfile = true;
		error = '';

		try {
			let logoURL = organization.logoURL ?? null;
			let logoPath = organization.logoPath ?? null;
			let coverPhotoURL = organization.coverPhotoURL ?? null;
			let coverPhotoPath = organization.coverPhotoPath ?? null;

			if (draftLogoFile) {
				const uploadedLogo = await uploadOrganizationLogo({
					organizationId: organization.id,
					userId: user.uid,
					file: draftLogoFile
				});
				logoURL = uploadedLogo.url;
				logoPath = uploadedLogo.path;
			}

			if (draftCoverFile) {
				const uploadedCover = await uploadOrganizationLogo({
					organizationId: organization.id,
					userId: user.uid,
					file: draftCoverFile
				});
				coverPhotoURL = uploadedCover.url;
				coverPhotoPath = uploadedCover.path;
			}

			await updateOrganizationProfile({
				organizationId: organization.id,
				userId: user.uid,
				name: editName,
				type: editType,
				description: editDescription,
				contactEmail: editContactEmail,
				phone: editPhone,
				website: editWebsite,
				address: editAddress,
				city: editCity,
				nif: editNif,
				logoURL,
				logoPath,
				coverPhotoURL,
				coverPhotoPath,
				sports: selectedOrganizationSports
			});
			closeEditProfile();
			await loadPage(user.uid);
		} catch (err) {
			console.error('Save organization profile error:', err);
			error = getFriendlyErrorMessage(err, 'Could not save organization profile.');
		} finally {
			savingProfile = false;
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

	async function removeGalleryPhoto(photoURL: string) {
		const user = auth.currentUser;
		if (!user || !organization) return;

		removingGalleryPhoto = photoURL;
		error = '';

		try {
			const index = (organization.galleryPhotoURLs ?? []).indexOf(photoURL);
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
				galleryPhotoURLs: (organization.galleryPhotoURLs ?? []).filter((item) => item !== photoURL),
				galleryPhotoPaths: (organization.galleryPhotoPaths ?? []).filter((_, pathIndex) => pathIndex !== index)
			});
			if (selectedGalleryPhoto === photoURL) {
				selectedGalleryPhoto = '';
			}
			await loadPage(user.uid);
		} catch (err) {
			console.error('Remove organization gallery photo error:', err);
			error = getFriendlyErrorMessage(err, 'Could not remove gallery photo.');
		} finally {
			removingGalleryPhoto = '';
		}
	}



	function getMiniMapUrl(event: SportEvent) {
		return getMiniMapUrlUtil(event.location?.lat, event.location?.lng, 144, 104);
	}

	function getOrganizationLocation() {
		return (
			organization?.city ||
			organization?.address ||
			i18n.t('location_not_set')
		);
	}

	function getVenueMapUrl() {
		return getMiniMapUrlUtil(organization?.publicLocation?.lat, organization?.publicLocation?.lng, 280, 120, 14);
	}

	function formatEventDay(dateValue: unknown) {
		try {
			const timestamp = dateValue as { toDate?: () => Date };
			if (!timestamp?.toDate) return i18n.t('soon');
			return timestamp.toDate().toLocaleDateString(getCurrentLocale(), {
				weekday: 'short',
				month: 'short',
				day: '2-digit'
			});
		} catch {
			return i18n.t('soon');
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

<svelte:head>
	{#if coverPhotoURL}
		<link rel="preload" as="image" href={coverPhotoURL} />
	{/if}
</svelte:head>

<main class="mx-auto w-full max-w-6xl overflow-x-hidden px-6 pb-28 pt-5 sm:px-6 sm:py-8">
	{#if loading}
		<section class="rounded-[2rem] bg-white p-6 shadow-sm dark:bg-slate-900">
			<p class="font-bold text-slate-500 dark:text-slate-400">{i18n.t('loading_org')}</p>
		</section>
	{:else if error && !organization}
		<section class="rounded-[2rem] bg-red-50 p-6 font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
			{error}
		</section>
		{:else if organization}
			{#if !canManage}
				<div class="-mx-6 -mt-5 sm:-mx-6 sm:-mt-8">
					<section>
						<div class={`relative h-36 overflow-hidden shadow-sm sm:h-48 md:h-64 ${coverPhotoURL ? 'bg-slate-200 dark:bg-slate-900' : 'bg-gradient-to-br from-blue-500 via-blue-700 to-slate-950'}`}>
							{#if coverPhotoURL}
								<img src={coverPhotoURL} alt="" class="h-full w-full object-cover" loading="eager" decoding="async" fetchpriority="high" />
							{/if}
							<div class="absolute inset-0 bg-gradient-to-t from-white via-white/10 to-transparent dark:from-slate-950"></div>
							<button
								type="button"
								onclick={() => history.back()}
								class="absolute left-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-950 shadow-sm backdrop-blur transition hover:bg-white dark:bg-slate-950/80 dark:text-white dark:hover:bg-slate-950"
								aria-label="Go back"
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="2.8" stroke="currentColor" aria-hidden="true">
									<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
								</svg>
							</button>
						</div>

						<div class="mx-auto max-w-5xl px-6 pb-5">
							<div class="-mt-12 flex items-end gap-4 sm:-mt-16">
								<div class="relative z-10 ml-4 grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-white bg-slate-100 text-4xl font-black text-blue-600 shadow-xl dark:border-slate-950 dark:bg-slate-800 dark:text-blue-300 sm:ml-8 sm:h-32 sm:w-32">
									<img src={getOrganizationLogo(organization.logoURL)} alt={organization.name} class="h-full w-full object-cover" />
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
									{organization.description || `${formatOrganizationType(organization.type)} ${i18n.t('on_rally') || 'on Rally.'}`}
								</p>
								<p class="mt-3 flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400">
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
										<path stroke-linecap="round" stroke-linejoin="round" d="M12 21s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11Z" />
										<circle cx="12" cy="10" r="2.4" />
									</svg>
									<span class="truncate">{getOrganizationLocation()}</span>
								</p>
								{#if organization.website}
									<a
										href={getWebsiteHref(organization.website)}
										target="_blank"
										rel="noreferrer"
										class="mt-2 inline-flex max-w-full items-center gap-2 text-sm font-black text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
									>
										<span aria-hidden="true">↗</span>
										<span class="truncate">{organization.website.replace(/^https?:\/\//, '')}</span>
									</a>
								{/if}
							</div>

							<div class="mt-4 flex gap-2 overflow-x-auto pb-1">
								{#each organizationSports as sport}
									<span class="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm font-bold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
										{formatSport(sport)}
									</span>
								{/each}
								{#if extraSportCount > 0}
									<span class="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm font-bold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
										+ {extraSportCount}{i18n.t('more_suffix')}
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
									<p class="text-xs font-bold text-slate-500 dark:text-slate-400">{i18n.t('players')}</p>
								</div>
								<div class="text-center">
									<p class="text-xl font-black text-slate-950 dark:text-slate-50">{displayedFollowersCount}</p>
									<p class="text-xs font-bold text-slate-500 dark:text-slate-400">{i18n.t('followers')}</p>
								</div>
								<div class="text-center">
									<p class="text-xl font-black text-slate-950 dark:text-slate-50">{events.length}</p>
									<p class="text-xs font-bold text-slate-500 dark:text-slate-400">{i18n.t('events')}</p>
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
										{i18n.t('followed_by')}{mutualFollowerFriends.map((friend) => friend.displayName).slice(0, 2).join(', ')}
										{mutualFollowerFriends.length > 2 ? `${i18n.t('and_conjunction')}${mutualFollowerFriends.length - 2}${i18n.t('more_suffix')}` : ''}
									</p>
								</div>
							{/if}

							<div class="mt-5 grid grid-cols-[1.15fr_1fr_auto] gap-2">
								<button type="button" onclick={toggleFollow} disabled={actionLoading} class={`rounded-xl px-3 py-2.5 text-sm font-black transition disabled:opacity-60 sm:rounded-2xl sm:py-3 ${following ? 'bg-slate-100 text-slate-950 ring-1 ring-slate-200 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-50 dark:ring-slate-800 dark:hover:bg-slate-800' : 'bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700'}`}>
									{actionLoading ? '...' : following ? i18n.t('following') : i18n.t('follow')}
								</button>
								<button type="button" onclick={messageOrganization} disabled={messageLoading} class="rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-black text-slate-950 transition hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800 sm:rounded-2xl sm:py-3">
									{messageLoading ? '...' : i18n.t('message')}
								</button>
								{#if galleryPhotoURLs.length > 0}
									<button type="button" onclick={() => openGallery()} class="rounded-xl bg-slate-100 px-3 py-2.5 text-center text-sm font-black text-slate-950 transition hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800 sm:rounded-2xl sm:py-3" aria-label="Open photos">
										<span class="sm:hidden">📷</span>
										<span class="hidden sm:inline">{i18n.t('photos')}</span>
									</button>
								{:else}
									<a href="#organization-reviews" class="rounded-xl bg-slate-100 px-3 py-2.5 text-center text-sm font-black text-slate-950 transition hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800 sm:rounded-2xl sm:py-3" aria-label="Go to reviews">
										<span class="sm:hidden">★</span>
										<span class="hidden sm:inline">{i18n.t('reviews')}</span>
									</a>
								{/if}
							</div>
						</div>
					</section>

					{#if liveEvents.length > 0}
						<section class="mx-auto max-w-5xl border-t border-emerald-100 px-6 py-5 dark:border-emerald-900/60">
							<div class="mb-3">
								<p class="text-xs font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">{i18n.t('live_and_soon')}</p>
								<h2 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50">{i18n.t('happening_around_you')}</h2>
							</div>
							<div class="-mx-1 max-w-3xl space-y-3 px-1">
								{#each liveEvents.slice(0, 2) as event (event.id)}
									<div class="overflow-hidden rounded-[1.9rem] border border-emerald-100 bg-white p-2 shadow-sm shadow-emerald-100/70 dark:border-emerald-900/60 dark:bg-slate-900 dark:shadow-none">
										<div class="mb-2 flex items-center justify-between gap-2 px-2 pt-1">
											<div class="min-w-0">
												<p class="truncate text-xs font-bold text-slate-500 dark:text-slate-400">{organization.name}</p>
											</div>
											{#if event.eventKind === 'tournament'}
												<span class="shrink-0 rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700 dark:bg-purple-950 dark:text-purple-300">{i18n.t('status_tournament')}</span>
											{/if}
										</div>
										<PublicProfileEventCard {event} />
									</div>
								{/each}
							</div>
						</section>
					{/if}

					<section id="organization-events" class="mx-auto max-w-5xl border-t border-slate-200 px-6 py-5 dark:border-slate-800">
						<div class="mb-3 flex items-center justify-between gap-3">
							<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">{i18n.t('upcoming_events')}</h2>
							{#if upcomingEvents.length > 2}
								<span class="shrink-0 text-xs font-black text-blue-600 dark:text-blue-400 sm:text-sm">
									{i18n.t('showing_events', { count: visibleUpcomingEvents.length, total: upcomingEvents.length })}
								</span>
							{/if}
						</div>

						{#if visibleUpcomingEvents.length === 0}
							<div class="rounded-[1.5rem] border border-dashed border-slate-200 p-5 text-center dark:border-slate-800">
								<p class="font-black text-slate-950 dark:text-slate-50">{i18n.t('no_upcoming_events')}</p>
								<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{i18n.t('no_upcoming_events_sub')}</p>
							</div>
						{:else}
							<div class="-mx-1 max-w-3xl space-y-3 px-1">
								{#each visibleUpcomingEvents as event (event.id)}
									<PublicProfileEventCard {event} />
								{/each}
							</div>
							{#if hasMoreUpcomingEvents}
								<button
									type="button"
									onclick={showMoreEvents}
									class="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-blue-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800"
								>
									{i18n.t('show_more')}
								</button>
							{/if}
						{/if}
					</section>

					{#if pastEvents.length > 0}
						<section class="mx-auto max-w-5xl border-t border-slate-200 px-6 py-5 dark:border-slate-800">
							<div class="mb-3 flex items-center justify-between gap-3">
								<div>
									<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">{i18n.t('past_events')}</h2>
									<p class="text-sm font-bold text-slate-500 dark:text-slate-400">{i18n.t('recent_activity_sub')}</p>
								</div>
								{#if pastEvents.length > 3}
									<span class="shrink-0 text-xs font-black text-blue-600 dark:text-blue-400 sm:text-sm">
										{i18n.t('showing_events', { count: visiblePastEvents.length, total: pastEvents.length })}
									</span>
								{/if}
							</div>

							<div class="-mx-1 max-w-3xl space-y-3 px-1">
								{#each visiblePastEvents as event (event.id)}
									<PublicProfileEventCard
										{event}
										variant="compact"
										contextLabel={`${organization.name} · ${i18n.t('status_past')}`}
									/>
								{/each}
							</div>

							{#if hasMorePastEvents}
								<button
									type="button"
									onclick={showMorePastEvents}
									class="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-blue-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800"
								>
									{i18n.t('show_more')}
								</button>
							{/if}
						</section>
					{/if}

					<section class="mx-auto max-w-5xl border-t border-slate-200 px-6 py-5 dark:border-slate-800">
						<div class="flex items-center justify-between gap-3">
							<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">{i18n.t('about')}</h2>
							<span class={`rounded-full px-3 py-1 text-xs font-black ${verificationClasses()}`}>{verificationLabel()}</span>
						</div>
						<p class="mt-2 max-w-3xl leading-relaxed text-slate-700 dark:text-slate-300">
							{organization.description || i18n.t('no_bio_provided')}
						</p>

						<div class="mt-4 grid gap-4 sm:grid-cols-[1fr_11rem]">
							<div class="space-y-3">
								<div class="flex gap-3">
									<div class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-50 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
											<path stroke-linecap="round" stroke-linejoin="round" d="M12 21s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11Z" />
											<circle cx="12" cy="10" r="2.4" />
										</svg>
									</div>
									<div>
										<p class="font-black text-slate-950 dark:text-slate-50">{organization.publicLocation?.name || i18n.t('home_venue') || 'Home venue'}</p>
										<p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
											{organization.publicLocation?.address || organization.address || organization.city || i18n.t('no_public_venue_set')}
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
										<a href={getWebsiteHref(organization.website)} target="_blank" rel="noreferrer" class="rounded-full bg-blue-50 px-3 py-2 text-blue-700 dark:bg-blue-950 dark:text-blue-300">{i18n.t('website')}</a>
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
								<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">{i18n.t('gallery')}</h2>
								<button type="button" onclick={() => openGallery()} class="text-sm font-black text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
									{i18n.t('view_all_photos')} ›
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
								<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">{i18n.t('reviews')}</h2>
								<p class="text-sm font-bold text-slate-500 dark:text-slate-400">
									{#if reviews.length > 0}
										{i18n.t('rating_from_reviews', { rating: averageRating.toFixed(1), count: reviews.length, reviewText: reviews.length === 1 ? i18n.t('review_singular') : i18n.t('review_plural') })}
									{:else}
										{i18n.t('no_reviews_yet')}
									{/if}
								</p>
							</div>
						</div>

						<div class="mt-4 rounded-[1.5rem] bg-slate-50 p-4 dark:bg-slate-900">
							<p class="font-black text-slate-950 dark:text-slate-50">{i18n.t('rate_this_org')}</p>
							<div class="mt-2 flex gap-1">
								{#each [1, 2, 3, 4, 5] as star}
									<button type="button" onclick={() => (reviewRating = star)} class={`text-2xl transition ${reviewRating >= star ? 'text-yellow-400' : 'text-slate-300 dark:text-slate-700'}`} aria-label={`Rate ${star} stars`}>
										★
									</button>
								{/each}
							</div>
							<textarea bind:value={reviewComment} maxlength={TEXT_LIMITS.reviewComment} rows="2" class="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:focus:ring-blue-950" placeholder={i18n.t('leave_comment_placeholder')}></textarea>
							<button type="button" onclick={submitReview} disabled={reviewSubmitting || reviewRating < 1} class="mt-3 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60">
								{reviewSubmitting ? i18n.t('saving') : i18n.t('save_review')}
							</button>
							{#if reviewMessage}
								<p class={`mt-3 text-sm font-bold ${reviewMessage === 'Review saved.' || reviewMessage === 'Avaliação guardada.' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
									{reviewMessage}
								</p>
							{/if}
						</div>

						{#if reviews.length > 0}
							<div class="mt-4 grid gap-3 sm:grid-cols-2">
								{#each paginatedReviews as review (review.id)}
									<div class="rounded-[1.35rem] bg-slate-50 p-4 dark:bg-slate-900">
										<div class="flex items-center justify-between gap-3">
											<p class="truncate font-black text-slate-950 dark:text-slate-50">{review.authorName ?? i18n.t('rally_user')}</p>
											<p class="shrink-0 text-sm font-black text-yellow-500">{'★'.repeat(review.rating)}</p>
										</div>
										{#if review.comment}
											<ExpandableText text={review.comment} class="mt-2 text-sm font-bold leading-relaxed text-slate-500 dark:text-slate-400" />
										{/if}
										{#if review.replies?.length}
											<div class="mt-3 space-y-2 border-l-2 border-blue-100 pl-3 dark:border-blue-950">
												{#each review.replies.slice(-3) as reply (reply.id)}
													<div class="rounded-2xl bg-white px-3 py-2 dark:bg-slate-950">
														<div class="flex items-center gap-2">
															<p class="text-xs font-black text-slate-950 dark:text-slate-50">{reply.authorName ?? i18n.t('rally_user')}</p>
															{#if reply.authorRole === 'organization'}
																<span class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-blue-700 dark:bg-blue-950 dark:text-blue-300">{i18n.t('org_admin_reply_label')}</span>
															{/if}
														</div>
														<ExpandableText text={reply.comment} initialLines={2} stepLines={2} maxPreviewChars={120} class="mt-1 text-xs font-bold leading-relaxed text-slate-500 dark:text-slate-400" />
													</div>
												{/each}
											</div>
										{/if}
										{#if reviewCanReply()}
											<div class="mt-3">
												{#if replyingToReviewId === review.id}
													<textarea bind:value={replyComment} maxlength={TEXT_LIMITS.reviewReply} rows="2" class="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:focus:ring-blue-950" placeholder={i18n.t('reply_placeholder')}></textarea>
													<div class="mt-2 flex gap-2">
														<button type="button" onclick={() => submitReviewReply(review)} disabled={replySubmitting || !replyComment.trim()} class="rounded-full bg-blue-600 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-700 disabled:opacity-60">
															{replySubmitting ? i18n.t('sending') : i18n.t('reply_btn')}
														</button>
														<button type="button" onclick={() => { replyingToReviewId = null; replyComment = ''; replyMessage = ''; }} class="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-600 transition hover:text-slate-950 dark:bg-slate-950 dark:text-slate-300">
															{i18n.t('cancel')}
														</button>
													</div>
													{#if replyMessage}
														<p class="mt-2 text-xs font-bold text-red-600 dark:text-red-400">{replyMessage}</p>
													{/if}
												{:else}
													<button type="button" onclick={() => { replyingToReviewId = review.id; replyComment = ''; replyMessage = ''; }} class="text-xs font-black text-blue-600 transition hover:text-blue-700 dark:text-blue-400">
														{i18n.t('reply_btn')}
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
										{i18n.t('previous_btn')}
									</button>
									{#each Array(reviewPages) as _, index}
										<button type="button" onclick={() => goToReviewPage(index)} class={`h-8 min-w-8 rounded-full px-3 text-xs font-black transition ${reviewPage === index ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:text-blue-600 dark:bg-slate-950 dark:text-slate-300'}`}>
											{index + 1}
										</button>
									{/each}
									<button type="button" onclick={() => goToReviewPage(reviewPage + 1)} disabled={reviewPage >= reviewPages - 1} class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:text-blue-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
										{i18n.t('next_btn')}
									</button>
								</div>
							{/if}
						{/if}
					</section>
				</div>
			{:else}
		<section class="-mx-6 -mt-5 sm:-mx-6 sm:-mt-8">
			<div class={`relative h-36 overflow-hidden shadow-sm sm:h-48 md:h-64 ${coverPhotoURL ? 'bg-slate-200 dark:bg-slate-900' : 'bg-gradient-to-br from-blue-500 via-blue-700 to-slate-950'}`}>
				{#if coverPhotoURL}
					<img src={coverPhotoURL} alt="" class="h-full w-full object-cover" loading="eager" decoding="async" fetchpriority="high" />
				{/if}
				<div class="absolute inset-0 bg-gradient-to-t from-white via-white/10 to-transparent dark:from-slate-950"></div>
				<input
					bind:this={coverInput}
					type="file"
					accept="image/*"
					class="hidden"
					onchange={handleDraftCoverUpload}
				/>
				<button
					type="button"
					onclick={openEditProfile}
					class="absolute bottom-4 right-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/95 text-slate-950 shadow-lg transition hover:bg-white disabled:opacity-60 md:hidden"
					aria-label={i18n.t('cover_photo')}
				>
					<svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
						<path fill="currentColor" d="M4 17.7V20h2.3L17.1 9.2l-2.3-2.3L4 17.7Zm14.8-10.3c.3-.3.3-.8 0-1.1l-1.1-1.1c-.3-.3-.8-.3-1.1 0l-.9.9L18 8.3l.8-.9Z" />
					</svg>
				</button>
			</div>

			<div class="mx-auto max-w-5xl px-6 pb-5">
				<div class="-mt-12 flex items-end justify-between gap-4 sm:-mt-16">
					<div class="relative z-10 ml-4 grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-white bg-slate-100 text-4xl font-black text-blue-600 shadow-xl dark:border-slate-950 dark:bg-slate-800 dark:text-blue-300 sm:ml-8 sm:h-32 sm:w-32">
						<img src={getOrganizationLogo(organization.logoURL)} alt={organization.name} class="h-full w-full object-cover" />
					</div>
					<div class="relative z-10 hidden gap-2 self-end md:flex">
						<button type="button" onclick={openEditProfile} class="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200" aria-label={i18n.t('edit_org_profile_title')}>
							<svg viewBox="0 0 24 24" class="h-[1.125rem] w-[1.125rem]" aria-hidden="true">
								<path fill="currentColor" d="M4 17.7V20h2.3L17.1 9.2l-2.3-2.3L4 17.7Zm14.8-10.3c.3-.3.3-.8 0-1.1l-1.1-1.1c-.3-.3-.8-.3-1.1 0l-.9.9L18 8.3l.8-.9Z" />
							</svg>
							<span>{i18n.t('edit_profile')}</span>
						</button>
					</div>
				</div>

				<div class="mt-3">
					<div class="flex min-w-0 items-center gap-2">
						<h1 class="min-w-0 text-3xl font-black leading-none tracking-tight text-slate-950 dark:text-slate-50 sm:text-5xl">
							{organization.name}
						</h1>
						{#if organization.verificationStatus === 'verified'}
							<span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-600 text-xs font-black text-white sm:h-7 sm:w-7">✓</span>
						{/if}
					</div>
					<p class="mt-2 text-base font-black text-blue-600 dark:text-blue-400 sm:text-lg">
						{organization.description || `${formatOrganizationType(organization.type)} ${i18n.t('on_rally') || 'on Rally.'}`}
					</p>
					<div class="mt-3 flex flex-wrap gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
						<span class="inline-flex max-w-full items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
							<span class="text-blue-600">⌖</span>
							<span class="truncate">{getOrganizationLocation()}</span>
						</span>
						{#if organization.website}
							<a href={getWebsiteHref(organization.website)} target="_blank" rel="noreferrer" class="inline-flex max-w-full items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-blue-700 ring-1 ring-blue-100 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-900">
								<span>↗</span>
								<span class="truncate">{organization.website.replace(/^https?:\/\//, '')}</span>
							</a>
						{/if}
						<span class={`inline-flex items-center gap-2 rounded-full px-3 py-2 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800 ${verificationClasses()}`}>
							<span>✓</span>
							<span>{verificationLabel()}</span>
						</span>
					</div>
				</div>

				<div class="mt-4 flex gap-2 overflow-x-auto pb-1">
					{#each organizationSports as sport}
						<span class="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm font-bold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
							{formatSport(sport)}
						</span>
					{/each}
					{#if extraSportCount > 0}
						<span class="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm font-bold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
							+ {extraSportCount}{i18n.t('more_suffix')}
						</span>
					{:else if organizationSports.length === 0}
						<span class="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm font-bold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
							{formatOrganizationType(organization.type)}
						</span>
					{/if}
				</div>

				<div class="mt-5 grid grid-cols-3 gap-2 border-y border-slate-200 py-4 text-center dark:border-slate-800 md:mt-7 md:gap-4">
				<div class="rounded-2xl bg-white px-2 py-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
					<p class="mx-auto grid h-8 w-8 place-items-center text-slate-500 dark:text-slate-400">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
							<path stroke-linecap="round" stroke-linejoin="round" d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
						</svg>
					</p>
					<p class="mt-2 text-lg font-black text-slate-950 dark:text-slate-50 md:text-2xl">{events.length}</p>
					<p class="text-xs font-bold text-slate-500 dark:text-slate-400">{i18n.t('events')}</p>
				</div>
				<div class="rounded-2xl bg-white px-2 py-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
					<p class="mx-auto grid h-8 w-8 place-items-center text-slate-500 dark:text-slate-400">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2" />
							<circle cx="12" cy="12" r="9" />
						</svg>
					</p>
					<p class="mt-2 text-lg font-black text-slate-950 dark:text-slate-50 md:text-2xl">{upcomingEvents.length}</p>
					<p class="text-xs font-bold text-slate-500 dark:text-slate-400">{i18n.t('upcoming')}</p>
				</div>
				<div class="rounded-2xl bg-white px-2 py-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
					<p class="mx-auto grid h-8 w-8 place-items-center text-slate-500 dark:text-slate-400">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
							<path stroke-linecap="round" stroke-linejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
							<circle cx="9.5" cy="7" r="4" />
							<path stroke-linecap="round" stroke-linejoin="round" d="M21 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
						</svg>
					</p>
					<p class="mt-2 text-lg font-black text-slate-950 dark:text-slate-50 md:text-2xl">{displayedFollowersCount}</p>
					<p class="text-xs font-bold text-slate-500 dark:text-slate-400">{i18n.t('followers')}</p>
				</div>
			</div>

			{#if !canManage}
				<button type="button" onclick={messageOrganization} disabled={messageLoading} class="mt-5 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 sm:w-auto">
					{messageLoading ? '...' : i18n.t('message')}
				</button>
			{/if}
			</div>
		</section>

		<div class="mt-5 grid max-w-full gap-5 md:mt-8 md:grid-cols-[minmax(0,1fr)_22rem]">
			<section class="min-w-0 max-w-full space-y-5 overflow-hidden">
				{#if liveEvents.length > 0}
					<section>
						<div class="mb-3">
							<p class="text-xs font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">{i18n.t('live_and_soon')}</p>
							<h2 class="mt-1 text-lg font-black text-slate-950 dark:text-slate-50 md:text-2xl">{i18n.t('happening_around_you')}</h2>
						</div>
						<div class="-mx-1 space-y-3 px-1">
							{#each liveEvents.slice(0, 2) as event (event.id)}
								<div class="overflow-hidden rounded-[1.9rem] border border-emerald-100 bg-white p-2 shadow-sm shadow-emerald-100/70 dark:border-emerald-900/60 dark:bg-slate-900 dark:shadow-none">
									<div class="mb-2 flex items-center justify-between gap-2 px-2 pt-1">
										<div class="min-w-0">
											<p class="truncate text-xs font-bold text-slate-500 dark:text-slate-400">{organization.name}</p>
										</div>
										{#if event.eventKind === 'tournament'}
											<span class="shrink-0 rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700 dark:bg-purple-950 dark:text-purple-300">{i18n.t('status_tournament')}</span>
										{/if}
									</div>
									<PublicProfileEventCard {event} />
								</div>
							{/each}
						</div>
					</section>
				{/if}

				<div class="flex items-center justify-between gap-3">
					<div>
						<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 md:text-2xl">{i18n.t('upcoming_events')}</h2>
						<p class="text-sm font-bold text-slate-500 dark:text-slate-400">{i18n.t('events_hosted_by')} {organization.name}</p>
					</div>
					{#if upcomingEvents.length > 2}
						<span class="shrink-0 text-right text-xs font-black text-blue-600 dark:text-blue-400 md:text-sm">
							{i18n.t('showing_events', { count: visibleUpcomingEvents.length, total: upcomingEvents.length })}
						</span>
					{/if}
				</div>

				{#if upcomingEvents.length === 0}
					<div class="rounded-[2rem] bg-white p-8 text-center shadow-sm dark:bg-slate-900">
						<p class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-50 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
							</svg>
						</p>
						<p class="mt-3 font-black text-slate-950 dark:text-slate-50">{i18n.t('no_upcoming_events')}</p>
						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{i18n.t('no_upcoming_events_sub')}</p>
					</div>
				{:else}
					<div class="-mx-1 space-y-3 px-1">
						{#each visibleUpcomingEvents as event (event.id)}
							<PublicProfileEventCard {event} />
						{/each}
					</div>
					{#if hasMoreUpcomingEvents}
						<button
							type="button"
							onclick={showMoreEvents}
							class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-blue-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800"
						>
							{i18n.t('show_more')}
						</button>
					{/if}
				{/if}

				{#if pastEvents.length > 0}
					<section class="border-t border-slate-200 pt-5 dark:border-slate-800">
						<div class="flex items-center justify-between gap-3">
							<div>
								<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 md:text-2xl">{i18n.t('past_events')}</h2>
								<p class="text-sm font-bold text-slate-500 dark:text-slate-400">{i18n.t('recent_activity_sub')}</p>
							</div>
							{#if pastEvents.length > 3}
								<span class="shrink-0 text-right text-xs font-black text-blue-600 dark:text-blue-400 md:text-sm">
									{i18n.t('showing_events', { count: visiblePastEvents.length, total: pastEvents.length })}
								</span>
							{/if}
						</div>

						<div class="-mx-1 mt-3 space-y-3 px-1">
							{#each visiblePastEvents as event (event.id)}
								<PublicProfileEventCard
									{event}
									variant="compact"
									contextLabel={`${organization.name} · ${i18n.t('status_past')}`}
								/>
							{/each}
						</div>

						{#if hasMorePastEvents}
							<button
								type="button"
								onclick={showMorePastEvents}
								class="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-blue-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800"
							>
								{i18n.t('show_more')}
							</button>
						{/if}
					</section>
				{/if}
			</section>

			<aside class="min-w-0 max-w-full space-y-4 overflow-hidden">
				{#if canManage}
					<div class="max-w-full overflow-hidden rounded-[1.7rem] bg-white p-4 shadow-sm dark:bg-slate-900">
						<div class="flex items-center justify-between gap-3">
							<div>
								<h3 class="font-black text-slate-950 dark:text-slate-50">{i18n.t('organization_tools')}</h3>
								<p class="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">{i18n.t('org_tools_description')}</p>
							</div>
						</div>

						<div class="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4 md:grid-cols-2">
							<a href={resolve(`/organizations/${organization.id}/events/create`)} class="grid gap-1 rounded-2xl bg-slate-50 p-3 text-xs font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 hover:text-slate-950 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700 dark:hover:text-white">
								<svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" />
								</svg>
								<span>{i18n.t('event_btn')}</span>
							</a>
							<a href={resolve(`/organizations/${organization.id}/tournaments/create`)} class="grid gap-1 rounded-2xl bg-slate-50 p-3 text-xs font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 hover:text-slate-950 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700 dark:hover:text-white">
								<svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
									<path stroke-linecap="round" stroke-linejoin="round" d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3" />
								</svg>
								<span>{i18n.t('tourney_btn')}</span>
							</a>
							<a href={resolve('/messages')} class="grid gap-1 rounded-2xl bg-slate-50 p-3 text-xs font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 hover:text-slate-950 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700 dark:hover:text-white">
								<svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
									<path stroke-linecap="round" stroke-linejoin="round" d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
								</svg>
								<span>{i18n.t('inbox_btn')}</span>
							</a>
							<a href={resolve(`/organizations/${organization.id}/manage#upcoming-events`)} class="grid gap-1 rounded-2xl bg-slate-950 p-3 text-xs font-black text-white ring-1 ring-slate-950 transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:ring-white dark:hover:bg-slate-200">
								<svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
									<path stroke-linecap="round" stroke-linejoin="round" d="M4 13h3l8 5V6l-8 5H4v2Z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M18 9a4 4 0 0 1 0 6" />
								</svg>
								<span>{i18n.t('promote_btn')}</span>
							</a>
						</div>
					</div>
				{/if}
			</aside>
		</div>

		<section class="mt-8 max-w-full overflow-hidden border-t border-slate-200 pt-5 dark:border-slate-800">
			<div class="flex items-center justify-between gap-3">
				<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 md:text-2xl">{i18n.t('about')}</h2>
				<span class={`rounded-full px-3 py-1 text-xs font-black ${verificationClasses()}`}>{verificationLabel()}</span>
			</div>
			<p class="mt-2 max-w-3xl leading-relaxed text-slate-700 dark:text-slate-300">
				{organization.description || i18n.t('no_bio_provided')}
			</p>

			<div class="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
				<div class="space-y-3">
					<div class="flex gap-3">
						<div class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-50 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 21s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11Z" />
								<circle cx="12" cy="10" r="2.4" />
							</svg>
						</div>
						<div>
							<p class="font-black text-slate-950 dark:text-slate-50">{organization.publicLocation?.name || organization.name}</p>
							<p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
								{organization.publicLocation?.address || organization.address || organization.city || i18n.t('no_public_location_set')}
							</p>
						</div>
					</div>

					<div class="flex flex-wrap gap-2 text-sm font-bold">
						<span class="rounded-full bg-slate-50 px-3 py-2 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
							{formatOrganizationType(organization.type)}
						</span>
						{#if organization.contactEmail}
							<a href={`mailto:${organization.contactEmail}`} class="rounded-full bg-slate-50 px-3 py-2 text-slate-700 transition hover:text-blue-600 dark:bg-slate-900 dark:text-slate-200">✉️ {organization.contactEmail}</a>
						{/if}
						{#if organization.phone}
							<a href={`tel:${organization.phone}`} class="rounded-full bg-slate-50 px-3 py-2 text-slate-700 transition hover:text-blue-600 dark:bg-slate-900 dark:text-slate-200">📞 {organization.phone}</a>
						{/if}
						{#if organization.website}
							<a href={getWebsiteHref(organization.website)} target="_blank" rel="noreferrer" class="rounded-full bg-blue-50 px-3 py-2 text-blue-700 dark:bg-blue-950 dark:text-blue-300">{i18n.t('website')}</a>
						{/if}
					</div>
				</div>

				{#if getVenueMapUrl()}
					<img src={getVenueMapUrl()} alt="Venue map" class="h-32 w-full rounded-2xl object-cover md:h-full" />
				{/if}
			</div>
		</section>

		<section class="mt-8 max-w-full overflow-hidden border-t border-slate-200 pt-5 dark:border-slate-800">
			<div class="flex items-start justify-between gap-2">
				<div>
					<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 md:text-2xl">{i18n.t('gallery')}</h2>
					<p class="max-w-[13rem] text-xs font-bold text-slate-500 dark:text-slate-400 sm:max-w-none sm:text-sm">{i18n.t('photos_shown_public_profile_sub')}</p>
				</div>
				<div class="flex shrink-0 items-center justify-end gap-2">
					{#if galleryPhotoURLs.length > 0}
						<button type="button" onclick={() => openGallery()} class="rounded-2xl bg-white px-3 py-2 text-xs font-black text-blue-600 shadow-sm ring-1 ring-slate-200 transition hover:text-blue-700 dark:bg-slate-900 dark:text-blue-400 dark:ring-slate-800 sm:px-4 sm:py-2.5 sm:text-sm">
							<span class="sm:hidden">{i18n.t('all_filter')}</span>
							<span class="hidden sm:inline">{i18n.t('view_all_photos')}</span>
						</button>
					{/if}
					{#if canManage}
						<input
							bind:this={galleryInput}
							type="file"
							accept="image/*"
							multiple
							class="hidden"
							onchange={handleGalleryUpload}
						/>
						<button type="button" onclick={() => galleryInput?.click()} disabled={uploadingGallery} class="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-black text-white transition hover:bg-blue-700 disabled:opacity-60 sm:px-4 sm:py-2.5 sm:text-sm">
							<span class="sm:hidden">{uploadingGallery ? '...' : '+'}</span>
							<span class="hidden sm:inline">{uploadingGallery ? i18n.t('uploading') : i18n.t('add_photos')}</span>
						</button>
					{/if}
				</div>
			</div>
			{#if galleryPhotoURLs.length > 0}
				<div class="mt-3 flex gap-3 overflow-x-auto pb-4 pt-1">
					{#each galleryPhotoURLs as photoURL}
						<div class="group relative h-28 w-44 shrink-0 overflow-hidden rounded-[1.4rem] shadow-sm sm:h-36 sm:w-56">
							<button type="button" onclick={() => openGallery(photoURL)} class="h-full w-full">
								<img src={photoURL} alt="" class="h-full w-full object-cover" />
							</button>
							{#if canManage}
								<button
									type="button"
									onclick={() => removeGalleryPhoto(photoURL)}
									disabled={removingGalleryPhoto === photoURL}
									class="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-slate-950/75 text-sm font-black text-white opacity-100 shadow-lg transition hover:bg-red-600 disabled:opacity-60 md:opacity-0 md:group-hover:opacity-100"
									aria-label={i18n.t('remove_gallery_photo')}
								>
									×
								</button>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="mt-3 rounded-[1.5rem] border border-dashed border-slate-200 p-5 text-center dark:border-slate-800">
					<p class="font-black text-slate-950 dark:text-slate-50">{i18n.t('no_gallery_photos_yet')}</p>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{i18n.t('add_gallery_photos_desc')}</p>
				</div>
			{/if}
		</section>

		<section class="mt-8 max-w-full overflow-hidden">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 md:text-2xl">{i18n.t('reviews')}</h2>
					<p class="text-sm font-bold text-slate-500 dark:text-slate-400">
						{#if reviews.length > 0}
							{i18n.t('rating_from_reviews', { rating: averageRating.toFixed(1), count: reviews.length, reviewText: reviews.length === 1 ? i18n.t('review_singular') : i18n.t('review_plural') })}
						{:else}
							{i18n.t('no_reviews_yet')}
						{/if}
					</p>
				</div>
			</div>

			{#if !canManage}
				<div class="mt-4 rounded-[1.7rem] bg-white p-4 shadow-sm dark:bg-slate-900">
					<p class="font-black text-slate-950 dark:text-slate-50">{i18n.t('rate_this_org')}</p>
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
						maxlength={TEXT_LIMITS.reviewComment}
						rows="3"
						class="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:ring-blue-950"
						placeholder={i18n.t('leave_comment_placeholder')}
					></textarea>
					<button
						type="button"
						onclick={submitReview}
						disabled={reviewSubmitting || reviewRating < 1}
						class="mt-3 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
					>
						{reviewSubmitting ? i18n.t('saving') : i18n.t('save_review')}
					</button>
				</div>
			{/if}

			{#if reviews.length > 0}
				<div class="mt-4 grid gap-3 sm:grid-cols-2">
					{#each paginatedReviews as review (review.id)}
						<div class="rounded-[1.5rem] bg-white p-4 shadow-sm dark:bg-slate-900">
							<div class="flex items-center justify-between gap-3">
								<p class="truncate font-black text-slate-950 dark:text-slate-50">{review.authorName ?? i18n.t('rally_user')}</p>
								<p class="shrink-0 text-sm font-black text-yellow-500">{'★'.repeat(review.rating)}</p>
							</div>
							{#if review.comment}
								<ExpandableText text={review.comment} class="mt-2 text-sm font-bold leading-relaxed text-slate-500 dark:text-slate-400" />
							{/if}
							{#if review.replies?.length}
								<div class="mt-3 space-y-2 border-l-2 border-blue-100 pl-3 dark:border-blue-950">
									{#each review.replies.slice(-3) as reply (reply.id)}
										<div class="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-950">
											<div class="flex items-center gap-2">
												<p class="text-xs font-black text-slate-950 dark:text-slate-50">{reply.authorName ?? i18n.t('rally_user')}</p>
												{#if reply.authorRole === 'organization'}
													<span class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-blue-700 dark:bg-blue-950 dark:text-blue-300">{i18n.t('org_admin_reply_label')}</span>
												{/if}
											</div>
											<ExpandableText text={reply.comment} initialLines={2} stepLines={2} maxPreviewChars={120} class="mt-1 text-xs font-bold leading-relaxed text-slate-500 dark:text-slate-400" />
										</div>
									{/each}
								</div>
							{/if}
							{#if reviewCanReply()}
								<div class="mt-3">
									{#if replyingToReviewId === review.id}
										<textarea bind:value={replyComment} maxlength={TEXT_LIMITS.reviewReply} rows="2" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:ring-blue-950" placeholder={i18n.t('reply_placeholder')}></textarea>
										<div class="mt-2 flex gap-2">
											<button type="button" onclick={() => submitReviewReply(review)} disabled={replySubmitting || !replyComment.trim()} class="rounded-full bg-blue-600 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-700 disabled:opacity-60">
												{replySubmitting ? i18n.t('sending') : i18n.t('reply_btn')}
											</button>
											<button type="button" onclick={() => { replyingToReviewId = null; replyComment = ''; replyMessage = ''; }} class="rounded-full bg-slate-50 px-4 py-2 text-xs font-black text-slate-600 transition hover:text-slate-950 dark:bg-slate-800 dark:text-slate-300">
												{i18n.t('cancel')}
											</button>
										</div>
										{#if replyMessage}
											<p class="mt-2 text-xs font-bold text-red-600 dark:text-red-400">{replyMessage}</p>
										{/if}
									{:else}
										<button type="button" onclick={() => { replyingToReviewId = review.id; replyComment = ''; replyMessage = ''; }} class="text-xs font-black text-blue-600 transition hover:text-blue-700 dark:text-blue-400">
											{i18n.t('reply_btn')}
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
							{i18n.t('previous_btn')}
						</button>
						{#each Array(reviewPages) as _, index}
							<button type="button" onclick={() => goToReviewPage(index)} class={`h-8 min-w-8 rounded-full px-3 text-xs font-black transition ${reviewPage === index ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:text-blue-600 dark:bg-slate-950 dark:text-slate-300'}`}>
								{index + 1}
							</button>
						{/each}
						<button type="button" onclick={() => goToReviewPage(reviewPage + 1)} disabled={reviewPage >= reviewPages - 1} class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:text-blue-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
							{i18n.t('next_btn')}
						</button>
					</div>
				{/if}
			{/if}
		</section>

		{#if showEditProfile && canManage}
			<div class="fixed inset-0 z-[120] bg-white dark:bg-slate-950 md:flex md:items-center md:justify-center md:bg-slate-950/50 md:p-6 md:backdrop-blur-sm" role="dialog" aria-modal="true">
				<div class="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-slate-950 md:h-auto md:max-h-[calc(100svh-3rem)] md:max-w-3xl md:rounded-[2rem] md:shadow-2xl">
					<div class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
						<div>
							<p class="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">{i18n.t('organization_label') || 'Organization'}</p>
							<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">{i18n.t('edit_profile')}</h2>
						</div>
						<button type="button" onclick={closeEditProfile} class="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xl font-black text-slate-600 transition hover:text-slate-950 dark:bg-slate-900 dark:text-slate-300">
							×
						</button>
					</div>

					<div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
						<div class="mb-4 overflow-hidden rounded-[1.5rem] bg-slate-50 dark:bg-slate-900">
							<div class="h-32 bg-gradient-to-br from-blue-500 via-blue-700 to-slate-950 md:h-44">
								{#if draftCoverPreview || coverPhotoURL}
									<img src={draftCoverPreview || coverPhotoURL} alt="" class="h-full w-full object-cover" />
								{/if}
							</div>
							<div class="flex items-center justify-between gap-3 p-4">
								<div>
									<p class="font-black text-slate-950 dark:text-slate-50">{i18n.t('cover_photo')}</p>
									<p class="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">{i18n.t('cover_photo_help')}</p>
								</div>
								<button type="button" onclick={() => coverInput?.click()} disabled={savingProfile} class="shrink-0 rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-100 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
									{i18n.t('change_btn')}
								</button>
							</div>
						</div>

						<div class="flex items-center gap-4 rounded-[1.5rem] bg-slate-50 p-4 dark:bg-slate-900">
							<div class="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-white text-3xl font-black text-blue-600 shadow-sm dark:bg-slate-800 dark:text-blue-300">
								{#if draftLogoPreview || organization.logoURL}
									<img src={draftLogoPreview || organization.logoURL} alt={organization.name} class="h-full w-full object-cover" />
								{:else}
									{organization.name.charAt(0).toUpperCase()}
								{/if}
							</div>
								<div class="min-w-0 flex-1">
								<p class="font-black text-slate-950 dark:text-slate-50">{i18n.t('profile_photo')}</p>
								<p class="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">{i18n.t('logo_photo_help')}</p>
								<input bind:this={logoInput} type="file" accept="image/*" class="hidden" onchange={handleDraftLogoUpload} />
								<button type="button" onclick={() => logoInput?.click()} disabled={savingProfile} class="mt-3 rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-100 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
									{i18n.t('change_logo') || 'Change logo'}
								</button>
							</div>
						</div>

						<div class="mt-4 grid gap-4 md:grid-cols-2">
							<label class="block">
								<span class="text-sm font-black text-slate-700 dark:text-slate-300">{i18n.t('name')}</span>
								<input bind:value={editName} maxlength={TEXT_LIMITS.organizationName} class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:ring-blue-950" />
							</label>

							<label class="block">
								<span class="text-sm font-black text-slate-700 dark:text-slate-300">{i18n.t('type')}</span>
								<select bind:value={editType} class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:ring-blue-950">
									<option value="company">{i18n.t('org_type_company')}</option>
									<option value="sports_club">{i18n.t('org_type_club')}</option>
									<option value="venue">{i18n.t('org_type_venue')}</option>
									<option value="gym">{i18n.t('org_type_gym')}</option>
									<option value="event_organizer">{i18n.t('org_type_organizer')}</option>
									<option value="university">{i18n.t('org_type_university')}</option>
									<option value="community_group">{i18n.t('org_type_community')}</option>
									<option value="other">{i18n.t('org_type_other')}</option>
								</select>
							</label>

							<label class="block md:col-span-2">
								<span class="text-sm font-black text-slate-700 dark:text-slate-300">{i18n.t('description')}</span>
								<textarea bind:value={editDescription} maxlength={TEXT_LIMITS.organizationDescription} rows="3" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:ring-blue-950" placeholder={i18n.t('org_desc_placeholder')}></textarea>
							</label>

							<label class="block">
								<span class="text-sm font-black text-slate-700 dark:text-slate-300">{i18n.t('contact_email') || 'Contact email'}</span>
								<input bind:value={editContactEmail} type="email" maxlength={TEXT_LIMITS.contactEmail} class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:ring-blue-950" />
							</label>

							<label class="block">
								<span class="text-sm font-black text-slate-700 dark:text-slate-300">{i18n.t('phone') || 'Phone'}</span>
								<input bind:value={editPhone} maxlength={TEXT_LIMITS.phone} class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:ring-blue-950" />
							</label>

							<label class="block">
								<span class="text-sm font-black text-slate-700 dark:text-slate-300">{i18n.t('website')}</span>
								<input bind:value={editWebsite} maxlength={TEXT_LIMITS.website} class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:ring-blue-950" />
							</label>

							<label class="block">
								<span class="text-sm font-black text-slate-700 dark:text-slate-300">{i18n.t('city')}</span>
								<input bind:value={editCity} maxlength={TEXT_LIMITS.city} class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:ring-blue-950" />
							</label>

							<label class="block md:col-span-2">
								<span class="text-sm font-black text-slate-700 dark:text-slate-300">{i18n.t('address')}</span>
								<input bind:value={editAddress} maxlength={TEXT_LIMITS.address} class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:ring-blue-950" />
							</label>

							<label class="block md:col-span-2">
								<span class="text-sm font-black text-slate-700 dark:text-slate-300">{i18n.t('tax_id') || 'NIF'}</span>
								<input bind:value={editNif} maxlength={TEXT_LIMITS.taxId} class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:ring-blue-950" />
							</label>
						</div>

						<div class="mt-5 rounded-[1.5rem] bg-slate-50 p-4 dark:bg-slate-900">
							<p class="font-black text-slate-950 dark:text-slate-50">{i18n.t('sports_shown_publicly')}</p>
							<p class="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">{i18n.t('sports_shown_help')}</p>
							<div class="mt-3 flex flex-wrap gap-2">
								{#each availableSports as sport}
									<button
										type="button"
										onclick={() => toggleOrganizationSport(sport)}
										class={`rounded-full px-3.5 py-2 text-sm font-black transition ${
											selectedOrganizationSports.includes(sport)
												? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
												: 'bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-blue-950 dark:hover:text-blue-300'
										}`}
									>
										{formatSport(sport)}
									</button>
								{/each}
							</div>
						</div>
					</div>

					<div class="border-t border-slate-200 p-4 dark:border-slate-800">
						<div class="flex gap-3">
							<button type="button" onclick={closeEditProfile} class="flex-1 rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
								{i18n.t('cancel')}
							</button>
							<button type="button" onclick={saveEditableOrganizationProfile} disabled={savingProfile} class="flex-1 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60">
								{savingProfile ? i18n.t('saving') : i18n.t('save')}
							</button>
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if showOrganizationSettings}
			<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true">
				<div class="max-h-[calc(100svh-2rem)] w-full max-w-md overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl dark:bg-slate-900">
					<div class="flex items-start justify-between gap-4">
						<div>
							<p class="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">{i18n.t('organization_label') || 'Organization'}</p>
							<h2 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50">{i18n.t('settings')}</h2>
						</div>
						<button type="button" onclick={() => (showOrganizationSettings = false)} class="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-lg font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">×</button>
					</div>

					<div class="mt-5 space-y-3">
						<button type="button" onclick={toggleOrganizationNotifications} class="flex w-full items-start justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 text-left dark:bg-slate-800">
							<span class="min-w-0 flex-1">
								<span class="block font-black text-slate-950 dark:text-slate-50">{i18n.t('notifications')}</span>
								<span class="text-sm font-bold text-slate-500 dark:text-slate-400">{orgNotificationsEnabled ? i18n.t('enabled') : i18n.t('disabled')} {i18n.t('for_this_org')}</span>
							</span>
							<span class={`mt-1 h-7 w-12 shrink-0 rounded-full p-1 transition ${orgNotificationsEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
								<span class={`block h-5 w-5 rounded-full bg-white transition ${orgNotificationsEnabled ? 'translate-x-5' : ''}`}></span>
							</span>
						</button>

						<button type="button" onclick={toggleOrganizationDarkMode} class="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-left dark:bg-slate-800">
							<span>
								<span class="block font-black text-slate-950 dark:text-slate-50">{i18n.t('appearance') || 'Appearance'}</span>
								<span class="text-sm font-bold text-slate-500 dark:text-slate-400">{orgDarkModeEnabled ? i18n.t('dark_mode') : i18n.t('light_mode')}</span>
							</span>
							<span class="text-xl">{orgDarkModeEnabled ? '🌙' : '☀️'}</span>
						</button>

						<a href={resolve(`/organizations/${organization.id}/manage`)} class="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 font-black text-slate-950 dark:bg-slate-800 dark:text-slate-50">
							{i18n.t('edit_org_btn') || 'Edit organization'}
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
							<p class="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">{i18n.t('gallery')}</p>
							<h2 class="text-lg font-black text-slate-950 dark:text-slate-50">{i18n.t('org_photos_title', { name: organization.name })}</h2>
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

	{#if showCropper && organization}
		<ImageCropperModal
			imageSrc={cropperImageSrc}
			shape={cropperTarget === 'logo' ? 'circle' : 'rect'}
			aspectRatio={cropperTarget === 'logo' ? 1 : 16 / 9}
			onConfirm={(croppedFile) => {
				showCropper = false;
				if (cropperTarget === 'logo') {
					if (draftLogoPreview) URL.revokeObjectURL(draftLogoPreview);
					draftLogoFile = croppedFile;
					draftLogoPreview = URL.createObjectURL(croppedFile);
				} else {
					if (draftCoverPreview) URL.revokeObjectURL(draftCoverPreview);
					draftCoverFile = croppedFile;
					draftCoverPreview = URL.createObjectURL(croppedFile);
				}
				if (cropperInputRef) cropperInputRef.value = '';
			}}
			onCancel={() => {
				showCropper = false;
				if (cropperInputRef) cropperInputRef.value = '';
			}}
		/>
	{/if}
</main>
