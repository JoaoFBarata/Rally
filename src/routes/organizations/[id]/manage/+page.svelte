<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth } from '$lib/firebase';
	import type { Organization, OrganizationType, VerificationLevel } from '$lib/schema';
	import {
		assertCanManageOrganization,
		requestOrganizationVerification,
		updateOrganizationProfile
	} from '$lib/services/organization.service';

	let organization = $state<Organization | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let requesting = $state(false);
	let error = $state('');
	let success = $state('');

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
	let requestedLevel = $state<VerificationLevel>('legal');

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
	}

	async function loadManagePage(userId: string) {
		loading = true;
		error = '';

		try {
			const loadedOrganization = await assertCanManageOrganization({
				organizationId: page.params.id,
				userId
			});

			organization = loadedOrganization;
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
				logoPath: organization.logoPath ?? null
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
				requestedLevel
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

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, async (user) => {
			if (!user) {
				await goto(resolve('/login'));
				return;
			}

			await loadManagePage(user.uid);
		});

		return unsubscribe;
	});
</script>

<main class="mx-auto max-w-5xl px-5 py-8">
	<a href={resolve(`/organizations/${page.params.id}`)} class="inline-flex rounded-full bg-blue-50 px-5 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900">
		← Public page
	</a>

	{#if loading}
		<section class="mt-8 rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
			<p class="text-slate-500 dark:text-slate-400">Loading organization...</p>
		</section>
	{:else if error && !organization}
		<section class="mt-8 rounded-4xl border border-red-200 bg-red-50 p-8 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</section>
	{:else if organization}
		<div class="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
			<section class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
				<h1 class="text-3xl font-black text-slate-950 dark:text-slate-50">Manage organization</h1>
				<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Edit how your organization appears publicly on Rally.</p>

				{#if success}
					<div class="mt-5 rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-700 dark:bg-green-950 dark:text-green-300">{success}</div>
				{/if}

				{#if error}
					<div class="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div>
				{/if}

				<form class="mt-6 space-y-4" onsubmit={(event) => { event.preventDefault(); saveProfile(); }}>
					<div>
						<label for="name" class="text-sm font-semibold text-slate-700 dark:text-slate-300">Name</label>
						<input id="name" bind:value={name} class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50" />
					</div>

					<div>
						<label for="type" class="text-sm font-semibold text-slate-700 dark:text-slate-300">Type</label>
						<select id="type" bind:value={type} class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50">
							{#each organizationTypes as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="description" class="text-sm font-semibold text-slate-700 dark:text-slate-300">Description</label>
						<textarea id="description" bind:value={description} rows="4" class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"></textarea>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<input bind:value={contactEmail} placeholder="Contact email" class="rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50" />
						<input bind:value={phone} placeholder="Phone" class="rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50" />
						<input bind:value={website} placeholder="Website" class="rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50" />
						<input bind:value={city} placeholder="City" class="rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50" />
						<input bind:value={address} placeholder="Address" class="sm:col-span-2 rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50" />
						<input bind:value={nif} placeholder="NIF / legal ID" class="sm:col-span-2 rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50" />
					</div>

					<button type="submit" disabled={saving} class="w-full rounded-2xl bg-blue-600 px-5 py-3 font-black text-white transition hover:bg-blue-700 disabled:opacity-60">
						{saving ? 'Saving...' : 'Save profile'}
					</button>
				</form>
			</section>

			<aside class="space-y-6">
				<section class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
					<h2 class="text-xl font-black text-slate-950 dark:text-slate-50">Verification</h2>
					<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
						Current status: <span class="font-black">{organization.verificationStatus}</span>
					</p>

					<form class="mt-5 space-y-3" onsubmit={(event) => { event.preventDefault(); requestVerification(); }}>
						<input bind:value={legalName} placeholder="Legal name" class="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50" />
						<select bind:value={requestedLevel} class="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50">
							<option value="basic">Basic check</option>
							<option value="legal">Legal verification</option>
							<option value="venue">Venue verification</option>
						</select>
						<textarea bind:value={verificationNote} rows="4" placeholder="Notes, website, proof, venue details..." class="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"></textarea>

						<button type="submit" disabled={requesting || organization.verificationStatus === 'verified'} class="w-full rounded-2xl bg-slate-950 px-5 py-3 font-black text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
							{requesting ? 'Sending...' : 'Request verification'}
						</button>
					</form>
				</section>
			</aside>
		</div>
	{/if}
</main>
