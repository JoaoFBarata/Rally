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
		unfollowOrganization
	} from '$lib/services/organization.service';
	import { getEventsCreatedByOrganization, getUpcomingEvents } from '$lib/services/event.service';

	let organization = $state<Organization | null>(null);
	let events = $state<SportEvent[]>([]);
	let currentUserId = $state('');
	let following = $state(false);
	let loading = $state(true);
	let actionLoading = $state(false);
	let error = $state('');

	let upcomingEvents = $derived(getUpcomingEvents(events));
	let pastEvents = $derived(events.filter((event) => !upcomingEvents.some((item) => item.id === event.id)));

	function formatType(type: string) {
		return type.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
	}

	async function loadOrganization(userId: string) {
		loading = true;
		error = '';

		try {
			const organizationId = page.params.id;

			const loadedOrganization = await getOrganizationById(organizationId);

			if (!loadedOrganization) {
				error = 'Organization not found.';
				return;
			}

			organization = loadedOrganization;

			const [loadedEvents, loadedFollowing] = await Promise.all([
				getEventsCreatedByOrganization(organizationId),
				isFollowingOrganization({ organizationId, userId })
			]);

			events = loadedEvents;
			following = loadedFollowing;
		} catch (err) {
			console.error('Organization page error:', err);
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
				await unfollowOrganization({ organizationId: organization.id, userId: currentUserId });
				following = false;
				organization = {
					...organization,
					followersCount: Math.max((organization.followersCount ?? 1) - 1, 0)
				};
			} else {
				await followOrganization({ organizationId: organization.id, userId: currentUserId });
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
			await loadOrganization(user.uid);
		});

		return unsubscribe;
	});
</script>

<main class="mx-auto max-w-6xl px-5 py-8">
	<a
		href={resolve('/explore')}
		class="inline-flex rounded-full bg-blue-50 px-5 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
	>
		← Back
	</a>

	{#if loading}
		<section class="mt-8 rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
			<p class="text-slate-500 dark:text-slate-400">Loading organization...</p>
		</section>
	{:else if error && !organization}
		<section class="mt-8 rounded-4xl border border-red-200 bg-red-50 p-8 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
			{error}
		</section>
	{:else if organization}
		<section class="mt-8 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
			<div class="h-36 bg-gradient-to-br from-slate-950 via-blue-700 to-sky-400"></div>

			<div class="-mt-14 px-7 pb-7">
				<div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
					<div class="flex items-end gap-4">
						<div class="flex h-28 w-28 items-center justify-center overflow-hidden rounded-[2rem] border-4 border-white bg-slate-100 text-4xl font-black text-slate-700 shadow-lg dark:border-slate-900 dark:bg-slate-800 dark:text-slate-200">
							{#if organization.logoURL}
								<img src={organization.logoURL} alt={organization.name} class="h-full w-full object-cover" />
							{:else}
								{organization.name.charAt(0)}
							{/if}
						</div>

						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<h1 class="truncate text-4xl font-black tracking-tight text-slate-950 dark:text-slate-50">
									{organization.name}
								</h1>

								{#if organization.verificationStatus === 'verified'}
									<span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">
										✓ Verified
									</span>
								{:else}
									<span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">
										Not verified
									</span>
								{/if}
							</div>

							<p class="mt-1 text-sm font-bold text-blue-600 dark:text-blue-400">
								@{organization.handle} · {formatType(organization.type)}
							</p>
						</div>
					</div>

					<div class="flex flex-wrap gap-2">
						{#if organization.adminIds.includes(currentUserId)}
							<a href={resolve(`/organizations/${organization.id}/manage`)} class="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
								Manage
							</a>
						{/if}

						<button
							type="button"
							onclick={toggleFollow}
							disabled={actionLoading}
							class={following
								? 'rounded-2xl bg-slate-100 px-5 py-3 font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
								: 'rounded-2xl bg-blue-600 px-5 py-3 font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60'}
						>
							{actionLoading ? 'Loading...' : following ? 'Following' : 'Follow'}
						</button>
					</div>
				</div>

				<div class="mt-7 grid gap-3 sm:grid-cols-3">
					<div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
						<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Followers</p>
						<p class="mt-2 font-black text-slate-950 dark:text-slate-50">{organization.followersCount ?? 0}</p>
					</div>

					<div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
						<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">City</p>
						<p class="mt-2 font-black text-slate-950 dark:text-slate-50">{organization.city || 'Not set'}</p>
					</div>

					<div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
						<p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Events</p>
						<p class="mt-2 font-black text-slate-950 dark:text-slate-50">{events.length}</p>
					</div>
				</div>

				{#if organization.description}
					<div class="mt-7">
						<h2 class="text-lg font-black text-slate-950 dark:text-slate-50">About</h2>
						<p class="mt-2 leading-relaxed text-slate-600 dark:text-slate-300">{organization.description}</p>
					</div>
				{/if}

				{#if error}
					<div class="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div>
				{/if}
			</div>
		</section>

		<section class="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
			<div class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
				<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Upcoming events</h2>

				{#if upcomingEvents.length === 0}
					<p class="mt-4 text-sm text-slate-500 dark:text-slate-400">No upcoming events from this organization.</p>
				{:else}
					<div class="mt-5 space-y-4">
						{#each upcomingEvents as event (event.id)}
							<EventCard {event} />
						{/each}
					</div>
				{/if}
			</div>

			<aside class="space-y-6">
				<section class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Trust</h2>
					<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
						{organization.verificationStatus === 'verified'
							? 'This organization has been verified by Rally. Official paid events are allowed.'
							: 'This organization is not verified yet. Official paid events should remain locked.'}
					</p>
				</section>

				<section class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Past activity</h2>
					<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
						{pastEvents.length} past or cancelled events.
					</p>
				</section>
			</aside>
		</section>
	{/if}
</main>
