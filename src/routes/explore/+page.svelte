<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import { getVisibleEventsForUser } from '$lib/services/explore.service';
	import type { SportEvent } from '$lib/schema';
	import ExploreMap from '$lib/components/ExploreMap.svelte';

	let events = $state<SportEvent[]>([]);
	let loading = $state(true);
	let error = $state('');
	let currentUserId = $state('');

	onMount(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			await goto(resolve('/login'));
			return;
		}
		currentUserId = currentUser.uid;
		events = await getVisibleEventsForUser(currentUser.uid);

		try {
			events = await getVisibleEventsForUser(currentUser.uid);
		} catch (err) {
			console.error('Explore events error:', err);

			if (err instanceof Error && err.message.includes('index')) {
				error = 'Firestore needs an index for this query. Check the console link.';
			} else if (err instanceof Error) {
				error = err.message;
			} else {
				error = 'Could not load events.';
			}
		} finally {
			loading = false;
		}
	});
</script>

<main class="mx-auto max-w-6xl px-5 py-6">
	<header class="mb-6">
		<p class="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">Rally</p>
		<h1 class="mt-2 text-3xl font-bold">Explore</h1>
		<p class="mt-1 text-slate-500">Find games, teams and sports partners nearby.</p>
	</header>

	{#if loading}
		<section class="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800">
			<p class="text-slate-500">Loading events...</p>
		</section>
	{:else if error}
		<section class="rounded-[2rem] border border-red-200 bg-red-50 p-8 text-red-700">
			{error}
		</section>
	{:else}
		<ExploreMap {events} {currentUserId} />

		<div class="mt-4 rounded-2xl bg-blue-100 dark:bg-slate-900 px-5 py-4 text-sm font-medium text-blue-700 dark:text-blue-300">
			Showing {events.length} visible event{events.length === 1 ? '' : 's'}.
		</div>
	{/if}
</main>