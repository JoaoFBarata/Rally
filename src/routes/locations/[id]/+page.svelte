<!--src/routes/locations/[id]/+page.svelte-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth } from '$lib/firebase';
	import type { SportEvent, UserProfile, Venue, VenueReview, VenueReviewSource } from '$lib/schema';
	import {
		getVenueById,
		getVenueReviews,
		getEventsNearVenue,
		getRatingSummary,
		submitVenueReview
	} from '$lib/services/venue.service';
	import { getUserProfile } from '$lib/services/user.service';
	import { formatSport, getSportBackgroundImage, getMiniMapUrl } from '$lib/utils/format.utils';
	import { goBack } from '$lib/utils/navigation';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { TEXT_LIMITS } from '$lib/constants/text-limits';
	import EventCard from '$lib/components/EventCard.svelte';
	import { i18n } from '$lib/services/i18n.svelte';

	let venue = $state<Venue | null>(null);
	let currentProfile = $state<UserProfile | null>(null);
	let reviews = $state<VenueReview[]>([]);
	let pastEvents = $state<SportEvent[]>([]);
	let upcomingEvents = $state<SportEvent[]>([]);
	let reviewSource = $state<VenueReviewSource>('official');
	let loading = $state(true);
	let error = $state('');

	let reviewRating = $state(5);
	let reviewComment = $state('');
	let reviewSubmitting = $state(false);
	let reviewMessage = $state('');

	let visibleReviews = $derived(reviews.filter((review) => review.source === reviewSource));
	let officialCount = $derived(reviews.filter((review) => review.source === 'official').length);
	let rallyUserCount = $derived(reviews.filter((review) => review.source === 'rally_user').length);
	let overallRating = $derived(getRatingSummary(reviews));

	async function loadVenue(userId: string) {
		loading = true;
		error = '';
		try {
			const venueId = page.params.id;
			if (!venueId) {
				error = i18n.t('venue_not_found');
				return;
			}

			const loadedVenue = await getVenueById(venueId);
			if (!loadedVenue) {
				error = i18n.t('venue_not_found');
				return;
			}

			venue = loadedVenue;

			const [loadedReviews, events, profile] = await Promise.all([
				getVenueReviews(venueId),
				getEventsNearVenue(loadedVenue),
				getUserProfile(userId)
			]);

			reviews = loadedReviews;
			pastEvents = events.past;
			upcomingEvents = events.upcoming;
			currentProfile = profile;
		} catch (err) {
			console.error('Load venue error:', err);
			error = i18n.t('venue_not_found');
		} finally {
			loading = false;
		}
	}

	async function handleSubmitReview() {
		const currentUser = auth.currentUser;
		if (!currentUser || !venue || !reviewComment.trim()) return;

		reviewSubmitting = true;
		reviewMessage = '';

		try {
			await submitVenueReview({
				venueId: venue.id,
				userId: currentUser.uid,
				rating: reviewRating,
				comment: reviewComment,
				authorName: currentProfile?.displayName || currentUser.displayName || i18n.t('rally_user'),
				authorPhotoURL: currentProfile?.photoURL ?? currentUser.photoURL ?? null
			});

			reviews = await getVenueReviews(venue.id);
			reviewComment = '';
			reviewSource = 'rally_user';
		} catch (err) {
			console.error('Submit venue review error:', err);
			reviewMessage = getFriendlyErrorMessage(err, 'Could not save your review.');
		} finally {
			reviewSubmitting = false;
		}
	}

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, async (user) => {
			if (!user) {
				await goto(resolve('/login'));
				return;
			}
			await loadVenue(user.uid);
		});

		return () => unsubscribe();
	});
</script>

<main class="mx-auto w-full max-w-4xl px-5 py-5 pb-28 sm:px-8 sm:py-8">
	<button
		type="button"
		onclick={() => goBack(`${resolve('/explore')}?mode=venues`)}
		class="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-slate-950 transition hover:bg-white/80 dark:text-slate-50 dark:hover:bg-slate-900"
		aria-label={i18n.t('back_to_locations')}
	>
		<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8">
			<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
		</svg>
	</button>

	{#if loading}
		<div class="mt-4 h-64 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800"></div>
	{:else if error || !venue}
		<div
			class="mt-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
		>
			{error || i18n.t('venue_not_found')}
		</div>
	{:else}
		<section class="mt-2 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
			<div class="relative aspect-[16/9] w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
				<img
					src={venue.photoURL || getSportBackgroundImage(venue.sports[0])}
					alt={venue.name}
					class="h-full w-full object-cover"
				/>
				<div class="absolute inset-x-3 top-3 flex flex-wrap gap-1.5">
					{#if venue.verificationStatus === 'verified'}
						<span class="rounded-full bg-emerald-600 px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-lg">
							{i18n.t('verified')}
						</span>
					{:else}
						<span class="rounded-full bg-slate-900/80 px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-lg backdrop-blur">
							{i18n.t('not_verified')}
						</span>
					{/if}
				</div>
			</div>

			<div class="p-5 sm:p-6">
				<div class="flex flex-wrap gap-1.5">
					{#each venue.sports as sport (sport)}
						<span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-900/60">
							{formatSport(sport)}
						</span>
					{/each}
				</div>

				<h1 class="mt-2 text-2xl font-black text-slate-950 dark:text-slate-50 sm:text-3xl">
					{venue.name}
				</h1>

				<p class="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
					📍 {venue.address}, {venue.city}
				</p>

				{#if overallRating.count > 0}
					<p class="mt-2 text-sm font-black text-yellow-500">
						★ {overallRating.average.toFixed(1)}
						<span class="font-bold text-slate-400 dark:text-slate-500">
							({overallRating.count})
						</span>
					</p>
				{/if}

				{#if venue.description}
					<p class="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
						{venue.description}
					</p>
				{/if}

				<div class="mt-5 grid gap-4 sm:grid-cols-[1fr_11rem]">
					<div class="flex flex-wrap items-center gap-3">
						<a
							href={`${resolve('/events/create')}?venueName=${encodeURIComponent(venue.name)}&address=${encodeURIComponent(`${venue.address}, ${venue.city}`)}&lat=${venue.lat}&lng=${venue.lng}&sport=${venue.sports[0]}`}
							class="rounded-full bg-blue-600 px-4 py-2 text-xs font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
						>
							{i18n.t('schedule_event_here')}
						</a>
						<a
							href={`https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`}
							target="_blank"
							rel="noreferrer"
							class="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
						>
							{i18n.t('get_directions')}
						</a>
						{#if venue.website}
							<a
								href={venue.website}
								target="_blank"
								rel="noreferrer"
								class="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
							>
								{i18n.t('website')}
							</a>
						{/if}
					</div>

					{#if getMiniMapUrl(venue.lat, venue.lng)}
						<img
							src={getMiniMapUrl(venue.lat, venue.lng, 280, 120, 14)}
							alt={venue.address}
							class="h-[7.5rem] w-full rounded-2xl object-cover sm:w-[17.5rem]"
						/>
					{/if}
				</div>
			</div>
		</section>

		{#if upcomingEvents.length > 0}
			<section class="mt-6">
				<h2 class="text-lg font-black text-slate-950 dark:text-slate-50">
					{i18n.t('upcoming_events_here')}
				</h2>
				<div class="mt-3 space-y-3">
					{#each upcomingEvents as event (event.id)}
						<EventCard {event} variant="profile" />
					{/each}
				</div>
			</section>
		{/if}

		{#if pastEvents.length > 0}
			<section class="mt-6">
				<h2 class="text-lg font-black text-slate-950 dark:text-slate-50">
					{i18n.t('past_events_here')}
				</h2>
				<div class="mt-3 space-y-3">
					{#each pastEvents.slice(0, 6) as event (event.id)}
						<EventCard {event} variant="profile" />
					{/each}
				</div>
			</section>
		{/if}

		{#if upcomingEvents.length === 0 && pastEvents.length === 0}
			<p class="mt-6 text-sm font-bold text-slate-400 dark:text-slate-500">
				{i18n.t('no_events_here_yet')}
			</p>
		{/if}

		<section class="mt-8">
			<h2 class="text-lg font-black text-slate-950 dark:text-slate-50">{i18n.t('reviews')}</h2>

			<div class="mt-3 inline-flex rounded-full bg-slate-100 p-1 dark:bg-slate-800">
				<button
					type="button"
					onclick={() => (reviewSource = 'official')}
					class={`rounded-full px-4 py-2 text-xs font-black transition ${
						reviewSource === 'official'
							? 'bg-white text-slate-950 shadow-md dark:bg-slate-700 dark:text-slate-50'
							: 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
					}`}
				>
					{i18n.t('official_source')} ({officialCount})
				</button>
				<button
					type="button"
					onclick={() => (reviewSource = 'rally_user')}
					class={`rounded-full px-4 py-2 text-xs font-black transition ${
						reviewSource === 'rally_user'
							? 'bg-white text-slate-950 shadow-md dark:bg-slate-700 dark:text-slate-50'
							: 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
					}`}
				>
					{i18n.t('rally_users_source')} ({rallyUserCount})
				</button>
			</div>

			{#if reviewSource === 'rally_user'}
				<div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
					<p class="text-sm font-black text-slate-950 dark:text-slate-50">{i18n.t('save_review')}</p>
					<div class="mt-2 flex gap-1">
						{#each [1, 2, 3, 4, 5] as star (star)}
							<button
								type="button"
								onclick={() => (reviewRating = star)}
								class="text-2xl leading-none"
								aria-label={`${star} stars`}
							>
								<span class={star <= reviewRating ? 'text-yellow-500' : 'text-slate-300 dark:text-slate-700'}>★</span>
							</button>
						{/each}
					</div>
					<textarea
						bind:value={reviewComment}
						maxlength={TEXT_LIMITS.reviewComment}
						rows="2"
						class="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:focus:ring-blue-950"
						placeholder={i18n.t('leave_comment_placeholder')}
					></textarea>
					{#if reviewMessage}
						<p class="mt-2 text-xs font-bold text-red-600 dark:text-red-400">{reviewMessage}</p>
					{/if}
					<button
						type="button"
						onclick={handleSubmitReview}
						disabled={reviewSubmitting || !reviewComment.trim()}
						class="mt-3 rounded-full bg-blue-600 px-5 py-2 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
					>
						{reviewSubmitting ? i18n.t('saving') : i18n.t('save_review')}
					</button>
				</div>
			{/if}

			<div class="mt-4 space-y-3">
				{#if visibleReviews.length === 0}
					<p class="text-sm font-bold text-slate-400 dark:text-slate-500">
						{reviewSource === 'official' ? i18n.t('no_official_reviews_yet') : i18n.t('no_rally_reviews_yet')}
					</p>
				{:else}
					{#each visibleReviews as review (review.id)}
						<div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
							<div class="flex items-center justify-between gap-3">
								<p class="font-black text-slate-950 dark:text-slate-50">{review.authorName}</p>
								<p class="shrink-0 text-sm font-black text-yellow-500">{'★'.repeat(review.rating)}</p>
							</div>
							<p class="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">{review.comment}</p>
						</div>
					{/each}
				{/if}
			</div>
		</section>
	{/if}
</main>
