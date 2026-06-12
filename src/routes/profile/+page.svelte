<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '$lib/firebase';
	import type { User } from 'firebase/auth';

	let user = $state<User | null>(null);

	onMount(() => {
		user = auth.currentUser;
	});
</script>

<main class="mx-auto max-w-4xl px-5 py-6">
	<header class="mb-6">
		<p class="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">Rally</p>
		<h1 class="mt-2 text-3xl font-bold">Profile</h1>
		<p class="mt-1 text-slate-500">Manage your sports profile and preferences.</p>
	</header>

	<section class="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
		<div class="flex items-center gap-4">
			<div class="flex h-20 w-20 items-center justify-center rounded-full bg-blue-600 text-3xl font-bold text-white">
				{user?.displayName?.[0] ?? user?.email?.[0] ?? 'R'}
			</div>

			<div>
				<h2 class="text-2xl font-bold">{user?.displayName ?? 'Rally user'}</h2>
				<p class="text-slate-500">{user?.email}</p>
			</div>
		</div>

		<div class="mt-8">
			<h3 class="font-bold">Sports interests</h3>

			<div class="mt-4 flex flex-wrap gap-2">
				<span class="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">Football</span>
				<span class="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">Padel</span>
				<span class="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">Gym</span>
			</div>
		</div>
	</section>
</main>