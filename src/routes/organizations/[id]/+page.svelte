<!--src/routes/organizations/[id]/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth } from '$lib/firebase';
	import type { Organization, SportEvent } from '$lib/schema';
	import EventCard from '$lib/components/EventCard.svelte';
	import {
		followOrganization,
		getOrganizationById,
		isFollowingOrganization,
		isOrganizationAdmin,
		unfollowOrganization
	} from '$lib/services/organization.service';
	import {
		getEventsCreatedByOrganization,
		getUpcomingEvents
	} from '$lib/services/event.service';

	let organization = $state<Organization | null>(null);
	let events = $state<SportEvent[]>([]);
	let currentUserId = $state('');
	let loading = $state(true);
	let actionLoading = $state(false);
	let following = $state(false);
	let canManage = $state(false);
	let error = $state('');

	let upcomingEvents = $derived(getUpcomingEvents(events));

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

	async function loadPage(userId: string) {
		loading = true;
		error = '';

		try {
			const organizationIdFromUrl = page.params.id;

			const loadedOrganization = await getOrganizationById(organizationIdFromUrl);

			if (!loadedOrganization) {
				error = 'Organization not found.';
				return;
			}

			organization = loadedOrganization;
			canManage = isOrganizationAdmin(loadedOrganization, userId);

			const [loadedEvents, loadedFollowing] = await Promise.all([
				getEventsCreatedByOrganization(loadedOrganization.id),
				isFollowingOrganization({
					organizationId: loadedOrganization.id,
					userId
				})
			]);

			events = loadedEvents;
			following = loadedFollowing;
		} catch (err) {
			console.error('Organization public page error:', err);
			error = err instanceof Error ? err.message : 'Could not load organization.';
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
				await unfollowOrganization({
					organizationId: organization.id,
					userId: currentUserId
				});

				following = false;
				organization = {
					...organization,
					followersCount: Math.max((organization.followersCount ?? 1) - 1, 0)
				};
			} else {
				await followOrganization({
					organizationId: organization.id,
					userId: currentUserId
				});

				following = true;
				organization = {
					...organization,
					followersCount: (organization.followersCount ?? 0) + 1
				};
			}
		} catch (err) {
			console.error('Follow organization error:', err);
			error = err instanceof Error ? err.message : 'Could not update follow status.';
		} finally {
			actionLoading = false;
		}
	}

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, async (user) => {
			if (!user) {
				await goto(resolve('/login'));
				return;
			}

			currentUserId = user.uid;
			await loadPage(user.uid);
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
		<section
			class="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
		>
			<div class="h-36 bg-gradient-to-br from-blue-700 via-blue-600 to-sky-400"></div>

			<div class="px-7 pb-8">
				<div class="-mt-14 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
					<div class="min-w-0">
						<div
							class="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-slate-100 text-5xl font-black text-blue-600 shadow-xl dark:border-slate-900 dark:bg-slate-800 dark:text-blue-300"
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

						<div class="mt-5 min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<h1 class="break-words text-4xl font-black tracking-tight text-slate-950 dark:text-slate-50">
									{organization.name}
								</h1>

								<span
									class={`rounded-full px-3 py-1 text-xs font-black ${verificationClasses()}`}
								>
									{verificationLabel()}
								</span>
							</div>

							<p class="mt-2 font-bold text-slate-500 dark:text-slate-400">
								{formatOrganizationType(organization.type)}
							</p>
						</div>
					</div>

					<div class="flex flex-wrap gap-2">
						{#if canManage}
							<a
								href={resolve(`/organizations/${organization.id}/manage`)}
								class="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
							>
								Manage
							</a>
						{:else}
							<button
								type="button"
								onclick={toggleFollow}
								disabled={actionLoading}
								class="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
							>
								{actionLoading ? 'Updating...' : following ? 'Following' : 'Follow'}
							</button>
						{/if}
					</div>
				</div>

				<div class="mt-7 grid gap-3 md:grid-cols-3">
					<div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
						<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
							Followers
						</p>
						<p class="mt-2 text-2xl font-black text-slate-950 dark:text-slate-50">
							{organization.followersCount ?? 0}
						</p>
					</div>

					<div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
						<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
							Upcoming
						</p>
						<p class="mt-2 text-2xl font-black text-slate-950 dark:text-slate-50">
							{upcomingEvents.length}
						</p>
					</div>

					<div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
						<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
							Trust
						</p>
						<p class="mt-2 font-black text-slate-950 dark:text-slate-50">
							{verificationLabel()}
						</p>
					</div>
				</div>

				<div class="mt-8">
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">
						About
					</h2>

					<p class="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">
						{organization.description || 'This organization has not added a description yet.'}
					</p>

					<div class="mt-5 flex flex-wrap gap-3 text-sm font-bold text-slate-500 dark:text-slate-400">
						{#if organization.contactEmail}
							<span>✉ {organization.contactEmail}</span>
						{/if}

						{#if organization.phone}
							<span>☎ {organization.phone}</span>
						{/if}

						{#if organization.city}
							<span>📍 {organization.city}</span>
						{/if}

						{#if organization.website}
							<a
								href={organization.website}
								target="_blank"
								rel="noreferrer"
								class="text-blue-600 hover:text-blue-700 dark:text-blue-400"
							>
								Website
							</a>
						{/if}
					</div>
				</div>
			</div>
		</section>

		<section class="mt-10">
			<div class="mb-5 flex items-center justify-between">
				<h2 class="text-2xl font-black text-slate-950 dark:text-slate-50">
					Upcoming events
				</h2>

				{#if canManage}
					<a
						href={resolve(`/organizations/${organization.id}/events/create`)}
						class="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
					>
						Create event
					</a>
				{/if}
			</div>

			{#if upcomingEvents.length === 0}
				<div
					class="rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
				>
					No upcoming events from this organization yet.
				</div>
			{:else}
				<div class="grid gap-4 lg:grid-cols-2">
					{#each upcomingEvents as event (event.id)}
						<EventCard {event} />
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</main>