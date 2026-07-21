<!-- src/routes/admin/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth, db } from '$lib/firebase';
	import { onAuthStateChanged } from 'firebase/auth';
	import { collection, getCountFromServer, onSnapshot, query, where } from 'firebase/firestore';
	import {
		approveOrganizationVerification,
		getOrganizationById,
		getPendingVerificationRequests,
		rejectOrganizationVerification
	} from '$lib/services/organization.service';
	import type { Organization, OrganizationVerificationRequest, Venue } from '$lib/schema';
	import { isPlatformAdminEmail } from '$lib/admin';
	import { seedVenues, getVenueById, setVenueVerification, venueIdFor } from '$lib/services/venue.service';
	import { venueSeeds } from '$lib/data/venues.seed';

	type RequestWithOrg = OrganizationVerificationRequest & { organization: Organization | null };

	let loading = $state(true);
	let loadError = $state('');
	let activeTab = $state<'overview' | 'verifications'>('overview');

	let stats = $state({
		users: 0,
		organizations: 0,
		events: { total: 0, open: 0, full: 0, cancelled: 0, finished: 0 },
		pendingVerifications: 0,
		venues: 0
	});

	let seedingVenues = $state(false);
	let seedVenuesMessage = $state('');

	const RALLY_VERIFIED_VENUE_NAMES = ['Amplify - Marquês', 'Lisboa Racket Centre'];
	let rallyVerifiedVenues = $state<Venue[]>([]);
	let rallyVerifiedVenuesLoading = $state(false);
	let togglingVenueId = $state('');

	let verificationRequests = $state<RequestWithOrg[]>([]);
	let loadingRequests = $state(false);
	let verificationRequestsLoaded = $state(false);
	let requestsError = $state('');

	let processingId = $state('');
	let adminNotes = $state<Record<string, string>>({});
	let actionError = $state('');

	// Each stat is fetched independently so a single denied query (e.g. an
	// aggregation query whose rule depends on per-document data, which
	// Firestore's count() cannot evaluate and always rejects) can't take
	// down every other stat on this page.
	async function safeCount(label: string, countQuery: Parameters<typeof getCountFromServer>[0]) {
		try {
			const snap = await getCountFromServer(countQuery);
			return snap.data().count;
		} catch (err) {
			console.error(`Load ${label} count error:`, err);
			return 0;
		}
	}

	async function loadStats() {
		const [
			usersCount,
			orgsCount,
			eventsCount,
			openCount,
			fullCount,
			cancelledCount,
			finishedCount,
			pendingVerCount,
			venuesCount
		] = await Promise.all([
			safeCount('users', collection(db, 'users')),
			safeCount('organizations', collection(db, 'organizations')),
			safeCount('events (total)', collection(db, 'events')),
			safeCount('events (open)', query(collection(db, 'events'), where('status', '==', 'open'))),
			safeCount('events (full)', query(collection(db, 'events'), where('status', '==', 'full'))),
			safeCount(
				'events (cancelled)',
				query(collection(db, 'events'), where('status', '==', 'cancelled'))
			),
			safeCount(
				'events (finished)',
				query(collection(db, 'events'), where('status', '==', 'finished'))
			),
			safeCount(
				'pending verifications',
				query(collection(db, 'organizationVerificationRequests'), where('status', '==', 'pending'))
			),
			safeCount('venues', collection(db, 'venues'))
		]);

		stats = {
			users: usersCount,
			organizations: orgsCount,
			events: {
				total: eventsCount,
				open: openCount,
				full: fullCount,
				cancelled: cancelledCount,
				finished: finishedCount
			},
			pendingVerifications: pendingVerCount,
			venues: venuesCount
		};
	}

	async function handleSeedVenues() {
		seedingVenues = true;
		seedVenuesMessage = '';
		try {
			const count = await seedVenues(venueSeeds);
			seedVenuesMessage = `Seeded ${count} venues.`;
			await loadStats();
		} catch (e) {
			seedVenuesMessage = `Failed: ${(e as Error).message}`;
		} finally {
			seedingVenues = false;
		}
	}

	async function loadRallyVerifiedVenues() {
		rallyVerifiedVenuesLoading = true;
		try {
			const venues = await Promise.all(
				RALLY_VERIFIED_VENUE_NAMES.map((name) => getVenueById(venueIdFor(name)))
			);
			rallyVerifiedVenues = venues.filter((v): v is Venue => v !== null);
		} finally {
			rallyVerifiedVenuesLoading = false;
		}
	}

	async function toggleVenueVerification(venue: Venue) {
		togglingVenueId = venue.id;
		try {
			const nextStatus = venue.verificationStatus === 'verified' ? 'unverified' : 'verified';
			await setVenueVerification(venue.id, nextStatus);
			rallyVerifiedVenues = rallyVerifiedVenues.map((v) =>
				v.id === venue.id ? { ...v, verificationStatus: nextStatus } : v
			);
		} finally {
			togglingVenueId = '';
		}
	}

	async function loadVerificationRequests() {
		loadingRequests = true;
		requestsError = '';
		try {
			const requests = await getPendingVerificationRequests();
			const withOrgs = await Promise.all(
				requests.map(async (req) => {
					const org = await getOrganizationById(req.organizationId);
					return { ...req, organization: org };
				})
			);
			verificationRequests = withOrgs;
			verificationRequestsLoaded = true;
		} catch (e) {
			requestsError = (e as Error).message;
			verificationRequestsLoaded = true;
		} finally {
			loadingRequests = false;
		}
	}

	async function approve(req: RequestWithOrg) {
		processingId = req.id;
		actionError = '';
		try {
			await approveOrganizationVerification({
				organizationId: req.organizationId,
				requestId: req.id,
				adminUserId: auth.currentUser!.uid,
				level: req.requestedLevel,
				adminNote: adminNotes[req.id] ?? ''
			});
			verificationRequests = verificationRequests.filter((r) => r.id !== req.id);
			stats.pendingVerifications = Math.max(0, stats.pendingVerifications - 1);
		} catch (e) {
			actionError = (e as Error).message;
		} finally {
			processingId = '';
		}
	}

	async function reject(req: RequestWithOrg) {
		processingId = req.id;
		actionError = '';
		try {
			await rejectOrganizationVerification({
				organizationId: req.organizationId,
				requestId: req.id,
				adminUserId: auth.currentUser!.uid,
				adminNote: adminNotes[req.id] ?? ''
			});
			verificationRequests = verificationRequests.filter((r) => r.id !== req.id);
			stats.pendingVerifications = Math.max(0, stats.pendingVerifications - 1);
		} catch (e) {
			actionError = (e as Error).message;
		} finally {
			processingId = '';
		}
	}

	function formatDate(ts: unknown) {
		try {
			const timestamp = ts as { toDate?: () => Date };
			if (timestamp?.toDate) {
				return timestamp.toDate().toLocaleDateString('en-GB', {
					day: '2-digit',
					month: 'short',
					year: 'numeric'
				});
			}
		} catch {}
		return '—';
	}

	onMount(() => {
		let unsubscribeRequests = () => {};
		const unsub = onAuthStateChanged(auth, async (user) => {
			if (!user || !isPlatformAdminEmail(user.email)) {
				goto('/dashboard');
				return;
			}
			try {
				await loadStats();
				void loadRallyVerifiedVenues();
				if (stats.pendingVerifications > 0) activeTab = 'verifications';
				let initialized = false;
				unsubscribeRequests = onSnapshot(
					query(
						collection(db, 'organizationVerificationRequests'),
						where('status', '==', 'pending')
					),
					() => {
						if (!initialized) {
							initialized = true;
							return;
						}
						void loadStats();
						void loadVerificationRequests();
					}
				);
			} catch (error) {
				console.error('Admin dashboard load error:', error);
				loadError = error instanceof Error ? error.message : 'Could not load the admin dashboard.';
			} finally {
				loading = false;
			}
		});
		return () => {
			unsub();
			unsubscribeRequests();
		};
	});

	$effect(() => {
		if (
			activeTab === 'verifications' &&
			!verificationRequestsLoaded &&
			verificationRequests.length === 0 &&
			!loadingRequests
		) {
			loadVerificationRequests();
		}
	});
</script>

{#if loading}
	<div class="flex min-h-screen items-center justify-center">
		<p class="text-slate-500">Loading...</p>
	</div>
{:else if loadError}
	<div class="mx-auto max-w-2xl px-5 py-16">
		<div
			class="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
		>
			<h1 class="text-xl font-black">Admin access could not be loaded</h1>
			<p class="mt-2 text-sm">{loadError}</p>
			<p class="mt-3 text-sm font-bold">
				Confirm that the updated Firestore Rules have been deployed.
			</p>
		</div>
	</div>
{:else}
	<div class="min-h-screen bg-slate-50 dark:bg-slate-950">
		<!-- Header -->
		<div class="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
			<div class="mx-auto max-w-6xl px-4 py-5">
				<div class="flex items-center gap-3">
					<div
						class="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white"
					>
						A
					</div>
					<div>
						<h1 class="text-lg font-bold text-slate-900 dark:text-white">Rally Admin</h1>
						<p class="text-xs text-slate-500">Platform management</p>
					</div>
				</div>

				<!-- Tabs -->
				<div class="mt-4 flex gap-1">
					<button
						onclick={() => (activeTab = 'overview')}
						class={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
							activeTab === 'overview'
								? 'bg-blue-600 text-white'
								: 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
						}`}
					>
						Overview
					</button>
					<button
						onclick={() => (activeTab = 'verifications')}
						class={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
							activeTab === 'verifications'
								? 'bg-blue-600 text-white'
								: 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
						}`}
					>
						Verifications
						{#if stats.pendingVerifications > 0}
							<span
								class="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white"
							>
								{stats.pendingVerifications}
							</span>
						{/if}
					</button>
				</div>
			</div>
		</div>

		<div class="mx-auto max-w-6xl px-4 py-8">
			<!-- Overview Tab -->
			{#if activeTab === 'overview'}
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
					<div
						class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
					>
						<p class="text-xs font-medium uppercase tracking-wide text-slate-500">Users</p>
						<p class="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{stats.users}</p>
					</div>

					<div
						class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
					>
						<p class="text-xs font-medium uppercase tracking-wide text-slate-500">Organizations</p>
						<p class="mt-1 text-3xl font-bold text-slate-900 dark:text-white">
							{stats.organizations}
						</p>
					</div>

					<div
						class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
					>
						<p class="text-xs font-medium uppercase tracking-wide text-slate-500">Events</p>
						<p class="mt-1 text-3xl font-bold text-slate-900 dark:text-white">
							{stats.events.total}
						</p>
					</div>

					<div
						class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
					>
						<p class="text-xs font-medium uppercase tracking-wide text-slate-500">
							Pending Verifications
						</p>
						<p
							class={`mt-1 text-3xl font-bold ${stats.pendingVerifications > 0 ? 'text-orange-500' : 'text-slate-900 dark:text-white'}`}
						>
							{stats.pendingVerifications}
						</p>
					</div>
				</div>

				<!-- Event status breakdown -->
				<div
					class="mt-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
				>
					<h2 class="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
						Events by Status
					</h2>
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
						{#each [{ label: 'Open', value: stats.events.open, color: 'text-green-600' }, { label: 'Full', value: stats.events.full, color: 'text-blue-600' }, { label: 'Finished', value: stats.events.finished, color: 'text-slate-500' }, { label: 'Cancelled', value: stats.events.cancelled, color: 'text-red-500' }] as stat}
							<div class="rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
								<p class="text-xs text-slate-500">{stat.label}</p>
								<p class={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
							</div>
						{/each}
					</div>
				</div>

				<!-- Locations directory seed -->
				<div
					class="mt-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
				>
					<div class="flex items-center justify-between gap-4">
						<div>
							<h2 class="text-sm font-semibold text-slate-700 dark:text-slate-300">
								Locations directory
							</h2>
							<p class="mt-1 text-xs text-slate-500">
								{stats.venues} venue{stats.venues === 1 ? '' : 's'} currently in Firestore ·
								{venueSeeds.length} in the curated seed set.
							</p>
						</div>
						<button
							onclick={handleSeedVenues}
							disabled={seedingVenues}
							class="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
						>
							{seedingVenues ? 'Seeding…' : 'Seed / update venues'}
						</button>
					</div>
					{#if seedVenuesMessage}
						<p class="mt-3 text-xs font-medium text-slate-600 dark:text-slate-400">
							{seedVenuesMessage}
						</p>
					{/if}
				</div>

				<!-- Rally Verified venues (drives Rally Points earning) -->
				<div
					class="mt-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
				>
					<h2 class="text-sm font-semibold text-slate-700 dark:text-slate-300">
						Rally Verified venues
					</h2>
					<p class="mt-1 text-xs text-slate-500">
						Users earn Rally Points for events that finish near one of these venues. Run "Seed /
						update venues" above at least once first.
					</p>

					{#if rallyVerifiedVenuesLoading}
						<p class="mt-3 text-xs text-slate-500">Loading…</p>
					{:else if rallyVerifiedVenues.length === 0}
						<p class="mt-3 text-xs text-slate-500">
							None of the target venues were found — seed the venues directory first.
						</p>
					{:else}
						<div class="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
							{#each rallyVerifiedVenues as venue (venue.id)}
								<div class="flex items-center justify-between gap-4 py-3">
									<div class="min-w-0">
										<p class="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
											{venue.name}
										</p>
										<p class="text-xs text-slate-500">
											{venue.verificationStatus === 'verified'
												? 'Rally Verified'
												: 'Not verified'}
										</p>
									</div>
									<button
										onclick={() => toggleVenueVerification(venue)}
										disabled={togglingVenueId === venue.id}
										class={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
											venue.verificationStatus === 'verified'
												? 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
												: 'bg-emerald-600 text-white hover:bg-emerald-700'
										}`}
									>
										{togglingVenueId === venue.id
											? 'Saving…'
											: venue.verificationStatus === 'verified'
												? 'Unverify'
												: 'Mark verified'}
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Verifications Tab -->
			{#if activeTab === 'verifications'}
				{#if actionError}
					<div
						class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
					>
						{actionError}
					</div>
				{/if}

				{#if loadingRequests}
					<p class="text-slate-500">Loading requests...</p>
				{:else if requestsError}
					<div
						class="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
					>
						Failed to load requests: {requestsError}
					</div>
				{:else if verificationRequests.length === 0}
					<div
						class="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900"
					>
						<p class="text-slate-500">No pending verification requests</p>
					</div>
				{:else}
					<div class="flex flex-col gap-4">
						{#each verificationRequests as req (req.id)}
							<div
								class="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
							>
								<div class="flex items-start justify-between gap-4">
									<div class="min-w-0">
										<div class="flex items-center gap-2">
											<h3 class="font-semibold text-slate-900 dark:text-white">
												{req.organization?.name ?? req.organizationId}
											</h3>
											<span
												class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400"
											>
												{req.organization?.type?.replace('_', ' ') ?? '—'}
											</span>
										</div>
										<p class="mt-0.5 text-sm text-slate-500">
											Submitted {formatDate(req.createdAt)}
										</p>
									</div>
									<span
										class="shrink-0 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
									>
										{req.requestedLevel} verification
									</span>
								</div>

								<!-- Request details -->
								<dl class="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
									{#if req.legalName}
										<div>
											<dt class="text-xs text-slate-400">Legal name</dt>
											<dd class="font-medium text-slate-800 dark:text-slate-200">
												{req.legalName}
											</dd>
										</div>
									{/if}
									{#if req.nif}
										<div>
											<dt class="text-xs text-slate-400">NIF</dt>
											<dd class="font-medium text-slate-800 dark:text-slate-200">{req.nif}</dd>
										</div>
									{/if}
									{#if req.website}
										<div>
											<dt class="text-xs text-slate-400">Website</dt>
											<dd class="truncate font-medium text-blue-600 dark:text-blue-400">
												{req.website}
											</dd>
										</div>
									{/if}
									{#if req.address}
										<div class="col-span-2">
											<dt class="text-xs text-slate-400">Address</dt>
											<dd class="font-medium text-slate-800 dark:text-slate-200">{req.address}</dd>
										</div>
									{/if}
									{#if req.hasPublicVenue && req.publicLocation}
										<div
											class="col-span-2 sm:col-span-3 rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30"
										>
											<dt class="text-xs font-medium text-blue-600 dark:text-blue-400">
												Claimed public venue
											</dt>
											<dd class="mt-1 font-medium text-slate-800 dark:text-slate-200">
												{req.publicLocation.name} · {req.publicLocation.address}
											</dd>
											<p class="mt-1 text-xs text-slate-500">
												Coordinates: {req.publicLocation.lat}, {req.publicLocation.lng}
											</p>
											{#if req.publicLocation.googleMapsURL}
												<a
													href={req.publicLocation.googleMapsURL}
													target="_blank"
													rel="noreferrer"
													class="mt-2 inline-block text-xs font-bold text-blue-600 hover:underline"
													>Open Google Maps evidence</a
												>
											{/if}
										</div>
									{/if}
								</dl>

								{#if req.note}
									<div
										class="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300"
									>
										<span class="text-xs font-medium text-slate-400">Note: </span>{req.note}
									</div>
								{/if}

								<!-- Admin note + actions -->
								<div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
									<textarea
										bind:value={adminNotes[req.id]}
										placeholder="Admin note (optional)..."
										rows="2"
										class="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
									></textarea>
									<div class="flex shrink-0 gap-2">
										<button
											onclick={() => reject(req)}
											disabled={processingId === req.id}
											class="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
										>
											Reject
										</button>
										<button
											onclick={() => approve(req)}
											disabled={processingId === req.id}
											class="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
										>
											{processingId === req.id ? 'Processing...' : 'Approve'}
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</div>
{/if}
