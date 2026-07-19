<script lang="ts">
	import { onMount } from 'svelte';
	import { subscribeToTournamentChanges } from '$lib/services/realtime.service';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { SportEvent, TournamentEntry, TournamentMatch, UserProfile } from '$lib/schema';
	import {
		closeTournamentRegistration,
		createTournamentTeam,
		generateTournamentMatches,
		getTournamentEntries,
		getTournamentMatches,
		ensureTournamentTeamConversation,
		joinTournamentAsIndividual,
		joinTournamentTeam,
		removeTournamentEntry,
		removeTournamentPlayer,
		syncTournamentBracketProgress,
		updateTournamentMatchResult,
		leaveTournament,
		cancelEvent
	} from '$lib/services/event.service';
	import { getUserProfile, getUserProfilesByIds } from '$lib/services/user.service';
	import { getFriendsForUser } from '$lib/services/social.service';
	import { inviteUsersToTournamentTeam } from '$lib/services/invite.service';
	import TimeSelect from '$lib/components/TimeSelect.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import { i18n } from '$lib/services/i18n.svelte';
	import { formatDate } from '$lib/utils/format.utils';

	let { event, currentUserId, canManage } = $props<{
		event: SportEvent;
		currentUserId: string;
		canManage: boolean;
	}>();

	let loading = $state(true);
	let error = $state('');
	let success = $state('');
	let actionLoading = $state('');
	let syncingBracket = false;

	let entries = $state<TournamentEntry[]>([]);
	let matches = $state<TournamentMatch[]>([]);

	let activeTab = $state<'overview' | 'entries' | 'bracket'>('overview');

	let teamName = $state('');
	let teamOpen = $state(true);

	let friends = $state<UserProfile[]>([]);
	let inviteTeamId = $state<string | null>(null);
	let selectedFriendIds = $state<string[]>([]);
	let memberProfiles = $state<Record<string, UserProfile>>({});
	let pendingRemovalKey = $state('');

	let matchInputs = $state<
		Record<
			string,
			{
				homeScore: string;
				awayScore: string;
				scheduledDate: string;
				scheduledTime: string;
			}
		>
	>({});

	let userEntry = $derived(
		entries.find((entry) => entry.memberIds.includes(currentUserId)) ?? null
	);

	let isRegistrationOpen = $derived(event.tournamentStatus === 'registration_open');

	let maxEntries = $derived(event.maxTournamentEntries ?? event.maxParticipants);

	let isFull = $derived(entries.length >= maxEntries);

	let matchSections = $derived.by(() => {
		const order: TournamentMatch['stage'][] = [
			'group',
			'league',
			'knockout',
			'semi_final',
			'final'
		];

		return order
			.map((stage) => ({
				stage,
				title: formatStage(stage),
				matches: matches.filter((match) => match.stage === stage)
			}))
			.filter((section) => section.matches.length > 0);
	});

	let preliminarySections = $derived(
		matchSections.filter((section) => section.stage === 'group' || section.stage === 'league')
	);

	let eliminationRounds = $derived.by(() => {
		const eliminationMatches = matches.filter(
			(match) =>
				match.stage === 'knockout' || match.stage === 'semi_final' || match.stage === 'final'
		);
		const roundNumbers = [...new Set(eliminationMatches.map((match) => match.roundNumber))].sort(
			(a, b) => a - b
		);

		return roundNumbers.map((roundNumber) => {
			const roundMatches = eliminationMatches.filter((match) => match.roundNumber === roundNumber);
			const stage = roundMatches[0]?.stage ?? 'knockout';
			return {
				roundNumber,
				title:
					stage === 'final'
						? 'Final'
						: stage === 'semi_final'
							? 'Semi-finals'
							: `Round ${roundNumber}`,
				matches: roundMatches
			};
		});
	});

	let groupNames = $derived.by(() => {
		return [
			...new Set(
				entries
					.map((entry) => entry.groupName)
					.filter((groupName): groupName is string => Boolean(groupName))
			)
		].sort();
	});

	let currentUserProfile = $state<UserProfile | null>(null);

	let isOrganizationAccount = $derived(currentUserProfile?.accountType === 'organization');
	let isTournamentHost = $derived(event.creatorId === currentUserId);
	let championEntry = $derived.by(() => {
		const markedWinner = entries.find((entry) => entry.status === 'winner');
		if (markedWinner) return markedWinner;
		const finalWinnerId = [...matches]
			.reverse()
			.find((match) => match.stage === 'final' && match.winnerEntryId)?.winnerEntryId;
		return entries.find((entry) => entry.id === finalWinnerId) ?? null;
	});
	let championProfile = $derived(
		championEntry
			? (memberProfiles[championEntry.captainId ?? championEntry.memberIds[0]] ?? null)
			: null
	);

	let canRegisterInTournament = $derived(
		!isOrganizationAccount && !isTournamentHost && isRegistrationOpen && !userEntry && !isFull
	);

	function getInvitableFriends(entry: TournamentEntry) {
		return friends.filter((friend) => !entry.memberIds.includes(friend.id));
	}

	function getMemberName(userId: string) {
		return memberProfiles[userId]?.displayName ?? 'Rally player';
	}

	function getMatchProfile(entryId: string | null | undefined) {
		if (!entryId) return null;
		const entry = entries.find((item) => item.id === entryId);
		if (!entry || entry.type !== 'individual') return null;
		return memberProfiles[entry.memberIds[0]] ?? null;
	}

	function isByeMatch(match: TournamentMatch) {
		return (
			Boolean(match.homeEntryId) !== Boolean(match.awayEntryId) ||
			match.homeName.toUpperCase() === 'BYE' ||
			match.awayName.toUpperCase() === 'BYE'
		);
	}

	function formatStage(stage: TournamentMatch['stage']) {
		if (stage === 'group') return i18n.t('stage_group');
		if (stage === 'league') return i18n.t('stage_league');
		if (stage === 'knockout') return i18n.t('stage_knockout');
		if (stage === 'semi_final') return i18n.t('stage_semi_final');
		if (stage === 'final') return i18n.t('stage_final');
		return stage;
	}

	function formatTournamentFormat() {
		if (event.tournamentFormat === 'groups_playoff') return i18n.t('format_groups_playoff');
		if (event.tournamentFormat === 'knockout') return i18n.t('format_knockout');
		if (event.tournamentFormat === 'league') return i18n.t('format_league');
		return i18n.t('tournament');
	}

	function formatRegistrationType() {
		return event.tournamentRegistrationType === 'team' ? i18n.t('teams') : i18n.t('individual_players');
	}

	function formatTimestamp(value: unknown) {
		try {
			const formatted = formatDate(value);
			return formatted === i18n.t('date_not_set') ? i18n.t('not_scheduled') : formatted;
		} catch {
			return i18n.t('not_scheduled');
		}
	}

	function timestampToDate(value: unknown): Date | null {
		try {
			const timestamp = value as { toDate?: () => Date };
			const date = timestamp?.toDate?.();
			return date && !Number.isNaN(date.getTime()) ? date : null;
		} catch {
			return null;
		}
	}

	function formatTournamentDuration() {
		const start = timestampToDate(event.startAt);
		const end = timestampToDate(event.endAt);
		if (!start || !end || end <= start) return i18n.t('duration_not_set');

		const totalMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;

		if (!hours) return i18n.t('minutes', { count: minutes });
		if (!minutes) return `${hours}h`;
		return `${hours}h ${minutes}min`;
	}


	function timestampToLocalParts(value: unknown) {
		try {
			const timestamp = value as { toDate?: () => Date };
			if (!timestamp?.toDate) return { date: '', time: '' };

			const date = timestamp.toDate();
			const offset = date.getTimezoneOffset();
			const local = new Date(date.getTime() - offset * 60 * 1000);

			return {
				date: local.toISOString().slice(0, 10),
				time: local.toISOString().slice(11, 16)
			};
		} catch {
			return { date: '', time: '' };
		}
	}

	function scoreValue(value: number | null | undefined) {
		return value === null || value === undefined ? '' : String(value);
	}

	async function loadTournamentData() {
		loading = true;
		error = '';

		try {
			if (canManage && currentUserId && !syncingBracket) {
				syncingBracket = true;
				try {
					await syncTournamentBracketProgress({ eventId: event.id, userId: currentUserId });
				} finally {
					syncingBracket = false;
				}
			}

			const [loadedEntries, loadedMatches] = await Promise.all([
				getTournamentEntries(event.id),
				getTournamentMatches(event.id)
			]);

			entries = loadedEntries;
			matches = loadedMatches;

			const profiles = await getUserProfilesByIds(
				loadedEntries.flatMap((entry) => entry.memberIds)
			);
			memberProfiles = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));

			const nextInputs: Record<
				string,
				{
					homeScore: string;
					awayScore: string;
					scheduledDate: string;
					scheduledTime: string;
				}
			> = {};

			for (const match of loadedMatches) {
				const scheduled = timestampToLocalParts(match.scheduledAt);
				nextInputs[match.id] = {
					homeScore: scoreValue(match.homeScore),
					awayScore: scoreValue(match.awayScore),
					scheduledDate: scheduled.date,
					scheduledTime: scheduled.time
				};
			}

			if (currentUserId) {
				currentUserProfile = await getUserProfile(currentUserId);
				friends = await getFriendsForUser(currentUserId);
			}

			matchInputs = nextInputs;
		} catch (err) {
			console.error('Load tournament data error:', err);
			error = getFriendlyErrorMessage(err, 'Could not load tournament data.');
		} finally {
			loading = false;
		}
	}

	function getEntriesForGroup(groupName: string) {
		return entries.filter((entry) => entry.groupName === groupName);
	}

	function getStandingRows(groupName: string | null) {
		const selectedEntries = groupName
			? entries.filter((entry) => entry.groupName === groupName)
			: entries;

		const rows = selectedEntries.map((entry) => ({
			entryId: entry.id,
			name: entry.name,
			played: 0,
			wins: 0,
			draws: 0,
			losses: 0,
			points: 0
		}));

		const rowsById = new Map(rows.map((row) => [row.entryId, row]));

		const relevantMatches = matches.filter((match) => {
			if (groupName) return match.groupName === groupName && match.status === 'finished';
			return match.stage === 'league' && match.status === 'finished';
		});

		for (const match of relevantMatches) {
			const home = match.homeEntryId ? rowsById.get(match.homeEntryId) : null;
			const away = match.awayEntryId ? rowsById.get(match.awayEntryId) : null;

			if (!home || !away) continue;

			const homeScore = match.homeScore ?? 0;
			const awayScore = match.awayScore ?? 0;

			home.played += 1;
			away.played += 1;

			if (homeScore > awayScore) {
				home.wins += 1;
				away.losses += 1;
				home.points += 3;
			} else if (awayScore > homeScore) {
				away.wins += 1;
				home.losses += 1;
				away.points += 3;
			} else {
				home.draws += 1;
				away.draws += 1;
				home.points += 1;
				away.points += 1;
			}
		}

		return rows.sort((a, b) => b.points - a.points || b.wins - a.wins);
	}

	async function handleJoinIndividual() {
		if (!currentUserId) return;

		actionLoading = 'join-individual';
		error = '';
		success = '';

		try {
			const profile = await getUserProfile(currentUserId);

			await joinTournamentAsIndividual({
				eventId: event.id,
				userId: currentUserId,
				displayName: profile?.displayName ?? 'Rally player'
			});

			success = 'You joined the tournament.';
			await loadTournamentData();
		} catch (err) {
			console.error('Join tournament error:', err);
			error = getFriendlyErrorMessage(err, 'Could not join tournament.');
		} finally {
			actionLoading = '';
		}
	}

	async function handleCreateTeam() {
		if (!currentUserId) return;

		actionLoading = 'create-team';
		error = '';
		success = '';

		try {
			if (!teamName.trim()) {
				throw new Error('Choose a team name.');
			}

			await createTournamentTeam({
				eventId: event.id,
				captainId: currentUserId,
				teamName: teamName.trim(),
				isOpen: teamOpen
			});

			teamName = '';
			success = 'Team created.';
			await loadTournamentData();
		} catch (err) {
			console.error('Create tournament team error:', err);
			error = getFriendlyErrorMessage(err, 'Could not create team.');
		} finally {
			actionLoading = '';
		}
	}

	async function handleJoinTeam(teamId: string) {
		if (!currentUserId) return;

		actionLoading = `join-team-${teamId}`;
		error = '';
		success = '';

		try {
			await joinTournamentTeam({
				eventId: event.id,
				teamId,
				userId: currentUserId
			});

			success = 'You joined the team.';
			await loadTournamentData();
		} catch (err) {
			console.error('Join team error:', err);
			error = getFriendlyErrorMessage(err, 'Could not join team.');
		} finally {
			actionLoading = '';
		}
	}

	async function handleOpenTeamChat(entry: TournamentEntry) {
		if (!currentUserId) return;

		actionLoading = `team-chat-${entry.id}`;
		error = '';

		try {
			const conversationId = await ensureTournamentTeamConversation({
				eventId: event.id,
				teamId: entry.id,
				userId: currentUserId
			});

			await goto(resolve(`/messages/${conversationId}`));
		} catch (err) {
			console.error('Open team chat error:', err);
			error = getFriendlyErrorMessage(err, 'Could not open the team chat.');
		} finally {
			actionLoading = '';
		}
	}

	async function handleRemovePlayer(entry: TournamentEntry, playerId: string) {
		if (!currentUserId) return;

		actionLoading = `remove-player-${playerId}`;
		error = '';
		success = '';

		try {
			await removeTournamentPlayer({
				eventId: event.id,
				entryId: entry.id,
				playerId,
				userId: currentUserId
			});

			pendingRemovalKey = '';
			success = 'Player removed from the tournament.';
			await loadTournamentData();
		} catch (err) {
			console.error('Remove tournament player error:', err);
			error = getFriendlyErrorMessage(err, 'Could not remove the player.');
		} finally {
			actionLoading = '';
		}
	}

	async function handleRemoveEntry(entry: TournamentEntry) {
		if (!currentUserId) return;

		actionLoading = `remove-entry-${entry.id}`;
		error = '';
		success = '';

		try {
			await removeTournamentEntry({
				eventId: event.id,
				entryId: entry.id,
				userId: currentUserId
			});

			pendingRemovalKey = '';
			success =
				entry.type === 'team'
					? 'Team removed from the tournament.'
					: 'Player removed from the tournament.';
			await loadTournamentData();
		} catch (err) {
			console.error('Remove tournament entry error:', err);
			error = getFriendlyErrorMessage(err, 'Could not remove the entry.');
		} finally {
			actionLoading = '';
		}
	}

	async function handleCloseRegistration() {
		if (!currentUserId) return;

		actionLoading = 'close-registration';
		error = '';
		success = '';

		try {
			await closeTournamentRegistration({
				eventId: event.id,
				userId: currentUserId
			});

			success = 'Registration closed.';
			await loadTournamentData();
		} catch (err) {
			console.error('Close registration error:', err);
			error = getFriendlyErrorMessage(err, 'Could not close registration.');
		} finally {
			actionLoading = '';
		}
	}

	async function handleGenerateMatches() {
		if (!currentUserId) return;

		actionLoading = 'generate-matches';
		error = '';
		success = '';

		try {
			await generateTournamentMatches({
				eventId: event.id,
				userId: currentUserId
			});

			success = 'Tournament matches generated.';
			activeTab = 'bracket';
			await loadTournamentData();
		} catch (err) {
			console.error('Generate matches error:', err);
			error = getFriendlyErrorMessage(err, 'Could not generate matches.');
		} finally {
			actionLoading = '';
		}
	}

	async function handleSaveMatch(match: TournamentMatch) {
		if (!currentUserId) return;

		const input = matchInputs[match.id];

		if (!input) return;

		actionLoading = `match-${match.id}`;
		error = '';
		success = '';

		try {
			const homeScore = Number(input.homeScore);
			const awayScore = Number(input.awayScore);

			if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
				throw new Error('Add valid scores for both sides.');
			}

			await updateTournamentMatchResult({
				matchId: match.id,
				userId: currentUserId,
				homeScore,
				awayScore,
				scheduledAt:
					input.scheduledDate && input.scheduledTime
						? new Date(`${input.scheduledDate}T${input.scheduledTime}`)
						: null
			});

			success = 'Match updated.';
			await loadTournamentData();
		} catch (err) {
			console.error('Update match result error:', err);
			error = getFriendlyErrorMessage(err, 'Could not update match.');
		} finally {
			actionLoading = '';
		}
	}

	function toggleFriendSelection(friendId: string) {
		if (selectedFriendIds.includes(friendId)) {
			selectedFriendIds = selectedFriendIds.filter((id) => id !== friendId);
		} else {
			selectedFriendIds = [...selectedFriendIds, friendId];
		}
	}

	function openInviteFriends(entryId: string) {
		inviteTeamId = entryId;
		selectedFriendIds = [];
	}

	async function handleInviteFriends(entry: TournamentEntry) {
		if (!currentUserId) return;

		actionLoading = `invite-team-${entry.id}`;
		error = '';
		success = '';

		try {
			if (selectedFriendIds.length === 0) {
				throw new Error('Choose at least one friend to invite.');
			}

			await inviteUsersToTournamentTeam({
				eventId: event.id,
				teamId: entry.id,
				teamName: entry.name,
				fromUserId: currentUserId,
				toUserIds: selectedFriendIds
			});

			success = 'Team invites sent.';
			inviteTeamId = null;
			selectedFriendIds = [];
		} catch (err) {
			console.error('Invite team friends error:', err);
			error = getFriendlyErrorMessage(err, 'Could not send team invites.');
		} finally {
			actionLoading = '';
		}
	}

	async function handleLeaveTournament() {
		if (!currentUserId) return;

		actionLoading = 'leave-tournament';
		error = '';
		success = '';

		try {
			await leaveTournament({
				eventId: event.id,
				userId: currentUserId
			});

			success = 'You left the tournament.';
			await loadTournamentData();
		} catch (err) {
			console.error('Leave tournament error:', err);
			error = getFriendlyErrorMessage(err, 'Could not leave tournament.');
		} finally {
			actionLoading = '';
		}
	}

	async function handleCancelTournament() {
		if (!currentUserId) return;

		actionLoading = 'cancel-tournament';
		error = '';
		success = '';

		try {
			await cancelEvent(event.id, currentUserId);

			success = 'Tournament cancelled.';
		} catch (err) {
			console.error('Cancel tournament error:', err);
			error = getFriendlyErrorMessage(err, 'Could not cancel tournament.');
		} finally {
			actionLoading = '';
		}
	}

	onMount(() => {
		void loadTournamentData();
		return subscribeToTournamentChanges(event.id, () => void loadTournamentData());
	});
</script>

{#snippet matchCard(match: TournamentMatch, roundTitle: string, compact = false)}
	<div
		class={`rounded-2xl border shadow-sm transition ${compact ? 'p-2.5 sm:p-3' : 'p-4'} ${
			match.status === 'finished'
				? 'border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/30'
				: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
		}`}
	>
		<div class={`flex items-center justify-between ${compact ? 'gap-1.5' : 'gap-3'}`}>
			<p
				class={`${compact ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-[0.2em] text-slate-400`}
			>
				{match.groupName ? `${i18n.t('group_label') || 'Group'} ${match.groupName}` : roundTitle}
			</p>
			<p
				class={`${compact ? 'text-[9px]' : 'text-[10px]'} font-bold text-slate-500 dark:text-slate-400`}
			>
				{formatTimestamp(match.scheduledAt)}
			</p>
		</div>

		<div
			class={`${compact ? 'mt-2' : 'mt-3'} overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700`}
		>
			<div
				class={`flex items-center ${compact ? 'min-h-10 gap-1.5 px-2 py-1.5' : 'min-h-12 gap-2 px-3 py-2'} ${
					match.winnerName === match.homeName && match.status === 'finished'
						? 'bg-purple-600 text-white'
						: 'bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200'
				}`}
			>
				{#if getMatchProfile(match.homeEntryId) && compact}
					<img
						src={getMatchProfile(match.homeEntryId)?.photoURL ?? ''}
						alt={match.homeName}
						referrerpolicy="no-referrer"
						class="h-7 w-7 shrink-0 rounded-full bg-slate-100 object-cover dark:bg-slate-800"
					/>
				{:else if getMatchProfile(match.homeEntryId)}
					<UserAvatar
						photoURL={getMatchProfile(match.homeEntryId)?.photoURL}
						displayName={match.homeName}
						size="sm"
					/>
				{:else}
					<span
						class={`flex shrink-0 items-center justify-center rounded-full bg-slate-100 font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300 ${compact ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs'}`}
					>
						{match.homeName.slice(0, 1).toUpperCase()}
					</span>
				{/if}
				<span class={`min-w-0 flex-1 truncate font-black ${compact ? 'text-xs' : 'text-sm'}`}
					>{match.homeName}</span
				>
				<span class={`${compact ? 'text-base' : 'text-lg'} font-black`}
					>{scoreValue(match.homeScore) || '–'}</span
				>
			</div>

			<div
				class={`flex items-center border-t border-slate-200 dark:border-slate-700 ${compact ? 'min-h-10 gap-1.5 px-2 py-1.5' : 'min-h-12 gap-2 px-3 py-2'} ${
					match.winnerName === match.awayName && match.status === 'finished'
						? 'bg-purple-600 text-white'
						: 'bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200'
				}`}
			>
				{#if getMatchProfile(match.awayEntryId) && compact}
					<img
						src={getMatchProfile(match.awayEntryId)?.photoURL ?? ''}
						alt={match.awayName}
						referrerpolicy="no-referrer"
						class="h-7 w-7 shrink-0 rounded-full bg-slate-100 object-cover dark:bg-slate-800"
					/>
				{:else if getMatchProfile(match.awayEntryId)}
					<UserAvatar
						photoURL={getMatchProfile(match.awayEntryId)?.photoURL}
						displayName={match.awayName}
						size="sm"
					/>
				{:else}
					<span
						class={`flex shrink-0 items-center justify-center rounded-full bg-slate-100 font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300 ${compact ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs'}`}
					>
						{match.awayName.slice(0, 1).toUpperCase()}
					</span>
				{/if}
				<span class={`min-w-0 flex-1 truncate font-black ${compact ? 'text-xs' : 'text-sm'}`}
					>{match.awayName}</span
				>
				<span class={`${compact ? 'text-base' : 'text-lg'} font-black`}
					>{scoreValue(match.awayScore) || '–'}</span
				>
			</div>
		</div>

		{#if match.winnerName}
			<p class="mt-3 text-xs font-black text-purple-700 dark:text-purple-300">
				{i18n.t('advanced')}: {match.winnerName}
			</p>
		{/if}

		{#if canManage && isByeMatch(match) && match.status === 'finished'}
			<div
				class="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
			>
				{i18n.t('advanced_by_bye')}
			</div>
		{:else if canManage}
			<details class="group mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
				<summary
					class="cursor-pointer list-none rounded-xl bg-slate-100 px-3 py-2 text-center text-xs font-black text-slate-600 transition hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700"
				>
					<span class="group-open:hidden">{i18n.t('edit_result')}</span>
					<span class="hidden group-open:inline">{i18n.t('close_editor')}</span>
				</summary>
				<div class="mt-2 grid gap-2">
					<div class="grid grid-cols-2 gap-2">
						<input
							bind:value={matchInputs[match.id].scheduledDate}
							type="date"
							aria-label={`Schedule date for ${match.homeName} versus ${match.awayName}`}
							class="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-slate-500 dark:focus:ring-slate-700"
						/>
						<TimeSelect
							bind:value={matchInputs[match.id].scheduledTime}
							placeholder={i18n.t('time')}
							flush
						/>
					</div>
					<div class="grid grid-cols-2 gap-2">
						<input
							bind:value={matchInputs[match.id].homeScore}
							type="number"
							min="0"
							placeholder={match.homeName}
							aria-label={`${match.homeName} score`}
							class="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
						/>
						<input
							bind:value={matchInputs[match.id].awayScore}
							type="number"
							min="0"
							placeholder={match.awayName}
							aria-label={`${match.awayName} score`}
							class="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
						/>
					</div>
					<button
						type="button"
						onclick={() => handleSaveMatch(match)}
						disabled={actionLoading === `match-${match.id}` ||
							!match.homeEntryId ||
							!match.awayEntryId}
						class="rounded-xl bg-purple-600 px-4 py-2 text-sm font-black text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{!match.homeEntryId || !match.awayEntryId
							? i18n.t('awaiting_participants')
							: actionLoading === `match-${match.id}`
								? i18n.t('saving')
								: i18n.t('save_result')}
					</button>
				</div>
			</details>
		{/if}
	</div>
{/snippet}

<section
	class="mt-4 w-full min-w-0 max-w-full overflow-hidden rounded-[1.75rem] bg-white/75 p-4 shadow-sm shadow-slate-200/60 ring-1 ring-slate-200/70 [contain:inline-size] dark:bg-slate-900/80 dark:shadow-none dark:ring-slate-800 sm:mt-8 sm:rounded-[2rem] sm:border sm:border-slate-200 sm:bg-white sm:p-7 sm:shadow-xl sm:shadow-slate-200/70 sm:ring-0 sm:dark:border-slate-800 sm:dark:bg-slate-900 sm:dark:shadow-none"
>
	<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
		<div class="min-w-0">
			<div class="flex flex-wrap items-center gap-2">
				<span
					class="rounded-full bg-purple-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-purple-700 dark:bg-purple-950 dark:text-purple-300"
				>
					{i18n.t('tournament')}
				</span>

				<span
					class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300"
				>
					{i18n.t('status_' + (event.tournamentStatus ?? 'registration_open'))}
				</span>
			</div>

			<h2
				class="mt-2 text-xl font-black leading-tight tracking-tight text-slate-950 dark:text-slate-50 sm:mt-3 sm:text-3xl"
			>
				{formatTournamentFormat()}
			</h2>

			<p class="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400 sm:mt-2">
				{formatRegistrationType()} · {entries.length}/{maxEntries} {i18n.t('registered')}
			</p>
		</div>

		<div
			class="grid w-full grid-cols-3 rounded-2xl bg-slate-100 p-1 shadow-sm shadow-slate-200/60 dark:bg-slate-800 dark:shadow-none lg:w-auto lg:min-w-[21rem]"
		>
			<button
				type="button"
				onclick={() => (activeTab = 'overview')}
				class={`whitespace-nowrap rounded-xl px-2 py-2 text-xs font-black transition sm:px-4 sm:text-sm ${
					activeTab === 'overview'
						? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white'
						: 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
				}`}
			>
				{i18n.t('overview')}
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'entries')}
				class={`whitespace-nowrap rounded-xl px-2 py-2 text-xs font-black transition sm:px-4 sm:text-sm ${
					activeTab === 'entries'
						? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white'
						: 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
				}`}
			>
				{i18n.t('entry')}
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'bracket')}
				class={`whitespace-nowrap rounded-xl px-2 py-2 text-xs font-black transition sm:px-4 sm:text-sm ${
					activeTab === 'bracket'
						? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white'
						: 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
				}`}
			>
				{i18n.t('championship_bracket')}
			</button>
		</div>
	</div>

	{#if error}
		<div
			class="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300"
		>
			{error}
		</div>
	{/if}

	{#if success}
		<div
			class="mt-5 rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-700 dark:bg-green-950/40 dark:text-green-300"
		>
			{success}
		</div>
	{/if}

	{#if loading}
		<p class="mt-6 text-sm font-bold text-slate-500 dark:text-slate-400">{i18n.t('loading_tournament')}</p>
	{:else if activeTab === 'overview'}
		<div class="mt-5 grid grid-cols-2 gap-3 sm:mt-7 sm:grid-cols-2 sm:gap-4 xl:grid-cols-5">
			<div class="flex flex-col justify-start gap-1 h-auto min-h-fit rounded-2xl bg-slate-50 p-3 dark:bg-slate-950 sm:rounded-3xl sm:border sm:border-slate-100 sm:p-5 sm:dark:border-slate-800">
				<p class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">{i18n.t('format')}</p>
				<p class="mt-1 text-sm font-black text-slate-950 dark:text-slate-50 sm:mt-3 sm:text-lg">
					{formatTournamentFormat()}
				</p>
			</div>

			<div class="flex flex-col justify-start gap-1 h-auto min-h-fit rounded-2xl bg-slate-50 p-3 dark:bg-slate-950 sm:rounded-3xl sm:border sm:border-slate-100 sm:p-5 sm:dark:border-slate-800">
				<p class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">{i18n.t('registration')}</p>
				<p class="mt-1 text-sm font-black text-slate-950 dark:text-slate-50 sm:mt-3 sm:text-lg">
					{entries.length}/{maxEntries}
				</p>
			</div>

			<div class="flex flex-col justify-start gap-1 h-auto min-h-fit rounded-2xl bg-slate-50 p-3 dark:bg-slate-950 sm:rounded-3xl sm:border sm:border-slate-100 sm:p-5 sm:dark:border-slate-800">
				<p class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">{i18n.t('duration')}</p>
				<p class="mt-1 text-sm font-black text-slate-950 dark:text-slate-50 sm:mt-3 sm:text-lg">
					{formatTournamentDuration()}
				</p>
			</div>

			<div class="flex flex-col justify-start gap-1 h-auto min-h-fit rounded-2xl bg-slate-50 p-3 dark:bg-slate-950 sm:rounded-3xl sm:border sm:border-slate-100 sm:p-5 sm:dark:border-slate-800">
				<p class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">{i18n.t('entry_cost')}</p>
				<p class="mt-1 text-sm font-black text-slate-950 dark:text-slate-50 sm:mt-3 sm:text-lg">
					{event.entryFeeType === 'free' ? i18n.t('free') : `€${event.entryFeeAmount ?? 0}`}
				</p>
			</div>

			<div class="col-span-2 flex flex-col justify-start gap-1 h-auto min-h-fit rounded-2xl bg-slate-50 p-3 dark:bg-slate-950 sm:col-span-1 sm:rounded-3xl sm:border sm:border-slate-100 sm:p-5 sm:dark:border-slate-800">
				<p class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">{i18n.t('prize')}</p>
				<p class="mt-1 line-clamp-2 text-sm font-black text-slate-950 dark:text-slate-50 sm:mt-3 sm:text-lg">
					{event.prizeType === 'none' ? i18n.t('no_prize') : event.prizeDescription || i18n.t('prize_type_' + event.prizeType) || event.prizeType}
				</p>
			</div>
		</div>

		{#if event.tournamentRules}
			<div class="mt-5 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950 sm:bg-white sm:p-5 sm:dark:bg-slate-900">
				<h3 class="text-sm font-black text-slate-950 dark:text-slate-50">{i18n.t('rules')}</h3>
				<p class="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600 dark:text-slate-300">
					{event.tournamentRules}
				</p>
			</div>
		{/if}

			{#if canManage}
				<div class="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:mt-6 sm:flex sm:flex-wrap sm:gap-3 sm:pt-5">
					{#if isRegistrationOpen}
						<button
							type="button"
							onclick={handleCloseRegistration}
							disabled={actionLoading === 'close-registration'}
							class="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800 sm:px-5 sm:py-3 sm:text-base"
						>
							{actionLoading === 'close-registration' ? i18n.t('closing') : i18n.t('close_signups')}
						</button>
					{/if}

					{#if matches.length === 0}
						<button
							type="button"
							onclick={handleGenerateMatches}
							disabled={actionLoading === 'generate-matches'}
							class="rounded-2xl bg-purple-600 px-3 py-2.5 text-xs font-black text-white shadow-lg shadow-purple-600/20 transition hover:bg-purple-700 disabled:opacity-60 sm:px-5 sm:py-3 sm:text-base"
						>
							{actionLoading === 'generate-matches' ? i18n.t('generating') : i18n.t('generate_matches')}
						</button>
					{/if}

				<button
						type="button"
						onclick={handleCancelTournament}
						disabled={actionLoading === 'cancel-tournament'}
						class="col-span-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-900 dark:bg-red-950 dark:text-red-300 sm:col-auto sm:px-5 sm:py-3 sm:text-base"
					>
						{actionLoading === 'cancel-tournament' ? i18n.t('cancelling') : i18n.t('cancel_tournament')}
					</button>
				</div>
		{/if}
	{:else if activeTab === 'entries'}
		<div class="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
			<div class="space-y-3">
				{#if entries.length === 0}
					<div
						class="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
					>
						{i18n.t('no_entries_yet')}
					</div>
				{:else}
					{#each entries as entry (entry.id)}
						<div class="rounded-2xl bg-white p-4 dark:bg-slate-900">
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="font-black text-slate-950 dark:text-slate-50">{entry.name}</p>
									<p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
										{entry.type === 'team'
											? `${entry.memberIds.length}/${entry.maxMembers ?? event.maxTeamSize ?? '?'} ${i18n.t('players_lowercase')}`
											: i18n.t('individual_player')}
										{#if entry.groupName}
											· {i18n.t('group_name', { name: entry.groupName })}{/if}
									</p>
								</div>

								{#if entry.isOpen && !userEntry && isRegistrationOpen && !isOrganizationAccount && !isTournamentHost}
									<button
										type="button"
										onclick={() => handleJoinTeam(entry.id)}
										disabled={actionLoading === `join-team-${entry.id}`}
										class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
									>
										{actionLoading === `join-team-${entry.id}` ? i18n.t('joining') : i18n.t('join_team')}
									</button>
								{/if}
							</div>

							{#if entry.type === 'team'}
								<div class="mt-3 flex flex-wrap gap-2">
									{#each entry.memberIds as memberId}
										<div
											class="flex items-center gap-2 rounded-full bg-slate-50 py-1.5 pl-3 pr-1.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
										>
											<span
												>{getMemberName(memberId)}{entry.captainId === memberId
													? ` · ${i18n.t('captain')}`
													: ''}</span
											>
											{#if canManage && event.tournamentStatus !== 'in_progress' && event.tournamentStatus !== 'finished'}
												<button
													type="button"
													onclick={() => (pendingRemovalKey = `player-${entry.id}-${memberId}`)}
													class="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950"
													aria-label={`${i18n.t('remove_player')} ${getMemberName(memberId)}`}
												>
													×
												</button>
											{/if}
										</div>
									{/each}
								</div>
							{/if}

							{#if canManage && event.tournamentStatus !== 'in_progress' && event.tournamentStatus !== 'finished'}
								<div
									class="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800"
								>
									{#if pendingRemovalKey.startsWith(`player-${entry.id}-`)}
										{@const playerId = pendingRemovalKey.slice(`player-${entry.id}-`.length)}
										<span class="text-xs font-bold text-red-600"
											>{i18n.t('remove_player')} {getMemberName(playerId)}?</span
										>
										<button
											type="button"
											onclick={() => handleRemovePlayer(entry, playerId)}
											disabled={actionLoading === `remove-player-${playerId}`}
											class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-60"
											>{i18n.t('confirm')}</button
										>
										<button
											type="button"
											onclick={() => (pendingRemovalKey = '')}
											class="rounded-lg px-3 py-1.5 text-xs font-black text-slate-500"
											>{i18n.t('cancel')}</button
										>
									{:else if pendingRemovalKey === `entry-${entry.id}`}
										<span class="text-xs font-bold text-red-600"
											>{entry.type === 'team' ? i18n.t('remove_team') + '?' : i18n.t('remove_player') + '?'}</span
										>
										<button
											type="button"
											onclick={() => handleRemoveEntry(entry)}
											disabled={actionLoading === `remove-entry-${entry.id}`}
											class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-60"
											>{i18n.t('confirm')}</button
										>
										<button
											type="button"
											onclick={() => (pendingRemovalKey = '')}
											class="rounded-lg px-3 py-1.5 text-xs font-black text-slate-500"
											>{i18n.t('cancel')}</button
										>
									{:else}
										<button
											type="button"
											onclick={() => (pendingRemovalKey = `entry-${entry.id}`)}
											class="text-xs font-black text-red-600 transition hover:text-red-700"
										>
											{entry.type === 'team' ? i18n.t('remove_team') : i18n.t('remove_player')}
										</button>
									{/if}
								</div>
							{/if}
							{#if entry.type === 'team' && entry.captainId === currentUserId && isRegistrationOpen}
								<div class="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
									<button
										type="button"
										onclick={() => openInviteFriends(entry.id)}
										class="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
									>
										{i18n.t('invite_friends_to_team')}
									</button>

									{#if inviteTeamId === entry.id}
										<div class="mt-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
											{#if getInvitableFriends(entry).length === 0}
												<p class="text-sm font-bold text-slate-500 dark:text-slate-400">
													{i18n.t('no_friends_available_team')}
												</p>
											{:else}
												<div class="max-h-48 space-y-2 overflow-y-auto">
													{#each getInvitableFriends(entry) as friend (friend.id)}
														<label
															class="flex items-center justify-between rounded-xl bg-white px-3 py-2 dark:bg-slate-900"
														>
															<div class="min-w-0">
																<p
																	class="truncate text-sm font-black text-slate-950 dark:text-slate-50"
																>
																	{friend.displayName ?? 'Rally user'}
																</p>

																<p class="truncate text-xs text-slate-500 dark:text-slate-400">
																	@{friend.rallyTag ?? 'rally'}
																</p>
															</div>

															<input
																type="checkbox"
																checked={selectedFriendIds.includes(friend.id)}
																onchange={() => toggleFriendSelection(friend.id)}
																class="h-5 w-5"
															/>
														</label>
													{/each}
												</div>

												<div class="mt-3 flex gap-2">
													<button
														type="button"
														onclick={() => handleInviteFriends(entry)}
														disabled={actionLoading === `invite-team-${entry.id}`}
														class="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
													>
														{actionLoading === `invite-team-${entry.id}`
															? i18n.t('sending')
															: i18n.t('send_invites')}
													</button>

													<button
														type="button"
														onclick={() => (inviteTeamId = null)}
														class="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
													>
														{i18n.t('cancel')}
													</button>
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>

			{#if canRegisterInTournament}
				<div class="rounded-2xl bg-white p-5 dark:bg-slate-900">
					<h3 class="text-lg font-black text-slate-950 dark:text-slate-50">{i18n.t('join_tournament')}</h3>

					{#if event.tournamentRegistrationType === 'individual'}
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
							{i18n.t('register_individual_desc')}
						</p>

						<button
							type="button"
							onclick={handleJoinIndividual}
							disabled={actionLoading === 'join-individual'}
							class="mt-4 w-full rounded-2xl bg-blue-600 px-5 py-3 font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
						>
							{actionLoading === 'join-individual' ? i18n.t('joining') : i18n.t('join_tournament')}
						</button>
					{:else}
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
							{i18n.t('create_team_desc')}
						</p>

						<input
							bind:value={teamName}
							class="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							placeholder={i18n.t('team_name')}
						/>

						<label
							class="mt-3 flex items-center justify-between rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"
						>
							<span class="font-black text-slate-950 dark:text-slate-50">{i18n.t('open_team')}</span>
							<input bind:checked={teamOpen} type="checkbox" class="h-5 w-5" />
						</label>

						<button
							type="button"
							onclick={handleCreateTeam}
							disabled={actionLoading === 'create-team'}
							class="mt-4 w-full rounded-2xl bg-blue-600 px-5 py-3 font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
						>
							{actionLoading === 'create-team' ? i18n.t('creating_tournament') : i18n.t('create_team')}
						</button>
					{/if}
				</div>
			{:else if isOrganizationAccount || isTournamentHost}
				<div
					class="rounded-2xl bg-slate-50 p-5 text-sm font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400"
				>
					{i18n.t('host_cannot_register_desc')}
				</div>
			{:else if userEntry}
				<div class="rounded-2xl bg-white p-5 dark:bg-slate-900">
					<h3 class="text-lg font-black text-slate-950 dark:text-slate-50">{i18n.t('your_registration')}</h3>
					<p class="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">
						{i18n.t('registered_as', { name: userEntry.name })}
					</p>
					{#if userEntry.type === 'team'}
						<button
							type="button"
							onclick={() => handleOpenTeamChat(userEntry)}
							disabled={actionLoading === `team-chat-${userEntry.id}`}
							class="mt-4 w-full rounded-2xl bg-slate-950 px-5 py-3 font-black text-white transition hover:bg-blue-600 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-400"
						>
							{actionLoading === `team-chat-${userEntry.id}` ? i18n.t('opening') : i18n.t('open_team_chat')}
						</button>
					{/if}
					<button
						type="button"
						onclick={handleLeaveTournament}
						disabled={actionLoading === 'leave-tournament'}
						class="mt-4 w-full rounded-2xl border border-red-100 bg-red-50 px-5 py-3 font-black text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
					>
						{actionLoading === 'leave-tournament' ? i18n.t('leaving') : i18n.t('leave_tournament')}
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="mt-6 min-w-0 max-w-full space-y-6 overflow-hidden">
			{#if groupNames.length > 0}
				<div class="grid gap-4 md:grid-cols-2">
					{#each groupNames as groupName}
						<div class="rounded-2xl bg-white p-5 dark:bg-slate-900">
							<h3 class="text-lg font-black text-slate-950 dark:text-slate-50">
								{i18n.t('group_name', { name: groupName })}
							</h3>

							<div class="mt-3 space-y-2">
								{#each getEntriesForGroup(groupName) as entry (entry.id)}
									<div
										class="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
									>
										{entry.name}
									</div>
								{/each}
							</div>

							<table class="mt-4 w-full text-left text-xs">
								<thead class="text-slate-400">
									<tr>
										<th class="py-2">{i18n.t('entry')}</th>
										<th>{i18n.t('played_short')}</th>
										<th>{i18n.t('wins_short')}</th>
										<th>{i18n.t('draws_short')}</th>
										<th>{i18n.t('losses_short')}</th>
										<th>{i18n.t('points_short')}</th>
									</tr>
								</thead>

								<tbody>
									{#each getStandingRows(groupName) as row}
										<tr class="border-t border-slate-100 dark:border-slate-800">
											<td class="py-2 font-black text-slate-700 dark:text-slate-200">{row.name}</td>
											<td>{row.played}</td>
											<td>{row.wins}</td>
											<td>{row.draws}</td>
											<td>{row.losses}</td>
											<td class="font-black">{row.points}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/each}
				</div>
			{/if}

			{#if matches.length === 0}
				<div
					class="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
				>
					{i18n.t('matches_not_generated_yet')}
				</div>
			{:else}
				{#if championEntry}
					<div
						class="min-w-0 overflow-hidden rounded-3xl border border-amber-300 bg-gradient-to-br from-amber-50 via-white to-purple-50 p-4 shadow-lg shadow-amber-200/40 dark:border-amber-700 dark:from-amber-950/50 dark:via-slate-900 dark:to-purple-950/40 dark:shadow-none sm:p-6"
					>
						<div class="flex min-w-0 flex-col items-center text-center sm:flex-row sm:text-left">
							<div
								class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-white shadow-lg shadow-amber-400/30 sm:h-16 sm:w-16"
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.8"
									class="h-9 w-9"
									aria-hidden="true"
								>
									<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
									<path
										d="M8 6H5v1a4 4 0 0 0 4 4M16 6h3v1a4 4 0 0 1-4 4M12 12v4M8 20h8M9 16h6v4H9z"
									/>
								</svg>
							</div>
							<div class="mt-4 min-w-0 max-w-full sm:ml-5 sm:mt-0">
								<p
									class="text-xs font-black uppercase tracking-[0.25em] text-amber-600 dark:text-amber-400"
								>
									{i18n.t('tournament_champion')}
								</p>
								<div
									class="mt-2 flex min-w-0 max-w-full items-center justify-center gap-3 sm:justify-start"
								>
									{#if championProfile}
										<UserAvatar
											photoURL={championProfile.photoURL}
											displayName={championProfile.displayName}
											size="lg"
										/>
									{/if}
									<h3
										class="min-w-0 break-words text-xl font-black text-slate-950 dark:text-white sm:text-2xl"
									>
										{championEntry.name}
									</h3>
								</div>
							</div>
						</div>
					</div>
				{/if}

				{#if preliminarySections.length > 0}
					<div class="grid gap-4 lg:grid-cols-2">
						{#each preliminarySections as section}
							<section class="rounded-3xl bg-slate-50 p-5 dark:bg-slate-950">
								<h3 class="text-lg font-black text-slate-950 dark:text-slate-50">
									{section.title}
								</h3>
								<div class="mt-4 grid gap-3 sm:grid-cols-2">
									{#each section.matches as match (match.id)}
										{@render matchCard(match, section.title)}
									{/each}
								</div>
							</section>
						{/each}
					</div>
				{/if}

				{#if eliminationRounds.length > 0}
					<section
						class="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950"
					>
						<div class="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
							<h3 class="text-xl font-black text-slate-950 dark:text-white">
								{i18n.t('championship_bracket')}
							</h3>
							<p class="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">
								{i18n.t('winners_advance_desc')}
							</p>
							<p class="mt-2 text-xs font-black text-purple-600 dark:text-purple-400 sm:hidden">
								{i18n.t('scroll_sideways_desc')}
							</p>
						</div>
						<div class="bracket-scroll max-h-[68dvh] p-2 sm:max-h-[75dvh] sm:p-5">
							<div class="bracket-track flex items-stretch gap-4 sm:gap-8">
								{#each eliminationRounds as round, roundIndex}
									<div class="flex w-52 shrink-0 flex-col sm:w-72">
										<div class="mb-4 flex items-center justify-between">
											<h4 class="font-black text-slate-950 dark:text-white">{round.title}</h4>
											<span
												class="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:bg-slate-900"
												>{round.matches.length}
												{round.matches.length === 1 ? i18n.t('match') : i18n.t('matches')}</span
											>
										</div>
										<div class="flex flex-1 flex-col justify-around gap-5">
											{#each round.matches as match (match.id)}
												<div class="relative">
													{@render matchCard(match, round.title, true)}
													{#if roundIndex < eliminationRounds.length - 1}
														<span
															class="absolute left-full top-1/2 h-px w-5 bg-slate-300 dark:bg-slate-700 sm:w-8"
														></span>
													{/if}
												</div>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						</div>
					</section>
				{/if}
			{/if}
		</div>
	{/if}
</section>

<style>
	.bracket-scroll {
		width: 100%;
		min-width: 0;
		max-width: 100%;
		overflow-x: auto;
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		touch-action: pan-x pan-y;
	}

	.bracket-track {
		width: max-content;
		min-width: 100%;
	}

	@media (max-width: 639px) {
		.bracket-scroll {
			max-width: calc(100vw - 3rem);
		}
	}
</style>
