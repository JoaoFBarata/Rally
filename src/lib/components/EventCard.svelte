<script lang="ts">
	import type { EventStatus, SportEvent } from '$lib/schema';

	let { event } = $props<{
		event: SportEvent;
	}>();

	function getEventStartAtMillis() {
		try {
			const timestamp = event.startAt as unknown as { toDate?: () => Date; toMillis?: () => number };

			if (timestamp?.toMillis) return timestamp.toMillis();
			if (timestamp?.toDate) return timestamp.toDate().getTime();

			return 0;
		} catch {
			return 0;
		}
	}

	function hasEventFinished() {
		const startAtMs = getEventStartAtMillis();

		if (!startAtMs) return false;

		return startAtMs < Date.now();
	}

	function getEffectiveStatus(): EventStatus {
		if (event.status === 'cancelled') return 'cancelled';
		if (event.status === 'finished') return 'finished';
		if (hasEventFinished()) return 'finished';
		if (event.status === 'full') return 'full';

		return event.status;
	}

	function getStatusLabel() {
		const status = getEffectiveStatus();

		if (status === 'cancelled') return 'Cancelled';
		if (status === 'finished') return 'Finished';
		if (status === 'full') return 'Full';
		if (status === 'open') return 'Open';

		return status;
	}

	function getStatusDescription() {
		const status = getEffectiveStatus();

		if (status === 'cancelled') return 'This event was cancelled';
		if (status === 'finished') return 'This event already happened';
		if (status === 'full') return 'This event is full';

		return 'Upcoming event';
	}

	function getStatusClasses() {
		const status = getEffectiveStatus();

		if (status === 'cancelled') {
			return 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300';
		}

		if (status === 'finished') {
			return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
		}

		if (status === 'full') {
			return 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300';
		}

		return 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300';
	}

	function getCardClasses() {
		const status = getEffectiveStatus();

		if (status === 'cancelled') {
			return 'border-red-100 bg-red-50/40 opacity-85 hover:border-red-200 hover:bg-red-50 dark:border-red-950 dark:bg-red-950/20 dark:hover:bg-red-950/30';
		}

		if (status === 'finished') {
			return 'border-slate-200 bg-slate-50/80 opacity-85 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-800';
		}

		if (event.isPromoted) {
			return 'border-blue-200 bg-blue-50/30 hover:border-blue-400 hover:bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20 dark:hover:bg-blue-950/30';
		}

		return 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-slate-800';
	}

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

	function isOfficialPaidEvent() {
		return event.paymentMode === 'official';
	}

	function isOrganizationEvent() {
		return event.hostType === 'organization';
	}
</script>

<a
	href={`/events/${event.id}`}
	class={`block rounded-4xl border p-5 shadow-lg shadow-slate-200/70 transition dark:shadow-none ${getCardClasses()}`}
>
	<div class="flex items-start justify-between gap-4">
		<div class="min-w-0 flex-1">
			{#if isOrganizationEvent()}
				<div class="mb-3 flex min-w-0 items-center gap-2">
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-black text-blue-600 dark:bg-slate-800 dark:text-blue-300"
					>
						{#if event.organizationLogoURL}
							<img
								src={event.organizationLogoURL}
								alt={event.organizationName ?? 'Organization'}
								class="h-full w-full object-cover"
							/>
						{:else}
							{event.organizationName?.charAt(0).toUpperCase() ?? 'O'}
						{/if}
					</div>

					<p class="truncate text-xs font-black text-slate-500 dark:text-slate-400">
						Hosted by {event.organizationName ?? 'Organization'}
					</p>

					{#if event.organizationVerificationStatus === 'verified'}
						<span
							class="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300"
						>
							Verified
						</span>
					{/if}
				</div>
			{/if}

			<div class="flex flex-wrap items-center gap-2">
				<p class="text-sm font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">
					{event.sport}
				</p>

				<span class={`rounded-full px-3 py-1 text-xs font-black ${getStatusClasses()}`}>
					{getStatusLabel()}
				</span>

				{#if event.isPromoted}
					<span
						class="rounded-full bg-blue-600 px-3 py-1 text-xs font-black text-white dark:bg-blue-500"
					>
						Promoted
					</span>
				{/if}

				{#if isOfficialPaidEvent()}
					<span
						class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
					>
						Protected payment
					</span>
				{/if}
			</div>

			<h3 class="mt-2 truncate text-xl font-black text-slate-950 dark:text-slate-50">
				{event.title}
			</h3>

			<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
				📍 {event.location.name}
			</p>

			<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
				🕒 {formatDate(event.startAt)}
			</p>

			<p class="mt-2 text-xs font-semibold text-slate-400 dark:text-slate-500">
				{getStatusDescription()}
			</p>
		</div>

		<div class="shrink-0 rounded-2xl bg-blue-50 px-3 py-2 text-center dark:bg-blue-950">
			<p class="text-sm font-black text-blue-600 dark:text-blue-300">
				{event.participantIds.length}/{event.maxParticipants}
			</p>

			<p class="text-xs font-medium text-slate-500 dark:text-slate-400">
				players
			</p>
		</div>
	</div>

	<div class="mt-4 flex flex-wrap items-center justify-between gap-2">
		<span class={`rounded-full px-3 py-1 text-xs font-bold ${getStatusClasses()}`}>
			{getStatusLabel()}
		</span>

		{#if event.pricePerPerson}
			<span class="text-sm font-medium text-slate-600 dark:text-slate-300">
				€{event.pricePerPerson.toFixed(2)} / person
			</span>
		{/if}
	</div>
</a>