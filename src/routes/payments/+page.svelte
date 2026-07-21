<!-- src/routes/payments/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth } from '$lib/firebase';
	import type { SportEvent } from '$lib/schema';
	import { getEventsForUser, getEventsCreatedByUser, getEventPaymentSummary } from '$lib/services/event.service';
	import {
		createEventPaymentCheckout,
		createBatchEventPaymentCheckout,
		confirmEventPayment,
		confirmBatchEventPayment,
		sendPaymentReminders
	} from '$lib/services/event-payment.service';
	import { i18n } from '$lib/services/i18n.svelte';
	import { getCurrencySymbol, formatDate } from '$lib/utils/format.utils';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { CreditCard, ArrowRight, Bell, CheckCircle2, Clock, DollarSign, Wallet } from '@lucide/svelte';

	let loading = $state(true);
	let actionLoading = $state(false);
	let error = $state('');
	let successMessage = $state('');
	let reminderSendingMap = $state<Record<string, boolean>>({});
	let reminderSuccessMap = $state<Record<string, string>>({});

	let joinedEvents = $state<SportEvent[]>([]);
	let createdEvents = $state<SportEvent[]>([]);

	let currentUserId = $derived(auth.currentUser?.uid);

	// Filter events where current user owes payment (excluding hosted events and unfinished cost-splits)
	let eventsINeedToPay = $derived.by(() => {
		if (!currentUserId) return [];
		return joinedEvents.filter((evt) => {
			if (evt.status === 'cancelled') return false;
			if (evt.creatorId === currentUserId) return false;

			// For cost-split events (priceTotal != null), payment is only due after the event is finished
			if (evt.priceTotal != null && evt.status !== 'finished') {
				return false;
			}

			const summary = getEventPaymentSummary(evt);
			if (!summary || summary.splitAmount == null || summary.splitAmount <= 0) return false;
			const status = summary.statuses[currentUserId] || 'pending';
			return status !== 'paid';
		});
	});

	// Filter upcoming cost-split events where user is a participant but event is not yet finished
	let upcomingCostSplitEvents = $derived.by(() => {
		if (!currentUserId) return [];
		return joinedEvents.filter((evt) => {
			if (evt.status === 'cancelled' || evt.status === 'finished') return false;
			if (evt.priceTotal == null || evt.priceTotal <= 0) return false;
			return Array.isArray(evt.participantIds) && evt.participantIds.includes(currentUserId);
		});
	});

	// Total amount due across all unpaid events
	let totalAmountDue = $derived.by(() => {
		if (!currentUserId) return 0;
		return eventsINeedToPay.reduce((sum, evt) => {
			const summary = getEventPaymentSummary(evt);
			return sum + (summary?.splitAmount ?? 0);
		}, 0);
	});

	// Filter hosted events with pending participant payments
	let eventsWhereParticipantsOweMe = $derived.by(() => {
		return createdEvents.filter((evt) => {
			if (evt.status === 'cancelled') return false;
			const summary = getEventPaymentSummary(evt);
			return summary != null && summary.pendingCount > 0 && (summary.splitAmount ?? 0) > 0;
		});
	});

	// Total money due to current user across all hosted events
	let moneyDueToMe = $derived.by(() => {
		return eventsWhereParticipantsOweMe.reduce((sum, evt) => {
			const summary = getEventPaymentSummary(evt);
			if (!summary || !summary.splitAmount) return sum;
			return sum + summary.splitAmount * summary.pendingCount;
		}, 0);
	});

	function formatAmount(amount: number, currency?: string) {
		return `${getCurrencySymbol(currency)}${amount.toFixed(2)}`;
	}

	async function loadPaymentData() {
		const user = auth.currentUser;
		if (!user) return;

		loading = true;
		error = '';

		try {
			const [joined, created] = await Promise.all([
				getEventsForUser(user.uid),
				getEventsCreatedByUser(user.uid)
			]);
			joinedEvents = joined;
			createdEvents = created;

			// Handle return from Stripe Checkout
			const batchSessionId = page.url.searchParams.get('batchSessionId');
			const paymentSessionId = page.url.searchParams.get('paymentSessionId');
			const eventId = page.url.searchParams.get('eventId');

			if (batchSessionId) {
				actionLoading = true;
				try {
					const res = await confirmBatchEventPayment({ sessionId: batchSessionId });
					successMessage = `Successfully paid for ${res.count} events!`;
					// Refresh list
					const [j, c] = await Promise.all([
						getEventsForUser(user.uid),
						getEventsCreatedByUser(user.uid)
					]);
					joinedEvents = j;
					createdEvents = c;
					await goto(resolve('/payments'), { replaceState: true, noScroll: true });
				} catch (err) {
					console.error('Confirm batch payment error:', err);
					error = getFriendlyErrorMessage(err, 'Could not confirm batch payment.');
				} finally {
					actionLoading = false;
				}
			} else if (paymentSessionId && eventId) {
				actionLoading = true;
				try {
					await confirmEventPayment({ eventId, sessionId: paymentSessionId });
					successMessage = 'Payment confirmed successfully!';
					const [j, c] = await Promise.all([
						getEventsForUser(user.uid),
						getEventsCreatedByUser(user.uid)
					]);
					joinedEvents = j;
					createdEvents = c;
					await goto(resolve('/payments'), { replaceState: true, noScroll: true });
				} catch (err) {
					console.error('Confirm payment error:', err);
					error = getFriendlyErrorMessage(err, 'Could not confirm payment.');
				} finally {
					actionLoading = false;
				}
			}
		} catch (err) {
			console.error('Load payment data error:', err);
			error = getFriendlyErrorMessage(err, 'Could not load payment dashboard.');
		} finally {
			loading = false;
		}
	}

	async function handlePaySingleEvent(event: SportEvent) {
		actionLoading = true;
		error = '';

		try {
			const { checkoutUrl } = await createEventPaymentCheckout({
				eventId: event.id
			});
			window.location.assign(checkoutUrl);
		} catch (err) {
			console.error('Single event checkout error:', err);
			error = getFriendlyErrorMessage(err, 'Could not start payment flow.');
			actionLoading = false;
		}
	}

	async function handlePayAllAtOnce() {
		if (eventsINeedToPay.length === 0) return;

		actionLoading = true;
		error = '';

		try {
			const eventIds = eventsINeedToPay.map((e) => e.id);
			const { checkoutUrl } = await createBatchEventPaymentCheckout({ eventIds });
			window.location.assign(checkoutUrl);
		} catch (err) {
			console.error('Batch checkout error:', err);
			error = getFriendlyErrorMessage(err, 'Could not start batch payment flow.');
			actionLoading = false;
		}
	}

	async function handleSendReminder(event: SportEvent) {
		reminderSendingMap = { ...reminderSendingMap, [event.id]: true };
		reminderSuccessMap = { ...reminderSuccessMap, [event.id]: '' };
		error = '';

		try {
			const res = await sendPaymentReminders({ eventId: event.id });
			if (res.count > 0) {
				reminderSuccessMap = {
					...reminderSuccessMap,
					[event.id]: i18n.t('reminder_sent')
				};
			} else {
				reminderSuccessMap = {
					...reminderSuccessMap,
					[event.id]: i18n.t('all_payments_settled')
				};
			}
		} catch (err) {
			console.error('Send payment reminder error:', err);
			error = getFriendlyErrorMessage(err, i18n.t('reminder_cooldown'));
		} finally {
			reminderSendingMap = { ...reminderSendingMap, [event.id]: false };
		}
	}

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, async (user) => {
			if (!user) {
				await goto(resolve('/login'));
				return;
			}
			await loadPaymentData();
		});

		return () => unsubscribe();
	});
</script>

<div class="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
	<!-- Page Title Header -->
	<div class="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
		<div>
			<div class="flex items-center gap-3">
				<div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
					<CreditCard class="h-6 w-6" />
				</div>
				<div>
					<h1 class="text-2xl font-black text-slate-950 dark:text-slate-50 sm:text-3xl">
						{i18n.t('payments')}
					</h1>
					<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">
						Manage your pending event payments and receivables
					</p>
				</div>
			</div>
		</div>

		{#if eventsINeedToPay.length > 0}
			<button
				onclick={handlePayAllAtOnce}
				disabled={actionLoading}
				class="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-black text-white shadow-xl shadow-blue-600/25 transition hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] disabled:opacity-60"
			>
				<Wallet class="h-4 w-4" />
				{i18n.t('pay_all')} ({formatAmount(totalAmountDue)})
			</button>
		{/if}
	</div>

	{#if error}
		<div class="mb-6 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 border border-red-200 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
			{error}
		</div>
	{/if}

	{#if successMessage}
		<div class="mb-6 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300 flex items-center gap-2">
			<CheckCircle2 class="h-5 w-5 shrink-0" />
			{successMessage}
		</div>
	{/if}

	{#if loading}
		<div class="flex items-center justify-center py-20">
			<div class="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
		</div>
	{:else}
		<!-- Overview Stats Grid -->
		<div class="mb-10 grid gap-4 sm:grid-cols-3">
			<!-- Total Amount Due -->
			<div class="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
				<div class="flex items-center justify-between">
					<p class="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
						{i18n.t('total_amount_due')}
					</p>
					<div class="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
						<Clock class="h-5 w-5" />
					</div>
				</div>
				<p class="mt-3 text-3xl font-black text-slate-950 dark:text-slate-50">
					{formatAmount(totalAmountDue)}
				</p>
				<p class="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
					{eventsINeedToPay.length} {i18n.t('events_to_pay').toLowerCase()}
				</p>
			</div>

			<!-- Events to Pay -->
			<div class="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
				<div class="flex items-center justify-between">
					<p class="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
						{i18n.t('events_to_pay')}
					</p>
					<div class="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
						<CreditCard class="h-5 w-5" />
					</div>
				</div>
				<p class="mt-3 text-3xl font-black text-slate-950 dark:text-slate-50">
					{eventsINeedToPay.length}
				</p>
				<p class="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
					Pending payments
				</p>
			</div>

			<!-- Money Due to Me -->
			<div class="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
				<div class="flex items-center justify-between">
					<p class="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
						{i18n.t('money_due_to_me')}
					</p>
					<div class="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
						<DollarSign class="h-5 w-5" />
					</div>
				</div>
				<p class="mt-3 text-3xl font-black text-slate-950 dark:text-slate-50">
					{formatAmount(moneyDueToMe)}
				</p>
				<p class="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
					From {eventsWhereParticipantsOweMe.length} hosted events
				</p>
			</div>
		</div>

		<!-- Section 1: Events I Need to Pay -->
		<div class="mb-12">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-xl">
					{i18n.t('events_you_owe')}
				</h2>
				{#if eventsINeedToPay.length > 0}
					<span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700 dark:bg-amber-950 dark:text-amber-300">
						{eventsINeedToPay.length} Pending
					</span>
				{/if}
			</div>

			{#if eventsINeedToPay.length === 0}
				<div class="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 py-12 px-4 text-center dark:border-slate-800 dark:bg-slate-900/30">
					<div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 mb-3">
						<CheckCircle2 class="h-6 w-6" />
					</div>
					<h3 class="text-base font-black text-slate-950 dark:text-slate-50">
						{i18n.t('all_payments_settled')}
					</h3>
					<p class="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400 max-w-sm">
						{i18n.t('no_pending_payments')}
					</p>
				</div>
			{:else}
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each eventsINeedToPay as event (event.id)}
						{@const summary = getEventPaymentSummary(event)}
						{@const splitAmount = summary?.splitAmount ?? 0}
						<div class="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
							<div>
								<div class="flex items-start justify-between gap-3">
									<a href={resolve(`/events/${event.id}`)} class="group">
										<h3 class="font-black text-slate-950 transition group-hover:text-blue-600 dark:text-slate-50 dark:group-hover:text-blue-400">
											{event.title}
										</h3>
									</a>
									<span class="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-400">
										{event.sport}
									</span>
								</div>

								<div class="mt-3 space-y-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
									<p>{formatDate(event.startAt)}</p>
									<p class="truncate">{event.location?.name || event.location?.address || 'Location TBA'}</p>
								</div>
							</div>

							<div class="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
								<div>
									<p class="text-[10px] font-black uppercase tracking-wider text-slate-400">Amount Due</p>
									<p class="text-lg font-black text-slate-950 dark:text-slate-50">
										{formatAmount(splitAmount, event.currency)}
									</p>
								</div>
								<button
									onclick={() => handlePaySingleEvent(event)}
									disabled={actionLoading}
									class="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60"
								>
									{i18n.t('pay_now')}
									<ArrowRight class="h-3.5 w-3.5" />
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Section: Upcoming Cost-Split Events -->
		{#if upcomingCostSplitEvents.length > 0}
			<div class="mb-12">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-xl">
						{i18n.t('upcoming_cost_splits')}
					</h2>
					<span class="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700 dark:bg-blue-950 dark:text-blue-300">
						{upcomingCostSplitEvents.length} Active
					</span>
				</div>

				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each upcomingCostSplitEvents as event (event.id)}
						{@const currentCount = event.participantIds?.length ?? 0}
						{@const maxCount = event.maxParticipants ?? 1}
						{@const totalCost = event.priceTotal ?? 0}
						{@const estimatedShare = totalCost / Math.max(1, currentCount)}
						<div class="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
							<div>
								<div class="flex items-start justify-between gap-3">
									<a href={resolve(`/events/${event.id}`)} class="group">
										<h3 class="font-black text-slate-950 transition group-hover:text-blue-600 dark:text-slate-50 dark:group-hover:text-blue-400">
											{event.title}
										</h3>
									</a>
									<span class="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-400">
										{event.sport}
									</span>
								</div>

								<div class="mt-3 space-y-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
									<p>{formatDate(event.startAt)}</p>
									<p class="truncate">{event.location?.name || event.location?.address || 'Location TBA'}</p>
								</div>

								<!-- Cost Split Metrics Grid -->
								<div class="mt-4 grid grid-cols-3 gap-2">
									<div class="rounded-2xl bg-slate-50 p-2 text-center dark:bg-slate-800/60">
										<p class="text-[9px] font-black uppercase tracking-wider text-slate-400">{i18n.t('total_event_cost')}</p>
										<p class="mt-0.5 text-xs font-black text-slate-900 dark:text-slate-100">{formatAmount(totalCost, event.currency)}</p>
									</div>
									<div class="rounded-2xl bg-slate-50 p-2 text-center dark:bg-slate-800/60">
										<p class="text-[9px] font-black uppercase tracking-wider text-slate-400">{i18n.t('current_attendees')}</p>
										<p class="mt-0.5 text-xs font-black text-blue-600 dark:text-blue-400">{currentCount} / {maxCount}</p>
									</div>
									<div class="rounded-2xl bg-blue-50/70 p-2 text-center dark:bg-blue-950/40">
										<p class="text-[9px] font-black uppercase tracking-wider text-blue-500 dark:text-blue-400">{i18n.t('estimated_share')}</p>
										<p class="mt-0.5 text-xs font-black text-blue-700 dark:text-blue-300">{formatAmount(estimatedShare, event.currency)}</p>
									</div>
								</div>
							</div>

							<div class="mt-5 border-t border-slate-100 pt-3 dark:border-slate-800">
								<p class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
									💡 {i18n.t('split_on_completion')}
								</p>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Section 2: Money Due to Me (Hosted Events) -->
		<div>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-lg font-black text-slate-950 dark:text-slate-50 sm:text-xl">
					{i18n.t('participants_owe_you')}
				</h2>
				{#if eventsWhereParticipantsOweMe.length > 0}
					<span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
						{eventsWhereParticipantsOweMe.length} Events
					</span>
				{/if}
			</div>

			{#if eventsWhereParticipantsOweMe.length === 0}
				<div class="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 py-12 px-4 text-center dark:border-slate-800 dark:bg-slate-900/30">
					<div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-200/50 text-slate-500 dark:bg-slate-800 dark:text-slate-400 mb-3">
						<DollarSign class="h-6 w-6" />
					</div>
					<h3 class="text-base font-black text-slate-950 dark:text-slate-50">
						{i18n.t('no_receivables')}
					</h3>
				</div>
			{:else}
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each eventsWhereParticipantsOweMe as event (event.id)}
						{@const summary = getEventPaymentSummary(event)}
						{@const splitAmount = summary?.splitAmount ?? 0}
						{@const pendingCount = summary?.pendingCount ?? 0}
						{@const paidCount = summary?.paidCount ?? 0}
						{@const totalOwed = splitAmount * pendingCount}
						<div class="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
							<div>
								<div class="flex items-start justify-between gap-3">
									<a href={resolve(`/events/${event.id}`)} class="group">
										<h3 class="font-black text-slate-950 transition group-hover:text-blue-600 dark:text-slate-50 dark:group-hover:text-blue-400">
											{event.title}
										</h3>
									</a>
									<span class="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-400">
										{event.sport}
									</span>
								</div>

								<div class="mt-3 flex items-center gap-3 text-xs font-semibold">
									<span class="text-emerald-600 dark:text-emerald-400 font-bold">{paidCount} Paid</span>
									<span class="text-slate-300 dark:text-slate-700">•</span>
									<span class="text-amber-600 dark:text-amber-400 font-bold">{pendingCount} Pending</span>
								</div>
							</div>

							<div class="mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
								<div class="flex items-center justify-between mb-3">
									<p class="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Owed</p>
									<p class="text-base font-black text-emerald-600 dark:text-emerald-400">
										{formatAmount(totalOwed, event.currency)}
									</p>
								</div>

								<button
									onclick={() => handleSendReminder(event)}
									disabled={reminderSendingMap[event.id]}
									class="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-black text-white shadow transition hover:bg-amber-700 active:scale-[0.98] disabled:opacity-60"
								>
									<Bell class="h-3.5 w-3.5" />
									{reminderSendingMap[event.id] ? i18n.t('sending_reminders') : i18n.t('send_reminders')}
								</button>
								{#if reminderSuccessMap[event.id]}
									<p class="mt-1.5 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
										{reminderSuccessMap[event.id]}
									</p>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
