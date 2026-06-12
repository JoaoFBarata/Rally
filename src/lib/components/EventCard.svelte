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
	class="block rounded-3xl border border-slate-800 bg-slate-950 p-5 transition hover:border-emerald-400/60 hover:bg-slate-900"
>
	<div class="flex items-start justify-between gap-4">
		<div>
			<p class="text-sm font-semibold uppercase tracking-wide text-emerald-400">
				{event.sport}
			</p>

			<h3 class="mt-1 text-xl font-bold text-white">
				{event.title}
			</h3>

			<p class="mt-2 text-sm text-slate-400">
				📍 {event.location.name}
			</p>

			<p class="mt-1 text-sm text-slate-400">
				🕒 {formatDate(event.startAt)}
			</p>
		</div>

		<div class="rounded-2xl bg-slate-800 px-3 py-2 text-center">
			<p class="text-sm font-bold text-white">
				{event.participantIds.length}/{event.maxParticipants}
			</p>
			<p class="text-xs text-slate-400">players</p>
		</div>
	</div>

	<div class="mt-4 flex items-center justify-between">
		<span class="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
			{event.status}
		</span>

		{#if event.pricePerPerson}
			<span class="text-sm text-slate-300">
				€{event.pricePerPerson.toFixed(2)} / person
			</span>
		{/if}
	</div>
</a>