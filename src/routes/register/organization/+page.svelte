<!--src/routes/register/organization/+page.svelte-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import RallyLogo from '$lib/components/RallyLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { authService } from '$lib/services/auth.service';
	import { goBack } from '$lib/utils/navigation';
	import type { OrganizationType } from '$lib/schema';

	let organizationName = $state('');
	let organizationType = $state<OrganizationType>('company');
	let description = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let contactEmail = $state('');
	let phone = $state('');
	let website = $state('');
	let address = $state('');
	let city = $state('');
	let nif = $state('');
	let loading = $state(false);
	let error = $state('');

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

	async function handleRegisterOrganization() {
		error = '';

		if (!organizationName.trim() || !email.trim() || !password) {
			error = 'Please fill in organization name, email and password.';
			return;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match.';
			return;
		}

		loading = true;

		try {
			await authService.registerOrganization({
				email,
				password,
				organizationName,
				organizationType,
				description,
				contactEmail: contactEmail || email,
				phone,
				website,
				address,
				city,
				nif
			});

			await goto('/dashboard');
		} catch (err) {
			console.error('Organization register error:', err);
			error = err instanceof Error ? err.message : 'Could not create organization account.';
		} finally {
			loading = false;
		}
	}
</script>

<main class="min-h-screen bg-slate-50 dark:bg-slate-950">
	<section class="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-8 lg:grid-cols-2">
		<div class="hidden lg:block">
			<div class="flex items-center justify-between gap-3">
				<RallyLogo size="lg" href="/" />
				<ThemeToggle />
			</div>

			<h1 class="mt-8 text-6xl font-black leading-tight tracking-tight text-slate-950 dark:text-slate-50">
				Create events as an organization.
			</h1>

			<p class="mt-5 max-w-lg text-lg leading-8 text-slate-600 dark:text-slate-400">
				For companies, clubs, venues and communities that organize real sports events.
				Official paid events require verification before payments can be enabled.
			</p>

			<div class="mt-8 grid max-w-lg gap-3">
				<div class="rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900 dark:shadow-none">
					<p class="text-sm font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
						Trust first
					</p>
					<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
						Organizations start unverified. Verified badges and official paid events are only unlocked after review.
					</p>
				</div>
			</div>
		</div>

		<div class="mx-auto w-full max-w-xl">
			<div class="mb-8 flex items-center justify-between gap-3 lg:hidden">
				<RallyLogo size="md" href="/" />
				<ThemeToggle />
			</div>

			<div
				class="rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<h1 class="text-3xl font-black text-slate-950 dark:text-slate-50">
					Organization account
				</h1>

				<p class="mt-2 text-slate-500 dark:text-slate-400">
					Create a Rally account for a company, club, venue or organizer.
				</p>

				{#if error}
					<div
						class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
					>
						{error}
					</div>
				{/if}

				<form
					class="mt-8 space-y-5"
					onsubmit={(e) => {
						e.preventDefault();
						handleRegisterOrganization();
					}}
				>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="sm:col-span-2">
							<label for="organizationName" class="text-sm font-semibold text-slate-700 dark:text-slate-300">
								Organization name
							</label>
							<input
								id="organizationName"
								bind:value={organizationName}
								class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
								placeholder="Example: Lisbon Padel Center"
							/>
						</div>

						<div>
							<label for="organizationType" class="text-sm font-semibold text-slate-700 dark:text-slate-300">
								Type
							</label>
							<select
								id="organizationType"
								bind:value={organizationType}
								class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							>
								{#each organizationTypes as type}
									<option value={type.value}>{type.label}</option>
								{/each}
							</select>
						</div>

						<div>
							<label for="nif" class="text-sm font-semibold text-slate-700 dark:text-slate-300">
								NIF / VAT number
							</label>
							<input
								id="nif"
								bind:value={nif}
								class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
								placeholder="Optional for now"
							/>
						</div>
					</div>

					<div>
						<label for="description" class="text-sm font-semibold text-slate-700 dark:text-slate-300">
							Description
						</label>
						<textarea
							id="description"
							bind:value={description}
							rows="3"
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							placeholder="What does this organization do?"
						></textarea>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label for="email" class="text-sm font-semibold text-slate-700 dark:text-slate-300">
								Login email
							</label>
							<input
								id="email"
								type="email"
								bind:value={email}
								class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
								placeholder="admin@company.com"
							/>
						</div>

						<div>
							<label for="contactEmail" class="text-sm font-semibold text-slate-700 dark:text-slate-300">
								Public contact email
							</label>
							<input
								id="contactEmail"
								type="email"
								bind:value={contactEmail}
								class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
								placeholder="Optional"
							/>
						</div>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label for="password" class="text-sm font-semibold text-slate-700 dark:text-slate-300">
								Password
							</label>
							<input
								id="password"
								type="password"
								bind:value={password}
								class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
								placeholder="••••••••"
							/>
						</div>

						<div>
							<label for="confirmPassword" class="text-sm font-semibold text-slate-700 dark:text-slate-300">
								Confirm password
							</label>
							<input
								id="confirmPassword"
								type="password"
								bind:value={confirmPassword}
								class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
								placeholder="••••••••"
							/>
						</div>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<input bind:value={phone} class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950" placeholder="Phone" />
						<input bind:value={website} class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950" placeholder="Website" />
						<input bind:value={address} class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950" placeholder="Address" />
						<input bind:value={city} class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950" placeholder="City" />
					</div>

					<button
						type="submit"
						disabled={loading}
						class="w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60 dark:shadow-blue-950/40"
					>
						{loading ? 'Creating organization...' : 'Create organization account'}
					</button>
				</form>

				<p class="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
					Want a personal account?
					<a href="/register" class="font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
						Create personal account
					</a>
				</p>
			</div>
			<button
				type="button"
				onclick={() => goBack('/')}
				class="mt-6 block text-center text-sm font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
			>
				← Back to home
			</button>
		</div>
	</section>
</main>
