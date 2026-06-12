<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	let { children } = $props();

	function isActive(path: string) {
		return page.url.pathname === path;
	}
</script>

<main class="min-h-screen bg-slate-50 text-slate-950">
	<section class="mx-auto max-w-6xl px-6 py-8">
		<header class="flex items-center justify-between">
			<a href={resolve('/dashboard')} class="flex items-center gap-3">
				<div
					class="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-xl font-black text-white shadow-lg shadow-blue-600/25"
				>
					R
				</div>

				<span class="text-3xl font-black tracking-tight text-slate-950">ally</span>
			</a>

			<nav class="flex items-center gap-3">
				<a
					href={resolve('/dashboard')}
					class="rounded-full px-5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-blue-600"
				>
					Dashboard
				</a>

				<a
					href={resolve('/events/explore')}
					class={`rounded-full px-5 py-2 text-sm font-semibold transition ${
						isActive('/events/explore')
							? 'bg-blue-50 text-blue-600'
							: 'text-slate-700 hover:bg-slate-100 hover:text-blue-600'
					}`}
				>
					Explore
				</a>

				<a
					href={resolve('/events/create')}
					class={`rounded-full px-5 py-3 text-sm font-bold shadow-lg transition ${
						isActive('/events/create')
							? 'bg-blue-600 text-white shadow-blue-600/25'
							: 'bg-white text-blue-600 shadow-slate-200 hover:bg-blue-50'
					}`}
				>
					Create event
				</a>
			</nav>
		</header>

		<div class="mt-12">
			{@render children()}
		</div>
	</section>
</main>