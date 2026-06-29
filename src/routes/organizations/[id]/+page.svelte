<!--src/routes/organizations/[id]/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
	import { auth } from '$lib/firebase';
	import type { EventStatus, Organization, SportEvent } from '$lib/schema';
	import {
		followOrganization,
		getOrganizationById,
		isFollowingOrganization,
		isOrganizationAdmin,
		unfollowOrganization
	} from '$lib/services/organization.service';
	import { getEventsCreatedByOrganization, getUpcomingEvents } from '$lib/services/event.service';
	import { getOrCreateOrganizationConversation } from '$lib/services/chat.service';
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

	let upcomingEvents = $derived(getUpcomingEvents(events));
	let promotedEvents = $derived(
		upcomingEvents.filter((event) => event.isPromoted && event.promotionStatus === 'active')
	);
	let normalUpcomingEvents = $derived(
		upcomingEvents.filter((event) => !(event.isPromoted && event.promotionStatus === 'active'))
	);

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
			canManage = isOrganizationAdmin(loadedOrganization, userId);

			const [loadedEvents, loadedFollowing] = await Promise.all([
				getEventsCreatedByOrganization(loadedOrganization.id),
				isFollowingOrganization({ organizationId: loadedOrganization.id, userId })
			]);

			events = loadedEvents;
			following = loadedFollowing;
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
				organization = {
					...organization,
					followersCount: Math.max((organization.followersCount ?? 1) - 1, 0)
				};
			} else {
				await followOrganization({ organizationId: organization.id, userId: currentUserId });
				following = true;
				organization = { ...organization, followersCount: (organization.followersCount ?? 0) + 1 };
			}
		} catch (err) {
			console.error('Follow organization error:', err);
			error = getFriendlyErrorMessage(err, 'Could not update follow status.');
		} finally {
			actionLoading = false;
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
		<section class="max-w-full px-0 md:px-0">
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
					<p class="text-lg font-black text-slate-950 dark:text-slate-50 md:text-2xl">{organization.followersCount ?? 0}</p>
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
					<div class="space-y-3">
						{#each promotedEvents as event (event.id)}
							<a href={resolve(`/events/${event.id}`)} class="group flex max-w-full gap-3 overflow-hidden rounded-[1.45rem] bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900 md:rounded-[1.6rem] md:p-4">
								<div class="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-blue-50 dark:bg-blue-950 sm:w-24 md:h-24 md:w-32">
									{#if getMiniMapUrl(event)}
										<img src={getMiniMapUrl(event)} alt={event.location.name} class="h-full w-full object-cover" />
									{:else if event.groupPhotoURL}
										<img src={event.groupPhotoURL} alt={event.title} class="h-full w-full object-cover" />
									{:else}
										<div class="grid h-full w-full place-items-center text-2xl font-black text-blue-600 dark:text-blue-300">{event.title.charAt(0).toUpperCase()}</div>
									{/if}
									<span class="absolute left-2 top-2 rounded-full bg-blue-600 px-2 py-1 text-[10px] font-black uppercase text-white">Promoted</span>
								</div>
								<div class="min-w-0 flex-1 py-1">
									<div class="flex min-w-0 items-center gap-2">
										<p class="min-w-0 flex-1 truncate text-sm font-black text-slate-950 dark:text-slate-50 md:text-base">{event.title}</p>
										<span class="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">{formatCapacity(event)}</span>
									</div>
									<p class="mt-1 truncate text-xs font-bold text-slate-500 dark:text-slate-400">{formatSport(event.sport)} · {event.location.name}</p>
									<p class="mt-2 text-xs font-black text-slate-400 dark:text-slate-500">{formatDate(event.startAt)} · {formatPrice(event)}</p>
								</div>
							</a>
						{/each}

						{#each normalUpcomingEvents as event (event.id)}
							<a href={resolve(`/events/${event.id}`)} class="group flex max-w-full gap-3 overflow-hidden rounded-[1.45rem] bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900 md:rounded-[1.6rem] md:p-4">
								<div class="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800 sm:w-24 md:h-24 md:w-32">
									{#if getMiniMapUrl(event)}
										<img src={getMiniMapUrl(event)} alt={event.location.name} class="h-full w-full object-cover" />
									{:else if event.groupPhotoURL}
										<img src={event.groupPhotoURL} alt={event.title} class="h-full w-full object-cover" />
									{:else}
										<div class="grid h-full w-full place-items-center text-2xl font-black text-blue-600 dark:text-blue-300">{event.title.charAt(0).toUpperCase()}</div>
									{/if}
									<span class="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-slate-700 shadow-sm dark:bg-slate-950/90 dark:text-slate-200">{formatShortDate(event.startAt)}</span>
								</div>
								<div class="min-w-0 flex-1 py-1">
									<div class="flex min-w-0 items-center gap-2">
										<p class="min-w-0 flex-1 truncate text-sm font-black text-slate-950 dark:text-slate-50 md:text-base">{event.title}</p>
										<span class="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{getStatusLabel(event)}</span>
									</div>
									<p class="mt-1 truncate text-xs font-bold text-slate-500 dark:text-slate-400">{formatSport(event.sport)} · {event.location.name}</p>
									<p class="mt-2 text-xs font-black text-slate-400 dark:text-slate-500">{formatCapacity(event)} · {formatPrice(event)}</p>
								</div>
							</a>
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
</main>
