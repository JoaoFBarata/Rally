// src/lib/services/invite.service.ts

import {
	addDoc,
	collection,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	query,
	serverTimestamp,
	updateDoc,
	where,
	type Unsubscribe
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { EventInvite, InviteStatus } from '$lib/schema';
import {
	getTournamentEntries,
	joinEvent,
	joinTournamentTeam
} from '$lib/services/event.service';

export async function inviteUserToEvent(params: {
	eventId: string;
	fromUserId: string;
	toUserId: string;
}) {
	const inviteData = {
		eventId: params.eventId,
		fromUserId: params.fromUserId,
		toUserId: params.toUserId,
		inviteType: 'event',
		status: 'pending' satisfies InviteStatus,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	const docRef = await addDoc(collection(db, 'eventInvites'), inviteData);

	return {
		id: docRef.id,
		...inviteData
	};
}

export async function inviteUserToTournamentTeam(params: {
	eventId: string;
	teamId: string;
	teamName: string;
	fromUserId: string;
	toUserId: string;
}) {
	const entries = await getTournamentEntries(params.eventId);
	const team = entries.find((entry) => entry.id === params.teamId);

	if (!team || team.type !== 'team') {
		throw new Error('Team not found.');
	}

	if (team.captainId !== params.fromUserId) {
		throw new Error('Only the team captain can invite players.');
	}

	if (team.memberIds.includes(params.toUserId)) {
		throw new Error('This player is already in the team.');
	}

	const inviteData = {
		eventId: params.eventId,
		teamId: params.teamId,
		teamName: team.name,
		fromUserId: params.fromUserId,
		toUserId: params.toUserId,
		inviteType: 'tournament_team',
		status: 'pending' satisfies InviteStatus,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	const docRef = await addDoc(collection(db, 'eventInvites'), inviteData);

	return {
		id: docRef.id,
		...inviteData
	};
}

export async function inviteUsersToEvent(params: {
	eventId: string;
	fromUserId: string;
	toUserIds: string[];
}) {
	const uniqueUserIds = [...new Set(params.toUserIds)].filter(
		(userId) => userId && userId !== params.fromUserId
	);

	await Promise.all(
		uniqueUserIds.map((toUserId) =>
			inviteUserToEvent({
				eventId: params.eventId,
				fromUserId: params.fromUserId,
				toUserId
			})
		)
	);

	return uniqueUserIds.length;
}

export async function inviteUsersToTournamentTeam(params: {
	eventId: string;
	teamId: string;
	teamName: string;
	fromUserId: string;
	toUserIds: string[];
}) {
	const uniqueUserIds = [...new Set(params.toUserIds)].filter(
		(userId) => userId && userId !== params.fromUserId
	);

	await Promise.all(
		uniqueUserIds.map((toUserId) =>
			inviteUserToTournamentTeam({
				eventId: params.eventId,
				teamId: params.teamId,
				teamName: params.teamName,
				fromUserId: params.fromUserId,
				toUserId
			})
		)
	);

	return uniqueUserIds.length;
}

export async function getInvitesForUser(userId: string) {
	const q = query(collection(db, 'eventInvites'), where('toUserId', '==', userId));
	const snap = await getDocs(q);

	return snap.docs.map((docSnap) => ({
		id: docSnap.id,
		...docSnap.data()
	})) as EventInvite[];
}

export async function respondToInvite(params: {
	inviteId: string;
	eventId: string;
	userId: string;
	status: InviteStatus;
}) {
	const inviteRef = doc(db, 'eventInvites', params.inviteId);
	const inviteSnap = await getDoc(inviteRef);

	if (!inviteSnap.exists()) {
		throw new Error('Invite not found.');
	}

	const invite = {
		id: inviteSnap.id,
		...inviteSnap.data()
	} as EventInvite;

	if (invite.toUserId !== params.userId || invite.eventId !== params.eventId) {
		throw new Error('You cannot respond to this invite.');
	}

	if (invite.status !== 'pending') {
		throw new Error('This invite has already been answered.');
	}

	if (params.status === 'accepted' && invite.inviteType === 'tournament_team') {
		if (!invite.teamId) {
			throw new Error('Team invite is missing the team.');
		}

		await joinTournamentTeam({
			eventId: invite.eventId,
			teamId: invite.teamId,
			userId: params.userId,
			fromInvite: true
		});
	} else if (params.status === 'accepted') {
		await joinEvent(invite.eventId, params.userId);
	}

	await updateDoc(inviteRef, {
		status: params.status,
		updatedAt: serverTimestamp()
	});
}

export function listenInvitesForUser(
	userId: string,
	callback: (invites: EventInvite[]) => void,
	onError?: (error: Error) => void
): Unsubscribe {
	const q = query(
		collection(db, 'eventInvites'),
		where('toUserId', '==', userId),
		where('status', '==', 'pending')
	);

	return onSnapshot(
		q,
		(snap) => {
			const invites = snap.docs.map((docSnap) => ({
				id: docSnap.id,
				...docSnap.data()
			})) as EventInvite[];

			callback(invites);
		},
		(error) => {
			console.error('Invites listener error:', error);
			onError?.(error);
		}
	);
}
