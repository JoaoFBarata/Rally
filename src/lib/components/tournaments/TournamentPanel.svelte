<script lang="ts">
	import { onMount } from 'svelte';
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
		updateTournamentMatchResult,
        leaveTournament,
        cancelEvent
	} from '$lib/services/event.service';
	import { getUserProfile, getUserProfilesByIds } from '$lib/services/user.service';
    import { getFriendsForUser } from '$lib/services/social.service';
    import { inviteUsersToTournamentTeam } from '$lib/services/invite.service';

	let { event, currentUserId, canManage } = $props<{
		event: SportEvent;
		currentUserId: string;
		canManage: boolean;
	}>();

	let loading = $state(true);
	let error = $state('');
	let success = $state('');
	let actionLoading = $state('');

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
				scheduledAt: string;
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

	let canRegisterInTournament = $derived(
		!isOrganizationAccount && !isTournamentHost && isRegistrationOpen && !userEntry && !isFull
	);

	function getInvitableFriends(entry: TournamentEntry) {
		return friends.filter((friend) => !entry.memberIds.includes(friend.id));
	}

	function getMemberName(userId: string) {
		return memberProfiles[userId]?.displayName ?? 'Rally player';
	}

	function formatStage(stage: TournamentMatch['stage']) {
		if (stage === 'group') return 'Group stage';
		if (stage === 'league') return 'League matches';
		if (stage === 'knockout') return 'Knockout';
		if (stage === 'semi_final') return 'Semi-finals';
		if (stage === 'final') return 'Final';
		return stage;
	}

	function formatTournamentFormat() {
		if (event.tournamentFormat === 'groups_playoff') return 'Groups + Playoffs';
		if (event.tournamentFormat === 'knockout') return 'Knockout / Playoffs';
		if (event.tournamentFormat === 'league') return 'League / Championship';
		return 'Tournament';
	}

	function formatRegistrationType() {
		return event.tournamentRegistrationType === 'team' ? 'Teams' : 'Individual players';
	}

	function formatTimestamp(value: unknown) {
		try {
			const timestamp = value as { toDate?: () => Date };

			if (timestamp?.toDate) {
				return timestamp.toDate().toLocaleString('en-GB', {
					day: '2-digit',
					month: 'short',
					hour: '2-digit',
					minute: '2-digit'
				});
			}

			return 'Not scheduled';
		} catch {
			return 'Not scheduled';
		}
	}

	function timestampToLocalInput(value: unknown) {
		try {
			const timestamp = value as { toDate?: () => Date };
			if (!timestamp?.toDate) return '';

			const date = timestamp.toDate();
			const offset = date.getTimezoneOffset();
			const local = new Date(date.getTime() - offset * 60 * 1000);

			return local.toISOString().slice(0, 16);
		} catch {
			return '';
		}
	}

	function scoreValue(value: number | null | undefined) {
		return value === null || value === undefined ? '' : String(value);
	}

	async function loadTournamentData() {
		loading = true;
		error = '';

		try {
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
					scheduledAt: string;
				}
			> = {};

			for (const match of loadedMatches) {
				nextInputs[match.id] = {
					homeScore: scoreValue(match.homeScore),
					awayScore: scoreValue(match.awayScore),
					scheduledAt: timestampToLocalInput(match.scheduledAt)
				};
			}

            if (currentUserId) {
                currentUserProfile = await getUserProfile(currentUserId);
                friends = await getFriendsForUser(currentUserId);
            }

			matchInputs = nextInputs;
		} catch (err) {
			console.error('Load tournament data error:', err);
			error = err instanceof Error ? err.message : 'Could not load tournament data.';
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
			error = err instanceof Error ? err.message : 'Could not join tournament.';
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
			error = err instanceof Error ? err.message : 'Could not create team.';
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
			error = err instanceof Error ? err.message : 'Could not join team.';
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
			error = err instanceof Error ? err.message : 'Could not open the team chat.';
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
			error = err instanceof Error ? err.message : 'Could not remove the player.';
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
			success = entry.type === 'team' ? 'Team removed from the tournament.' : 'Player removed from the tournament.';
			await loadTournamentData();
		} catch (err) {
			console.error('Remove tournament entry error:', err);
			error = err instanceof Error ? err.message : 'Could not remove the entry.';
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
			error = err instanceof Error ? err.message : 'Could not close registration.';
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
			error = err instanceof Error ? err.message : 'Could not generate matches.';
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
				scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null
			});

			success = 'Match updated.';
			await loadTournamentData();
		} catch (err) {
			console.error('Update match result error:', err);
			error = err instanceof Error ? err.message : 'Could not update match.';
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
            error = err instanceof Error ? err.message : 'Could not send team invites.';
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
            error = err instanceof Error ? err.message : 'Could not leave tournament.';
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
            error = err instanceof Error ? err.message : 'Could not cancel tournament.';
        } finally {
            actionLoading = '';
        }
    }


	onMount(() => {
		loadTournamentData();
	});
</script>

<section
	class="mt-8 rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
>
	<div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
                <span
                    class="rounded-full bg-purple-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                >
                    Tournament
                </span>

                <span
                    class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                    {event.tournamentStatus?.replaceAll('_', ' ') ?? 'registration open'}
                </span>
            </div>

            <h2 class="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-slate-50">
                {formatTournamentFormat()}
            </h2>

            <p class="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">
                {formatRegistrationType()} · {entries.length}/{maxEntries} registered
            </p>
        </div>

        <div class="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
                type="button"
                onclick={() => (activeTab = 'overview')}
                class={`rounded-xl px-4 py-2 text-sm font-black transition ${
                    activeTab === 'overview'
                        ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white'
                        : 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                }`}
            >
                Overview
            </button>

            <button
                type="button"
                onclick={() => (activeTab = 'entries')}
                class={`rounded-xl px-4 py-2 text-sm font-black transition ${
                    activeTab === 'entries'
                        ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white'
                        : 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                }`}
            >
                Entries
            </button>

            <button
                type="button"
                onclick={() => (activeTab = 'bracket')}
                class={`rounded-xl px-4 py-2 text-sm font-black transition ${
                    activeTab === 'bracket'
                        ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white'
                        : 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                }`}
            >
                Bracket
            </button>
        </div>
    </div>

	{#if error}
		<div class="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
			{error}
		</div>
	{/if}

	{#if success}
		<div class="mt-5 rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-700 dark:bg-green-950 dark:text-green-300">
			{success}
		</div>
	{/if}

	{#if loading}
		<p class="mt-6 text-sm font-bold text-slate-500 dark:text-slate-400">Loading tournament...</p>
	{:else if activeTab === 'overview'}
		<div class="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-3xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
                <p class="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                    Format
                </p>
                <p class="mt-3 text-lg font-black text-slate-950 dark:text-slate-50">
                    {formatTournamentFormat()}
                </p>
            </div>

            <div class="rounded-3xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
                <p class="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                    Registration
                </p>
                <p class="mt-3 text-lg font-black text-slate-950 dark:text-slate-50">
                    {entries.length}/{maxEntries}
                </p>
            </div>

            <div class="rounded-3xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
                <p class="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                    Entry cost
                </p>
                <p class="mt-3 text-lg font-black text-slate-950 dark:text-slate-50">
                    {event.entryFeeType === 'free' ? 'Free' : `€${event.entryFeeAmount ?? 0}`}
                </p>
            </div>

            <div class="rounded-3xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
                <p class="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                    Prize
                </p>
                <p class="mt-3 line-clamp-2 text-lg font-black text-slate-950 dark:text-slate-50">
                    {event.prizeType === 'none' ? 'No prize' : event.prizeDescription || event.prizeType}
                </p>
            </div>
        </div>

		{#if event.tournamentRules}
			<div class="mt-5 rounded-2xl bg-white p-5 dark:bg-slate-900">
				<h3 class="font-black text-slate-950 dark:text-slate-50">Rules</h3>
				<p class="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">
					{event.tournamentRules}
				</p>
			</div>
		{/if}

		{#if canManage}
            <div class="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
                {#if isRegistrationOpen}
                    <button
                        type="button"
                        onclick={handleCloseRegistration}
                        disabled={actionLoading === 'close-registration'}
                        class="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-black text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                    >
                        {actionLoading === 'close-registration' ? 'Closing...' : 'Close registration'}
                    </button>
                {/if}

                {#if matches.length === 0}
                    <button
                        type="button"
                        onclick={handleGenerateMatches}
                        disabled={actionLoading === 'generate-matches'}
                        class="rounded-2xl bg-purple-600 px-5 py-3 font-black text-white shadow-lg shadow-purple-600/20 transition hover:bg-purple-700 disabled:opacity-60"
                    >
                        {actionLoading === 'generate-matches' ? 'Generating...' : 'Generate matches'}
                    </button>
                {/if}

                <button
                    type="button"
                    onclick={handleCancelTournament}
                    disabled={actionLoading === 'cancel-tournament'}
                    class="rounded-2xl border border-red-100 bg-red-50 px-5 py-3 font-black text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                >
                    {actionLoading === 'cancel-tournament' ? 'Cancelling...' : 'Cancel tournament'}
                </button>
            </div>
        {/if}
	{:else if activeTab === 'entries'}
		<div class="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
			<div class="space-y-3">
				{#if entries.length === 0}
					<div class="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
						No entries yet.
					</div>
				{:else}
					{#each entries as entry (entry.id)}
						<div class="rounded-2xl bg-white p-4 dark:bg-slate-900">
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="font-black text-slate-950 dark:text-slate-50">{entry.name}</p>
									<p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
										{entry.type === 'team' ? `${entry.memberIds.length}/${entry.maxMembers ?? event.maxTeamSize ?? '?'} players` : 'Individual player'}
										{#if entry.groupName} · Group {entry.groupName}{/if}
									</p>
								</div>

								{#if entry.isOpen && !userEntry && isRegistrationOpen && !isOrganizationAccount && !isTournamentHost}
									<button
										type="button"
										onclick={() => handleJoinTeam(entry.id)}
										disabled={actionLoading === `join-team-${entry.id}`}
										class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
									>
										{actionLoading === `join-team-${entry.id}` ? 'Joining...' : 'Join team'}
									</button>
								{/if}
							</div>

							{#if entry.type === 'team'}
								<div class="mt-3 flex flex-wrap gap-2">
									{#each entry.memberIds as memberId}
										<div class="flex items-center gap-2 rounded-full bg-slate-50 py-1.5 pl-3 pr-1.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
											<span>{getMemberName(memberId)}{entry.captainId === memberId ? ' · Captain' : ''}</span>
											{#if canManage && event.tournamentStatus !== 'in_progress' && event.tournamentStatus !== 'finished'}
												<button
													type="button"
													onclick={() => (pendingRemovalKey = `player-${entry.id}-${memberId}`)}
													class="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950"
													aria-label={`Remove ${getMemberName(memberId)}`}
												>
													×
												</button>
											{/if}
										</div>
									{/each}
								</div>
							{/if}

							{#if canManage && event.tournamentStatus !== 'in_progress' && event.tournamentStatus !== 'finished'}
								<div class="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
									{#if pendingRemovalKey.startsWith(`player-${entry.id}-`)}
										{@const playerId = pendingRemovalKey.slice(`player-${entry.id}-`.length)}
										<span class="text-xs font-bold text-red-600">Remove {getMemberName(playerId)}?</span>
										<button type="button" onclick={() => handleRemovePlayer(entry, playerId)} disabled={actionLoading === `remove-player-${playerId}`} class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-60">Confirm</button>
										<button type="button" onclick={() => (pendingRemovalKey = '')} class="rounded-lg px-3 py-1.5 text-xs font-black text-slate-500">Cancel</button>
									{:else if pendingRemovalKey === `entry-${entry.id}`}
										<span class="text-xs font-bold text-red-600">Remove {entry.type === 'team' ? 'this entire team' : entry.name}?</span>
										<button type="button" onclick={() => handleRemoveEntry(entry)} disabled={actionLoading === `remove-entry-${entry.id}`} class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-60">Confirm</button>
										<button type="button" onclick={() => (pendingRemovalKey = '')} class="rounded-lg px-3 py-1.5 text-xs font-black text-slate-500">Cancel</button>
									{:else}
										<button type="button" onclick={() => (pendingRemovalKey = `entry-${entry.id}`)} class="text-xs font-black text-red-600 transition hover:text-red-700">
											{entry.type === 'team' ? 'Remove team' : 'Remove player'}
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
                                        Invite friends to team
                                    </button>

                                    {#if inviteTeamId === entry.id}
                                        <div class="mt-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
	                                            {#if getInvitableFriends(entry).length === 0}
	                                                <p class="text-sm font-bold text-slate-500 dark:text-slate-400">
	                                                    You do not have available friends to invite.
	                                                </p>
	                                            {:else}
	                                                <div class="max-h-48 space-y-2 overflow-y-auto">
	                                                    {#each getInvitableFriends(entry) as friend (friend.id)}
                                                        <label class="flex items-center justify-between rounded-xl bg-white px-3 py-2 dark:bg-slate-900">
                                                            <div class="min-w-0">
                                                                <p class="truncate text-sm font-black text-slate-950 dark:text-slate-50">
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
                                                        {actionLoading === `invite-team-${entry.id}` ? 'Sending...' : 'Send invites'}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onclick={() => (inviteTeamId = null)}
                                                        class="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                                    >
                                                        Cancel
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
					<h3 class="text-lg font-black text-slate-950 dark:text-slate-50">Join tournament</h3>

					{#if event.tournamentRegistrationType === 'individual'}
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
							Register as an individual player.
						</p>

						<button
							type="button"
							onclick={handleJoinIndividual}
							disabled={actionLoading === 'join-individual'}
							class="mt-4 w-full rounded-2xl bg-blue-600 px-5 py-3 font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
						>
							{actionLoading === 'join-individual' ? 'Joining...' : 'Join tournament'}
						</button>
					{:else}
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
							Create a team. If open, other users can join your team.
						</p>

						<input
							bind:value={teamName}
							class="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
							placeholder="Team name"
						/>

						<label class="mt-3 flex items-center justify-between rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
							<span class="font-black text-slate-950 dark:text-slate-50">Open team</span>
							<input bind:checked={teamOpen} type="checkbox" class="h-5 w-5" />
						</label>

						<button
							type="button"
							onclick={handleCreateTeam}
							disabled={actionLoading === 'create-team'}
							class="mt-4 w-full rounded-2xl bg-blue-600 px-5 py-3 font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
						>
							{actionLoading === 'create-team' ? 'Creating...' : 'Create team'}
						</button>
					{/if}
				</div>
	            {:else if isOrganizationAccount || isTournamentHost}
	                <div class="rounded-2xl bg-slate-50 p-5 text-sm font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
	                    The tournament host cannot register as a player. Use a personal account that is not hosting this tournament.
	                </div>
			{:else if userEntry}
				<div class="rounded-2xl bg-white p-5 dark:bg-slate-900">
					<h3 class="text-lg font-black text-slate-950 dark:text-slate-50">Your registration</h3>
					<p class="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">
						You are registered as {userEntry.name}.
					</p>
					{#if userEntry.type === 'team'}
						<button
							type="button"
							onclick={() => handleOpenTeamChat(userEntry)}
							disabled={actionLoading === `team-chat-${userEntry.id}`}
							class="mt-4 w-full rounded-2xl bg-slate-950 px-5 py-3 font-black text-white transition hover:bg-blue-600 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-400"
						>
							{actionLoading === `team-chat-${userEntry.id}` ? 'Opening...' : 'Open team chat'}
						</button>
					{/if}
	                    <button
                        type="button"
                        onclick={handleLeaveTournament}
                        disabled={actionLoading === 'leave-tournament'}
                        class="mt-4 w-full rounded-2xl border border-red-100 bg-red-50 px-5 py-3 font-black text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                    >
                        {actionLoading === 'leave-tournament' ? 'Leaving...' : 'Leave tournament'}
                    </button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="mt-6 space-y-6">
			{#if groupNames.length > 0}
				<div class="grid gap-4 md:grid-cols-2">
					{#each groupNames as groupName}
						<div class="rounded-2xl bg-white p-5 dark:bg-slate-900">
							<h3 class="text-lg font-black text-slate-950 dark:text-slate-50">
								Group {groupName}
							</h3>

							<div class="mt-3 space-y-2">
								{#each getEntriesForGroup(groupName) as entry (entry.id)}
									<div class="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
										{entry.name}
									</div>
								{/each}
							</div>

							<table class="mt-4 w-full text-left text-xs">
								<thead class="text-slate-400">
									<tr>
										<th class="py-2">Entry</th>
										<th>P</th>
										<th>W</th>
										<th>D</th>
										<th>L</th>
										<th>Pts</th>
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
				<div class="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
					Matches have not been generated yet.
				</div>
			{:else}
				<div class="grid gap-4 xl:grid-cols-3">
					{#each matchSections as section}
						<section class="rounded-2xl bg-white p-5 dark:bg-slate-900">
							<h3 class="text-lg font-black text-slate-950 dark:text-slate-50">
								{section.title}
							</h3>

							<div class="mt-4 space-y-3">
								{#each section.matches as match (match.id)}
									<div
										class={`rounded-2xl border p-4 ${
											match.status === 'finished'
												? 'border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/30'
												: 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800'
										}`}
									>
										<div class="flex items-center justify-between gap-3">
											<p class="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
												{match.groupName ? `Group ${match.groupName}` : section.title}
											</p>

											<p class="text-xs font-bold text-slate-500 dark:text-slate-400">
												{formatTimestamp(match.scheduledAt)}
											</p>
										</div>

										<div class="mt-3 space-y-2">
											<div
												class={`flex items-center justify-between rounded-xl px-3 py-2 ${
													match.winnerName === match.homeName
														? 'bg-purple-600 text-white'
														: 'bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200'
												}`}
											>
												<span class="font-black">{match.homeName}</span>
												<span class="font-black">{scoreValue(match.homeScore)}</span>
											</div>

											<div
												class={`flex items-center justify-between rounded-xl px-3 py-2 ${
													match.winnerName === match.awayName
														? 'bg-purple-600 text-white'
														: 'bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200'
												}`}
											>
												<span class="font-black">{match.awayName}</span>
												<span class="font-black">{scoreValue(match.awayScore)}</span>
											</div>
										</div>

										{#if match.winnerName}
											<p class="mt-3 text-sm font-black text-purple-700 dark:text-purple-300">
												Winner: {match.winnerName}
											</p>
										{/if}

										{#if canManage}
											<div class="mt-4 grid gap-2">
												<input
													bind:value={matchInputs[match.id].scheduledAt}
													type="datetime-local"
													class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
												/>

												<div class="grid grid-cols-2 gap-2">
													<input
														bind:value={matchInputs[match.id].homeScore}
														type="number"
														min="0"
														placeholder="Home"
														class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
													/>

													<input
														bind:value={matchInputs[match.id].awayScore}
														type="number"
														min="0"
														placeholder="Away"
														class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
													/>
												</div>

												<button
													type="button"
													onclick={() => handleSaveMatch(match)}
													disabled={actionLoading === `match-${match.id}`}
													class="rounded-xl bg-purple-600 px-4 py-2 text-sm font-black text-white transition hover:bg-purple-700 disabled:opacity-60"
												>
													{actionLoading === `match-${match.id}` ? 'Saving...' : 'Save result'}
												</button>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</section>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</section>
