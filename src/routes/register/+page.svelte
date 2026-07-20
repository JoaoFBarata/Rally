<!--src/routes/register/+page.svelte-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RallyWordmark from '$lib/components/RallyWordmark.svelte';
	import GoogleSignInButton from '$lib/components/GoogleSignInButton.svelte';
	import { authService } from '$lib/services/auth.service';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { themeState } from '$lib/theme.svelte';
	import { i18n } from '$lib/services/i18n.svelte';
	import { page } from '$app/state';
	import type { OrganizationType } from '$lib/schema';

	type RegistrationType = 'personal' | 'organization';
	let accountType = $state<RegistrationType>(
		page.url.searchParams.get('type') === 'organization' ? 'organization' : 'personal'
	);

	let displayName = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let error = $state('');
	let showPassword = $state(false);
	let registerLanguage = $state(i18n.currentLang);
	let organizationName = $state('');
	let organizationType = $state<OrganizationType>('company');
	let description = $state('');
	let contactEmail = $state('');
	let phone = $state('');
	let website = $state('');
	let address = $state('');
	let city = $state('');
	let nif = $state('');

	const organizationTypes: { value: OrganizationType; labelKey: string }[] = [
		{ value: 'company', labelKey: 'organization_type_company' },
		{ value: 'sports_club', labelKey: 'organization_type_sports_club' },
		{ value: 'venue', labelKey: 'organization_type_venue' },
		{ value: 'gym', labelKey: 'organization_type_gym' },
		{ value: 'event_organizer', labelKey: 'organization_type_event_organizer' },
		{ value: 'university', labelKey: 'organization_type_university' },
		{ value: 'community_group', labelKey: 'organization_type_community' },
		{ value: 'other', labelKey: 'other' }
	];

	async function handleRegister() {
		error = '';

		if (
			(accountType === 'personal' && !displayName) ||
			(accountType === 'organization' && !organizationName.trim()) ||
			!email ||
			!password ||
			!confirmPassword
		) {
			error = i18n.t('required_fields_error');
			return;
		}

		if (password !== confirmPassword) {
			error = i18n.t('passwords_mismatch_error');
			return;
		}

		if (password.length < 6) {
			error = i18n.t('password_length_error');
			return;
		}

		loading = true;

		try {
			if (accountType === 'organization') {
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
					nif,
					language: registerLanguage
				});
			} else {
				await authService.register(email, password, displayName, registerLanguage);
			}
			i18n.setLanguage(registerLanguage as any);
			await goto(resolve('/dashboard'));
		} catch (err) {
			console.error('Register error:', err);
			error = getFriendlyErrorMessage(err, i18n.t('create_account_error'));
		} finally {
			loading = false;
		}
	}
</script>

<main
	class="flex min-h-screen items-center justify-center bg-slate-100 px-5 py-10 text-slate-950 dark:bg-slate-950 dark:text-slate-50"
>
	<div class="w-full max-w-5xl">
		<div class="mb-8 flex justify-center">
			<RallyWordmark size="lg" />
		</div>

		<div class="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
			<section
				class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<p class="text-sm font-black uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">
					{i18n.t('choose_account_type')}
				</p>

				<h1 class="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-slate-50">
					{i18n.t('join_rally')}
				</h1>

				<p class="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
					{i18n.t('account_type_intro')}
				</p>

				<div class="mt-6 space-y-3">
					<button
						type="button"
						onclick={() => (accountType = 'personal')}
						aria-pressed={accountType === 'personal'}
						class={`w-full rounded-3xl p-5 text-left transition ${accountType === 'personal' ? 'border-2 border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40' : 'border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-slate-800'}`}
					>
						<div class="flex items-start gap-4">
							<div
								class={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl font-black ${accountType === 'personal' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}
							>
								☻
							</div>

							<div>
								<h2 class="font-black text-slate-950 dark:text-slate-50">
									{i18n.t('personal_account')}
								</h2>
								<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
									{i18n.t('personal_account_help')}
								</p>
							</div>
						</div>
					</button>

					<button
						type="button"
						onclick={() => (accountType = 'organization')}
						aria-pressed={accountType === 'organization'}
						class={`block w-full rounded-3xl p-5 text-left transition ${accountType === 'organization' ? 'border-2 border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40' : 'border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-slate-800'}`}
					>
						<div class="flex items-start gap-4">
							<div
								class={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl font-black ${accountType === 'organization' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}
							>
								✓
							</div>

							<div>
								<h2 class="font-black text-slate-950 dark:text-slate-50">
									{i18n.t('organization_account')}
								</h2>
								<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
									{i18n.t('organization_account_help')}
								</p>
							</div>
						</div>
					</button>
				</div>

				<p class="mt-6 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
					{i18n.t('organization_verification_help')}
				</p>
			</section>

			<section
				class="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
			>
				<h2 class="text-2xl font-black text-slate-950 dark:text-slate-50">
					{accountType === 'organization'
						? i18n.t('create_organization_account')
						: i18n.t('create_personal_account')}
				</h2>

				<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
					{accountType === 'organization'
						? i18n.t('organization_register_sub')
						: i18n.t('personal_register_sub')}
				</p>

				{#if error}
					<div
						class="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
					>
						{error}
					</div>
				{/if}

				<form
					class="mt-6 space-y-4"
					onsubmit={(event) => {
						event.preventDefault();
						handleRegister();
					}}
				>
					{#if accountType === 'personal'}
						<div>
							<label for="displayName" class="text-sm font-bold text-slate-700 dark:text-slate-300">
								{i18n.t('name')}
							</label>

							<input
								id="displayName"
								bind:value={displayName}
								placeholder={i18n.t('name_placeholder')}
								class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-slate-50 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							/>
						</div>
					{:else}
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="sm:col-span-2">
								<label
									for="organizationName"
									class="text-sm font-bold text-slate-700 dark:text-slate-300"
									>{i18n.t('organization_name')}</label
								>
								<input
									id="organizationName"
									bind:value={organizationName}
									placeholder={i18n.t('organization_name_placeholder')}
									class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:ring-blue-950"
								/>
							</div>
							<div>
								<label
									for="organizationType"
									class="text-sm font-bold text-slate-700 dark:text-slate-300"
									>{i18n.t('organization_type')}</label
								>
								<select
									id="organizationType"
									bind:value={organizationType}
									class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								>
									{#each organizationTypes as type (type.value)}<option value={type.value}
											>{i18n.t(type.labelKey)}</option
										>{/each}
								</select>
							</div>
							<div>
								<label for="nif" class="text-sm font-bold text-slate-700 dark:text-slate-300"
									>{i18n.t('nif_vat_optional')}</label
								>
								<input
									id="nif"
									bind:value={nif}
									placeholder={i18n.t('optional')}
									class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
								/>
							</div>
						</div>
						<div>
							<label
								for="organizationDescription"
								class="text-sm font-bold text-slate-700 dark:text-slate-300"
								>{i18n.t('description')}</label
							>
							<textarea
								id="organizationDescription"
								bind:value={description}
								rows="2"
								placeholder={i18n.t('organization_description_placeholder')}
								class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							></textarea>
						</div>
					{/if}

					<div>
						<label for="language" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							{i18n.t('select_language')}
						</label>

						<select
							id="language"
							bind:value={registerLanguage}
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-slate-50 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950 font-bold"
						>
							<option value="en">English</option>
							<option value="pt">Português</option>
							<option value="es">Español</option>
							<option value="fr">Français</option>
						</select>
					</div>

					<div>
						<label for="email" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Email
						</label>

						<input
							id="email"
							type="email"
							bind:value={email}
							placeholder="you@example.com"
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-slate-50 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
						/>
					</div>

					{#if accountType === 'organization'}
						<div class="grid gap-4 sm:grid-cols-2">
							<input
								type="email"
								bind:value={contactEmail}
								placeholder={i18n.t('public_contact_email_optional')}
								class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							/>
							<input
								bind:value={phone}
								placeholder={i18n.t('phone_optional')}
								class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							/>
							<input
								bind:value={website}
								placeholder={i18n.t('website_optional')}
								class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							/>
							<input
								bind:value={city}
								placeholder={i18n.t('city_optional')}
								class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							/>
							<input
								bind:value={address}
								placeholder={i18n.t('address_optional')}
								class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 sm:col-span-2"
							/>
						</div>
					{/if}

					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label for="password" class="text-sm font-bold text-slate-700 dark:text-slate-300">
								{i18n.t('password')}
							</label>

							<div class="relative mt-2">
								<input
									id="password"
									type={showPassword ? 'text' : 'password'}
									bind:value={password}
									placeholder="••••••••"
									class="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-4 pr-12 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-slate-50 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
								/>
								<button
									type="button"
									onclick={() => (showPassword = !showPassword)}
									class="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition"
								>
									{#if showPassword}
										<img
											src="/eye_open.png"
											alt={i18n.t('show_password')}
											class="h-5 w-5 object-contain"
											class:invert={$themeState}
										/>
									{:else}
										<img
											src="/eye_closed.png"
											alt={i18n.t('hide_password')}
											class="h-5 w-5 object-contain"
											class:invert={$themeState}
										/>
									{/if}
								</button>
							</div>
						</div>

						<div>
							<label
								for="confirmPassword"
								class="text-sm font-bold text-slate-700 dark:text-slate-300"
							>
								{i18n.t('confirm_password')}
							</label>

							<div class="relative mt-2">
								<input
									id="confirmPassword"
									type={showPassword ? 'text' : 'password'}
									bind:value={confirmPassword}
									placeholder="••••••••"
									class="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-4 pr-12 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-slate-50 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
								/>
								<button
									type="button"
									onclick={() => (showPassword = !showPassword)}
									class="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition"
								>
									{#if showPassword}
										<img
											src="/eye_open.png"
											alt={i18n.t('show_password')}
											class="h-5 w-5 object-contain"
											class:invert={$themeState}
										/>
									{:else}
										<img
											src="/eye_closed.png"
											alt={i18n.t('hide_password')}
											class="h-5 w-5 object-contain"
											class:invert={$themeState}
										/>
									{/if}
								</button>
							</div>
						</div>
					</div>

					<button
						type="submit"
						disabled={loading}
						class="w-full rounded-2xl bg-blue-600 px-5 py-3 font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
					>
						{loading
							? i18n.t('creating_account')
							: accountType === 'organization'
								? i18n.t('create_organization_account')
								: i18n.t('create_personal_account')}
					</button>
				</form>

				{#if accountType === 'personal'}
					<div class="my-6 flex items-center gap-4">
						<div class="h-px flex-1 bg-slate-200 dark:bg-slate-800"></div>
						<span class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
							{i18n.t('or')}
						</span>
						<div class="h-px flex-1 bg-slate-200 dark:bg-slate-800"></div>
					</div>

					<GoogleSignInButton />
				{/if}

				<p class="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
					{i18n.t('already_have_account')}
					<a
						href={resolve('/login')}
						class="font-black text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
					>
						{i18n.t('login_title')}
					</a>
				</p>
			</section>
		</div>
	</div>
</main>
