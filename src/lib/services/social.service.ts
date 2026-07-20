//C:\Users\henri\Fct3Ano\ADC\Rally\src\lib\services\social.service.ts
import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	query,
	serverTimestamp,
	setDoc,
	updateDoc,
	where,
	type Unsubscribe
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import { functions } from '$lib/firebase';
import { httpsCallable } from 'firebase/functions';
import type { FriendRequest, FriendRequestStatus, UserProfile } from '$lib/schema';
import { getUserProfile, searchUsersByRallyTag } from '$lib/services/user.service';

export type RelationshipStatus = 'self' | 'friends' | 'request_sent' | 'request_received' | 'none';

function friendshipIdFor(userA: string, userB: string) {
	return [userA, userB].sort().join('_');
}

function friendRequestIdFor(fromUserId: string, toUserId: string) {
	return `${fromUserId}_to_${toUserId}`;
}

async function createOrRenewFriendRequest(fromUserId: string, toUserId: string) {
	const friendshipsQuery = query(
		collection(db, 'friendships'),
		where('memberIds', 'array-contains', fromUserId)
	);
	const sentRequestsQuery = query(
		collection(db, 'friendRequests'),
		where('fromUserId', '==', fromUserId)
	);
	const receivedRequestsQuery = query(
		collection(db, 'friendRequests'),
		where('toUserId', '==', fromUserId)
	);

	const [friendshipsSnap, sentSnap, receivedSnap] = await Promise.all([
		getDocs(friendshipsQuery),
		getDocs(sentRequestsQuery),
		getDocs(receivedRequestsQuery)
	]);

	const alreadyFriends = friendshipsSnap.docs.some((friendshipDoc) =>
		(friendshipDoc.data().memberIds as string[] | undefined)?.includes(toUserId)
	);
	if (alreadyFriends) throw new Error('You are already friends with this user.');

	const previousSentRequest = sentSnap.docs.find(
		(requestDoc) => requestDoc.data().toUserId === toUserId
	);
	if (previousSentRequest?.data().status === 'pending') {
		throw new Error('Friend request already sent.');
	}

	const pendingReceivedRequest = receivedSnap.docs.some((requestDoc) => {
		const request = requestDoc.data();
		return request.fromUserId === toUserId && request.status === 'pending';
	});
	if (pendingReceivedRequest) {
		throw new Error('This user has already sent you a friend request. Check your messages.');
	}

	if (previousSentRequest) {
		await updateDoc(previousSentRequest.ref, {
			status: 'pending',
			updatedAt: serverTimestamp()
		});
		return;
	}

	const requestRef = doc(db, 'friendRequests', friendRequestIdFor(fromUserId, toUserId));
	await setDoc(requestRef, {
		id: requestRef.id,
		fromUserId,
		toUserId,
		status: 'pending',
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	});
}

export async function sendFriendRequestById(params: { fromUserId: string; toUserId: string }) {
	if (params.fromUserId === params.toUserId) {
		throw new Error('You cannot add yourself as a friend.');
	}

	const fromUser = await getUserProfile(params.fromUserId);
	if (fromUser?.accountType === 'organization') {
		throw new Error('Organizations cannot send friend requests.');
	}

	const sendRequest = httpsCallable<{ toUserId: string }, { status: string }>(
		functions,
		'sendFriendRequest'
	);
	await sendRequest({ toUserId: params.toUserId });
}

export async function sendFriendRequestByTag(params: { fromUserId: string; rallyTag: string }) {
	const fromUser = await getUserProfile(params.fromUserId);

	if (fromUser?.accountType === 'organization') {
		throw new Error('Organizations cannot send friend requests.');
	}

	const matches = await searchUsersByRallyTag(params.rallyTag);
	const targetUser = matches[0];

	if (!targetUser) {
		throw new Error('No user found with that Rally tag.');
	}

	if (targetUser.accountType === 'organization') {
		throw new Error('Organizations cannot be added as friends. Send them a message instead.');
	}

	if (targetUser.id === params.fromUserId) {
		throw new Error('You cannot add yourself as a friend.');
	}

	await createOrRenewFriendRequest(params.fromUserId, targetUser.id);

	return targetUser;
}

export async function getFriendRequestsForUser(userId: string) {
	const q = query(collection(db, 'friendRequests'), where('toUserId', '==', userId));

	const snap = await getDocs(q);

	return snap.docs.map((docSnap) => ({
		id: docSnap.id,
		...docSnap.data()
	})) as FriendRequest[];
}

export async function respondToFriendRequest(params: {
	requestId: string;
	status: FriendRequestStatus;
}) {
	const requestRef = doc(db, 'friendRequests', params.requestId);

	// Read the actual request doc rather than trusting the caller-supplied
	// fromUserId/toUserId — otherwise a tampered client could create a
	// friendship between arbitrary users via any request id.
	const requestSnap = await getDoc(requestRef);
	if (!requestSnap.exists()) {
		throw new Error('Friend request not found.');
	}

	const request = requestSnap.data() as FriendRequest;

	await updateDoc(requestRef, {
		status: params.status,
		updatedAt: serverTimestamp()
	});

	if (params.status === 'accepted') {
		const friendshipRef = doc(
			db,
			'friendships',
			friendshipIdFor(request.fromUserId, request.toUserId)
		);

		await setDoc(friendshipRef, {
			id: friendshipRef.id,
			memberIds: [request.fromUserId, request.toUserId],
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp()
		});
	}
}

export async function getFriendsForUser(userId: string) {
	const q = query(collection(db, 'friendships'), where('memberIds', 'array-contains', userId));

	const snap = await getDocs(q);

	const friends = await Promise.all(
		snap.docs.map(async (docSnap) => {
			const data = docSnap.data();
			const otherUserId = data.memberIds.find((id: string) => id !== userId);

			if (!otherUserId) return null;

			return getUserProfile(otherUserId);
		})
	);

	return friends.filter(Boolean) as UserProfile[];
}

export async function removeFriend(params: { currentUserId: string; friendId: string }) {
	if (params.currentUserId === params.friendId) {
		throw new Error('You cannot remove yourself.');
	}

	const friendshipRef = doc(
		db,
		'friendships',
		friendshipIdFor(params.currentUserId, params.friendId)
	);
	await deleteDoc(friendshipRef);
}

export function listenFriendRequestsForUser(
	userId: string,
	callback: (requests: FriendRequest[]) => void,
	onError?: (error: Error) => void
): Unsubscribe {
	const q = query(
		collection(db, 'friendRequests'),
		where('toUserId', '==', userId),
		where('status', '==', 'pending')
	);

	return onSnapshot(
		q,
		(snap) => {
			const requests = snap.docs.map((docSnap) => ({
				id: docSnap.id,
				...docSnap.data()
			})) as FriendRequest[];

			callback(requests);
		},
		(error) => {
			console.error('Friend requests listener error:', error);
			onError?.(error);
		}
	);
}

export async function addFriendByQrCode(params: { fromUserId: string; toUserId: string }) {
	if (params.toUserId === params.fromUserId) {
		throw new Error('You cannot add yourself as a friend.');
	}

	const addByQr = httpsCallable<{ toUserId: string }, { status: string }>(
		functions,
		'addFriendByQrCode'
	);
	await addByQr({ toUserId: params.toUserId });
}

export async function getRelationshipStatus(params: {
	currentUserId: string;
	targetUserId: string;
}): Promise<RelationshipStatus> {
	if (params.currentUserId === params.targetUserId) {
		return 'self';
	}

	const friendshipsQuery = query(
		collection(db, 'friendships'),
		where('memberIds', 'array-contains', params.currentUserId)
	);
	const friendshipSnap = await getDocs(friendshipsQuery);
	const friendshipExists = friendshipSnap.docs.some((friendshipDoc) =>
		(friendshipDoc.data().memberIds as string[] | undefined)?.includes(params.targetUserId)
	);

	if (friendshipExists) {
		return 'friends';
	}

	const sentRequestsQuery = query(
		collection(db, 'friendRequests'),
		where('fromUserId', '==', params.currentUserId)
	);
	const receivedRequestsQuery = query(
		collection(db, 'friendRequests'),
		where('toUserId', '==', params.currentUserId)
	);

	const [sentSnap, receivedSnap] = await Promise.all([
		getDocs(sentRequestsQuery),
		getDocs(receivedRequestsQuery)
	]);

	const sentRequestExists = sentSnap.docs.some((requestDoc) => {
		const request = requestDoc.data();
		return request.toUserId === params.targetUserId && request.status === 'pending';
	});
	const receivedRequestExists = receivedSnap.docs.some((requestDoc) => {
		const request = requestDoc.data();
		return request.fromUserId === params.targetUserId && request.status === 'pending';
	});

	if (sentRequestExists) {
		return 'request_sent';
	}

	if (receivedRequestExists) {
		return 'request_received';
	}

	return 'none';
}
