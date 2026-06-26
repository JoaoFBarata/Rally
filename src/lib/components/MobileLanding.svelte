<script lang="ts">
	import GoogleSignInButton from '$lib/components/GoogleSignInButton.svelte';
	import RallyWordmark from '$lib/components/RallyWordmark.svelte';

	type LandingUser = {
		displayName?: string | null;
		email?: string | null;
	} | null;

	let { user = null, loading = false }: { user?: LandingUser; loading?: boolean } = $props();

	const sports = ['Football', 'Padel', 'Running', 'Basketball'];
</script>

<section
	class="min-h-dvh bg-white px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] text-slate-950 dark:bg-slate-950 dark:text-white md:hidden"
>
	<div class="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-sm flex-col">
		<header class="flex items-center justify-between py-2">
			<RallyWordmark size="md" />
		</header>

		<div class="flex flex-1 flex-col justify-center py-10">
			<div
				class="mb-8 inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400"
			>
				<span class="h-2 w-2 rounded-full bg-blue-600"></span>
				Sports, friends and events in one app
			</div>

			<h1 class="max-w-[18rem] text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl">
				Find your game.
			</h1>

			<p class="mt-5 max-w-[19rem] text-base font-medium leading-7 text-slate-500 dark:text-slate-400">
				Join nearby matches, create events and keep your sports crew together.
			</p>

			<div class="mt-7 flex flex-wrap gap-2">
				{#each sports as sport}
					<span
						class="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 dark:border-slate-800 dark:text-slate-300"
					>
						{sport}
					</span>
				{/each}
			</div>
		</div>

		<div class="space-y-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
			{#if loading}
				<div class="flex justify-center py-5">
					<div
						class="h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600 dark:border-slate-800 dark:border-t-blue-400"
					></div>
				</div>
			{:else if user}
				<a
					href="/dashboard"
					class="flex w-full items-center justify-center rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-600/20 active:scale-[0.99]"
				>
					Go to dashboard
				</a>
			{:else}
				<a
					href="/login"
					class="flex w-full items-center justify-center rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-600/20 active:scale-[0.99]"
				>
					Sign in
				</a>

				<a
					href="/register"
					class="flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-blue-700 active:scale-[0.99] dark:border-slate-800 dark:bg-slate-900 dark:text-blue-300"
				>
					Create account
				</a>

				<GoogleSignInButton />
			{/if}

			<p class="px-4 pt-2 text-center text-[11px] leading-5 text-slate-400 dark:text-slate-500">
				By continuing, you agree to Rally's
				<a href="/terms" class="font-bold text-blue-600 dark:text-blue-400">Terms</a>
				and
				<a href="/privacy" class="font-bold text-blue-600 dark:text-blue-400">Privacy Policy</a>.
			</p>
		</div>
	</div>
</section>
