<!-- src/lib/components/ToastContainer.svelte -->
<script lang="ts">
	import { toastState } from '$lib/toast.svelte';
	import { fade, fly } from 'svelte/transition';
</script>

<div
	class="fixed right-4 top-4 z-[9999] flex w-full max-w-sm flex-col gap-3 px-4 sm:right-6 sm:top-6 sm:px-0"
	aria-live="assertive"
>
	{#each toastState.toasts as toast (toast.id)}
		<div
			in:fly={{ y: -30, duration: 400 }}
			out:fade={{ duration: 200 }}
			class="group relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-xl shadow-slate-200/50 backdrop-blur-md transition hover:scale-[1.02] dark:border-slate-800/80 dark:bg-slate-900/95 dark:shadow-none"
		>
			<!-- Indicator Line -->
			<div
				class={`absolute left-0 top-0 bottom-0 w-1.5 ${
					toast.type === 'message'
						? 'bg-blue-600'
						: toast.type === 'invite'
							? 'bg-amber-500'
							: 'bg-emerald-500'
				}`}
			></div>

			<!-- Icon -->
			<div
				class={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
					toast.type === 'message'
						? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400'
						: toast.type === 'invite'
							? 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
							: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
				}`}
			>
				{#if toast.type === 'message'}
					<!-- Chat icon -->
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-5 w-5"
					>
						<path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z" />
					</svg>
				{:else}
					<!-- Calendar/Star/Plus icon -->
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-5 w-5"
					>
						{#if toast.type === 'invite'}
							<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
							<circle cx="9" cy="7" r="4" />
							<path d="M19 8v6M22 11h-6" />
						{:else}
							<path d="M8 2v4M16 2v4M3 10h18" />
							<rect x="3" y="4" width="18" height="18" rx="2" />
							<path d="M12 14v4M10 16h4" />
						{/if}
					</svg>
				{/if}
			</div>

			<!-- Content -->
			<div class="flex-1 pr-6">
				<h3 class="text-sm font-black text-slate-950 dark:text-slate-50">
					{toast.title}
				</h3>
				<p class="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
					{toast.message}
				</p>
			</div>

			<!-- Close Button -->
			<button
				onclick={() => toastState.remove(toast.id)}
				class="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 opacity-60 transition hover:bg-slate-100 hover:text-slate-900 hover:opacity-100 dark:hover:bg-slate-800 dark:hover:text-white"
				aria-label="Close notification"
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-4 w-4"
				>
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</div>
	{/each}
</div>
