<script lang="ts">
	import { resolve } from '$app/paths';
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
	href={resolve(`/events/${event.id}`)}
	class="block rounded-[2rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/70 transition hover:border-blue-300 hover:bg-blue-50/40"
>
	<div class="flex items-start justify-between gap-4">
		<div>
			<p class="text-sm font-bold uppercase tracking-wide text-blue-600">
				{event.sport}
			</p>

			<h3 class="mt-1 text-xl font-black text-slate-950">
				{event.title}
			</h3>

			<p class="mt-2 text-sm text-slate-500">
				📍 {event.location.name}
			</p>

			<p class="mt-1 text-sm text-slate-500">
				🕒 {formatDate(event.startAt)}
			</p>
		</div>

		<div class="rounded-2xl bg-blue-50 px-3 py-2 text-center">
			<p class="text-sm font-black text-blue-600">
				{event.participantIds.length}/{event.maxParticipants}
			</p>
			<p class="text-xs font-medium text-slate-500">players</p>
		</div>
	</div>

	<div class="mt-4 flex items-center justify-between">
		<span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600">
			{event.status}
		</span>

		{#if event.pricePerPerson}
			<span class="text-sm font-medium text-slate-600">
				€{event.pricePerPerson.toFixed(2)} / person
			</span>
		{/if}
	</div>
</a>