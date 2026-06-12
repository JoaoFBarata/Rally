<script lang="ts">
	import type { SportEvent } from '$lib/schema';

	let { event } = $props<{
		event: SportEvent;
	}>();

	function formatDate(dateValue: unknown) {
		try {
			const timestamp = dateValue as { toDate?: () => Date };

			if (timestamp?.toDate) {
				return timestamp.toDate().toLocaleString('en-GB', {
					day: '2-digit',
					month: 'short',
					hour: '2-digit',
					minute: '2-digit'
				});
			}

			return 'Date not set';
		} catch {
			return 'Date not set';
		}
	}
</script>

<a
	href={`/events/${event.id}`}
	class="block rounded-4xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/70 transition hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none dark:hover:border-blue-500 dark:hover:bg-slate-800"
>
	<div class="flex items-start justify-between gap-4">
		<div>
			<p class="text-sm font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">
				{event.sport}
			</p>

			<h3 class="mt-1 text-xl font-black text-slate-950 dark:text-slate-50">
				{event.title}
			</h3>

			<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
				📍 {event.location.name}
			</p>

			<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
				🕒 {formatDate(event.startAt)}
			</p>
		</div>

		<div class="rounded-2xl bg-blue-50 px-3 py-2 text-center dark:bg-blue-950">
			<p class="text-sm font-black text-blue-600 dark:text-blue-300">
				{event.participantIds.length}/{event.maxParticipants}
			</p>

			<p class="text-xs font-medium text-slate-500 dark:text-slate-400">
				players
			</p>
		</div>
	</div>

	<div class="mt-4 flex items-center justify-between">
		<span
			class="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600 dark:bg-blue-950 dark:text-blue-300"
		>
			{event.status}
		</span>

		{#if event.pricePerPerson}
			<span class="text-sm font-medium text-slate-600 dark:text-slate-300">
				€{event.pricePerPerson.toFixed(2)} / person
			</span>
		{/if}
	</div>
</a>