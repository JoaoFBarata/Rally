<script lang="ts">
	import { page } from '$app/state';
    import RallyLogo from '$lib/components/RallyLogo.svelte';

	let { children } = $props();

	const navItems = [
		{
			label: 'Explore',
			href: '/explore',
			icon: '⌖'
		},
		{
			label: 'My events',
			href: '/dashboard',
			icon: '◷'
		},
		{
			label: 'Create',
			href: '/events/create',
			icon: '+',
			main: true
		},
		{
			label: 'Messages',
			href: '/messages',
			icon: '✉'
		},
		{
			label: 'Profile',
			href: '/profile',
			icon: '☻'
		}
	];

	let pathname = $derived(page.url.pathname);

	function isActive(href: string) {
		if (href === '/dashboard') return pathname === '/dashboard';
		return pathname.startsWith(href);
	}

	function shouldHideNavigation() {
		return pathname === '/login' || pathname === '/register';
	}
</script>

{#if shouldHideNavigation()}
	{@render children()}
{:else}
	<div class="min-h-screen bg-slate-100 text-slate-950">
		<div class="flex min-h-screen">
			<!-- Desktop sidebar -->
			<aside class="hidden w-72 border-r border-slate-200 bg-white px-5 py-6 md:block">
				<div>
                    <RallyLogo size="sm" />
                    <p class="mt-2 text-xs text-slate-500">Make sports happen</p>
                </div>

				<nav class="mt-10 space-y-2">
					{#each navItems as item}
						<a
							href={item.href}
							class={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
								isActive(item.href)
									? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
									: 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
							}`}
						>
							<span class="text-lg">{item.icon}</span>
							<span>{item.label}</span>
						</a>
					{/each}
				</nav>
			</aside>

			<!-- Main content -->
			<div class="flex min-w-0 flex-1 flex-col">
				<main class="min-h-screen pb-24 md:pb-0">
					{@render children()}
				</main>
			</div>
		</div>

		<!-- Mobile bottom navigation -->
		<nav class="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 py-2 shadow-2xl backdrop-blur md:hidden">
			<div class="mx-auto grid max-w-md grid-cols-5 items-end gap-1">
				{#each navItems as item}
					<a href={item.href} class="flex flex-col items-center justify-end gap-1">
						<span
							class={`flex items-center justify-center ${
								item.main
									? 'mb-1 h-12 w-12 rounded-full bg-blue-600 text-3xl font-light text-white shadow-lg shadow-blue-600/30'
									: `h-9 w-9 rounded-2xl text-lg ${
											isActive(item.href)
												? 'bg-blue-50 text-blue-600'
												: 'text-slate-400'
										}`
							}`}
						>
							{item.icon}
						</span>

						<span
							class={`text-[11px] font-medium ${
								isActive(item.href) ? 'text-blue-600' : 'text-slate-400'
							}`}
						>
							{item.label}
						</span>
					</a>
				{/each}
			</div>
		</nav>
	</div>
{/if}