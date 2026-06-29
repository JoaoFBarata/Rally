<!-- src/routes/events/create/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import LocationPickerMap from '$lib/components/maps/LocationPickerMap.svelte';
	import { createSportEvent } from '$lib/services/event.service';
	import { getFriendsForUser } from '$lib/services/social.service';
	import { inviteUsersToEvent } from '$lib/services/invite.service';
	import TimeSelect from '$lib/components/TimeSelect.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { goBack } from '$lib/utils/navigation';
	import { getFriendlyErrorMessage } from '$lib/utils/error-message.utils';
	import type { Sport, EventVisibility, SportLevel, UserProfile } from '$lib/schema';

	let title = $state('');
	let description = $state('');
	let sport = $state<Sport>('football');
	let customSport = $state('');
	let locationName = $state('');
	let lat = $state<number | null>(null);
	let lng = $state<number | null>(null);
	let address = $state('');
	let startDate = $state('');
	let startTime = $state('');
	let durationMinutes = $state(90);
	let maxParticipants = $state(10);
	let visibility = $state<EventVisibility>('private');
	let priceTotal = $state<number | null>(null);
	let level = $state<SportLevel>('casual');
	let loading = $state(false);
	let error = $state('');

	const todayStr = new Date().toLocaleDateString('en-CA');

	let showInviteModal = $state(false);
	let createdEventId = $state('');
	let createdEventTitle = $state('');
	let friends = $state<UserProfile[]>([]);
	let selectedFriendIds = $state<string[]>([]);
	let inviteSending = $state(false);
	let inviteError = $state('');

	async function handleCreateEvent() {
		error = '';

		const currentUser = auth.currentUser;

		if (!currentUser) {
			await goto(resolve('/login'));
			return;
		}

		if (
			!title ||
			!locationName ||
			!startDate ||
			!startTime ||
			maxParticipants < 2 ||
			!visibility ||
			!level
		) {
			error = 'Please fill in the required fields.';
			return;
		}
		const startAt = new Date(`${startDate}T${startTime}`);
		const duration = Number(durationMinutes);
		if (isNaN(startAt.getTime()) || startAt <= new Date()) {
			error = 'The event must be scheduled in the future.';
			return;
		}

		if (!duration || duration < 15) {
			error = 'Add a valid event duration.';
			return;
		}

		const endAt = new Date(startAt.getTime() + duration * 60_000);

		if (sport === 'other' && !customSport.trim()) {
			error = 'No sport added! Please specify to make it easier for others.';
			return;
		}

		if (lat === null || lng === null) {
			error = 'Please search an address or click on the map to select the event location.';
			return;
		}

		if (!address.trim()) {
			error = 'Please add an address for the event location.';
			return;
		}

		loading = true;

		try {
			const createdEvent = await createSportEvent({
				title,
				description,
				sport,
				level,
				creatorId: currentUser.uid,
				locationName,
				lat,
				lng,
				address,
				startAt,
				endAt,
				maxParticipants,
				visibility,
				priceTotal: priceTotal ?? undefined
			});

			createdEventId = createdEvent.id;
			createdEventTitle = createdEvent.title;
			friends = await getFriendsForUser(currentUser.uid);
			showInviteModal = true;
		} catch (err) {
			console.error('Create event error:', err);
			error = getFriendlyErrorMessage(err, 'Could not create event.');
		} finally {
			loading = false;
		}
	}

	function toggleFriend(friendId: string) {
		if (selectedFriendIds.includes(friendId)) {
			selectedFriendIds = selectedFriendIds.filter((id) => id !== friendId);
		} else {
			selectedFriendIds = [...selectedFriendIds, friendId];
		}
	}

	async function handleSendInvites() {
		const currentUser = auth.currentUser;
		if (!currentUser || !createdEventId) return;

		inviteSending = true;
		inviteError = '';

		try {
			await inviteUsersToEvent({
				eventId: createdEventId,
				fromUserId: currentUser.uid,
				toUserIds: selectedFriendIds
			});

			await goto(resolve('/dashboard'));
		} catch (err) {
			inviteError = getFriendlyErrorMessage(err, 'Could not send invites.');
			inviteSending = false;
		}
	}
</script>

<div class="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:px-5 sm:py-8">
	<button
		type="button"
		onclick={() => goBack(resolve('/dashboard'))}
		class="inline-flex rounded-full bg-blue-100 px-5 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
	>
		← Back
	</button>

	<div
		class="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:rounded-4xl sm:p-8"
	>
		<div class="mb-5 sm:mb-8">
			<h2 class="mt-2 text-3xl font-black text-slate-950 dark:text-slate-50">Create event</h2>

			<p class="mt-2 text-slate-500 dark:text-slate-400">
				Fill in the event details and start inviting people.
			</p>
		</div>

		{#if error}
			<div
				class="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
			>
				{error}
			</div>
		{/if}

		<div>
			<form
				class="space-y-5"
				onsubmit={(e) => {
					e.preventDefault();
					handleCreateEvent();
				}}
			>
				<div>
					<label for="title" class="text-sm font-bold text-slate-700 dark:text-slate-300">
						Event title
					</label>

					<input
						id="title"
						bind:value={title}
						placeholder="Saturday football match"
						class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
					/>
				</div>

				<div class="grid grid-cols-2 gap-3 sm:gap-5">
					<div class="min-w-0">
						<label for="sport" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Sport
						</label>

						<select
							id="sport"
							bind:value={sport}
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
						>
							<option value="football">Football</option>
							<option value="padel">Padel</option>
							<option value="basketball">Basketball</option>
							<option value="running">Running</option>
							<option value="gym">Gym</option>
							<option value="tennis">Tennis</option>
							<option value="cycling">Cycling</option>
							<option value="volleyball">Volleyball</option>
							<option value="other">Other</option>
						</select>

						{#if sport === 'other'}
							<input
								bind:value={customSport}
								placeholder="e.g. Climbing, Hockey, Surfing..."
								class="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
							/>
						{/if}
					</div>
					<div class="min-w-0">
						<label for="level" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Event level
						</label>

						<select
							id="level"
							bind:value={level}
							class="mt-2 w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
						>
							<option value="beginner">Beginner</option>
							<option value="casual">Casual</option>
							<option value="intermediate">Intermediate</option>
							<option value="advanced">Advanced</option>
						</select>
					</div>
				</div>
				<div>
					<label for="description" class="text-sm font-bold text-slate-700 dark:text-slate-300">
						Description
					</label>

					<textarea
						id="description"
						bind:value={description}
						placeholder="Casual game, all levels welcome..."
						class="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
					></textarea>
				</div>

				<div>
					<label for="location" class="text-sm font-bold text-slate-700 dark:text-slate-300">
						Location name
					</label>

					<input
						id="location"
						bind:value={locationName}
						placeholder="City Sports Center"
						class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
					/>
				</div>

				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
					<div class="min-w-0">
						<label for="startDate" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Event date
						</label>

						<input
							id="startDate"
							type="date"
							bind:value={startDate}
							min={todayStr}
							class="mt-2 w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-950 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-slate-500 dark:focus:bg-slate-800 dark:focus:ring-slate-700 sm:px-4"
						/>
					</div>

					<div class="min-w-0">
						<label for="startTime" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Start time
						</label>

						<TimeSelect id="startTime" bind:value={startTime} placeholder="Choose time" />
					</div>

					<div class="min-w-0">
						<label for="durationMinutes" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Duration (minutes)
						</label>

						<input
							id="durationMinutes"
							type="number"
							min="15"
							step="15"
							bind:value={durationMinutes}
							placeholder="90"
							class="mt-2 w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-950 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-slate-500 dark:focus:bg-slate-800 dark:focus:ring-slate-700 sm:px-4"
						/>
					</div>

					<div class="min-w-0">
						<label
							for="maxParticipants"
							class="text-sm font-bold text-slate-700 dark:text-slate-300"
						>
							Max players
						</label>

						<input
							id="maxParticipants"
							type="number"
							min="2"
							bind:value={maxParticipants}
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
						/>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3 sm:gap-5">
					<div>
						<label for="visibility" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Visibility
						</label>

						<select
							id="visibility"
							bind:value={visibility}
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
						>
							<option value="private">Private</option>
							<option value="friends">Friends</option>
							<option value="public">Public</option>
						</select>
					</div>

					<div>
						<label for="price" class="text-sm font-bold text-slate-700 dark:text-slate-300">
							Total price (€)
						</label>

						<input
							id="price"
							type="number"
							min="0"
							step="0.01"
							bind:value={priceTotal}
							placeholder="Optional"
							class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:ring-blue-950"
						/>
					</div>
				</div>
				<div class="mt-5 sm:mt-8">
					<LocationPickerMap bind:lat bind:lng bind:address />
				</div>
				<button
					type="submit"
					disabled={loading}
					class="mt-3 w-full rounded-2xl bg-blue-600 px-5 py-4 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-blue-950/40"
				>
					{loading ? 'Creating...' : 'Create event'}
				</button>
			</form>
		</div>
	</div>
</div>

{#if showInviteModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button
			type="button"
			aria-label="Skip inviting friends"
			class="absolute inset-0 bg-black/40 backdrop-blur-sm"
			onclick={() => goto(resolve('/dashboard'))}
		></button>

		<div
			class="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
		>
			<div class="flex items-start justify-between gap-4 p-6 pb-4">
				<div>
					<h2 class="text-2xl font-black text-slate-950 dark:text-slate-50">Invite friends?</h2>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						to <span class="font-bold text-slate-700 dark:text-slate-300">{createdEventTitle}</span>
					</p>
				</div>

				<button
					type="button"
					onclick={() => goto(resolve('/dashboard'))}
					class="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
					aria-label="Close"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>
			</div>

			{#if inviteError}
				<div
					class="mx-6 mb-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
				>
					{inviteError}
				</div>
			{/if}

			{#if friends.length === 0}
				<div class="px-6 pb-6 pt-2 text-center">
					<p class="text-3xl">👥</p>
					<p class="mt-3 text-sm text-slate-500 dark:text-slate-400">
						You have no friends to invite yet.
					</p>
					<button
						type="button"
						onclick={() => goto(resolve('/dashboard'))}
						class="mt-5 w-full rounded-2xl bg-blue-600 px-5 py-3 font-black text-white transition hover:bg-blue-700"
					>
						Do it later
					</button>
				</div>
			{:else}
				<div class="max-h-72 overflow-y-auto px-6">
					<div class="divide-y divide-slate-100 dark:divide-slate-800">
						{#each friends as friend (friend.id)}
							<button
								type="button"
								onclick={() => toggleFriend(friend.id)}
								class="flex w-full items-center gap-3 py-3 text-left"
							>
								<UserAvatar
									displayName={friend.displayName}
									email={friend.email}
									photoURL={friend.photoURL}
									size="md"
								/>

								<div class="min-w-0 flex-1">
									<p class="truncate font-black text-slate-950 dark:text-white">
										{friend.displayName}
									</p>
									<p class="truncate text-sm text-slate-500 dark:text-slate-400">
										@{friend.rallyTag}
									</p>
								</div>

								<div
									class={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-black transition ${
										selectedFriendIds.includes(friend.id)
											? 'border-blue-600 bg-blue-600 text-white'
											: 'border-slate-300 text-transparent dark:border-slate-700'
									}`}
								>
									✓
								</div>
							</button>
						{/each}
					</div>
				</div>

				<div class="flex gap-3 p-6 pt-4">
					<button
						type="button"
						onclick={() => goto(resolve('/dashboard'))}
						class="flex-1 rounded-2xl border border-slate-200 px-4 py-3 font-black text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
					>
						Skip
					</button>

					<button
						type="button"
						onclick={handleSendInvites}
						disabled={inviteSending || selectedFriendIds.length === 0}
						class="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{inviteSending
							? 'Sending...'
							: `Invite${selectedFriendIds.length > 0 ? ` (${selectedFriendIds.length})` : ''}`}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
