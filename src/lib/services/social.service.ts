//C:\Users\henri\Fct3Ano\ADC\Rally\src\lib\services\social.service.ts
import {
	collection,
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
import type { FriendRequest, FriendRequestStatus, UserProfile } from '$lib/schema';
import { getUserProfile, searchUsersByRallyTag } from '$lib/services/user.service';

function friendshipIdFor(userA: string, userB: string) {
	return [userA, userB].sort().join('_');
}

function friendRequestIdFor(fromUserId: string, toUserId: string) {
	return `${fromUserId}_to_${toUserId}`;
}

export async function sendFriendRequestByTag(params: {
	fromUserId: string;
	rallyTag: string;
}) {
	const matches = await searchUsersByRallyTag(params.rallyTag);
	const targetUser = matches[0];

	if (!targetUser) {
		throw new Error('No user found with that Rally tag.');
	}

	if (targetUser.id === params.fromUserId) {
		throw new Error('You cannot add yourself as a friend.');
	}

	const friendshipRef = doc(db, 'friendships', friendshipIdFor(params.fromUserId, targetUser.id));
	const friendshipSnap = await getDoc(friendshipRef);

	if (friendshipSnap.exists()) {
		throw new Error('You are already friends with this user.');
	}

	const requestRef = doc(db, 'friendRequests', friendRequestIdFor(params.fromUserId, targetUser.id));
	const reverseRequestRef = doc(db, 'friendRequests', friendRequestIdFor(targetUser.id, params.fromUserId));

	const requestSnap = await getDoc(requestRef);
	const reverseRequestSnap = await getDoc(reverseRequestRef);

	if (requestSnap.exists()) {
		throw new Error('Friend request already sent.');
	}

	if (reverseRequestSnap.exists()) {
		throw new Error('This user has already sent you a friend request. Check your messages.');
	}

	await setDoc(requestRef, {
		id: requestRef.id,
		fromUserId: params.fromUserId,
		toUserId: targetUser.id,
		status: 'pending',
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	});

	return targetUser;
}

export async function getFriendRequestsForUser(userId: string) {
	const q = query(
		collection(db, 'friendRequests'),
		where('toUserId', '==', userId)
	);

	const snap = await getDocs(q);

	return snap.docs.map((docSnap) => ({
		id: docSnap.id,
		...docSnap.data()
	})) as FriendRequest[];
}

export async function respondToFriendRequest(params: {
	requestId: string;
	fromUserId: string;
	toUserId: string;
	status: FriendRequestStatus;
}) {
	const requestRef = doc(db, 'friendRequests', params.requestId);

	await updateDoc(requestRef, {
		status: params.status,
		updatedAt: serverTimestamp()
	});

	if (params.status === 'accepted') {
		const friendshipRef = doc(db, 'friendships', friendshipIdFor(params.fromUserId, params.toUserId));

		await setDoc(friendshipRef, {
			id: friendshipRef.id,
			memberIds: [params.fromUserId, params.toUserId],
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp()
		});
	}
}

export async function getFriendsForUser(userId: string) {
	const q = query(
		collection(db, 'friendships'),
		where('memberIds', 'array-contains', userId)
	);

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