import type { Timestamp } from 'firebase/firestore';

export type Sport =
	| 'football'
	| 'padel'
	| 'basketball'
	| 'running'
	| 'gym'
	| 'tennis'
	| 'cycling'
	| 'volleyball'
	| 'other';

export type EventVisibility = 'private' | 'friends' | 'public';

export type EventStatus = 'draft' | 'open' | 'full' | 'cancelled' | 'finished';

export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'maybe';

export type PaymentStatus = 'not_required' | 'pending' | 'paid';

export type SportLevel = 'beginner' | 'casual' | 'intermediate' | 'advanced';

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';

export interface UserProfile {
	id: string;
	email: string;
	displayName: string;
	photoURL?: string | null;

	rallyTag?: string;
	bio?: string;
	city?: string;
	level?: SportLevel;

	sports: Sport[];

	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface SportEvent {
	id: string;
	title: string;
	description?: string;

	sport: Sport;
	creatorId: string;

	groupPhotoURL?: string | null;
    groupPhotoPath?: string | null;

	location: {
		name: string;
		address?: string;
		lat?: number | null;
		lng?: number | null;
	};

	startAt: Timestamp;
	endAt?: Timestamp | null;

	maxParticipants: number;
	participantIds: string[];

	visibility: EventVisibility;
	status: EventStatus;

	priceTotal?: number | null;
	pricePerPerson?: number | null;
	currency?: 'EUR';

	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface EventInvite {
	id: string;
	eventId: string;
	fromUserId: string;
	toUserId: string;
	status: InviteStatus;

	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface EventPayment {
	id: string;
	eventId: string;
	userId: string;
	amount: number;
	status: PaymentStatus;

	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface FriendRequest {
	id: string;
	fromUserId: string;
	toUserId: string;
	status: FriendRequestStatus;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface Friendship {
	id: string;
	memberIds: string[];
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface ChatConversation {
	id: string;
	memberIds: string[];
	type: 'direct' | 'group';

	eventId?: string;
	title?: string;
	photoURL?: string | null;

	lastMessage?: string;
	lastMessageAt?: Timestamp;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface ChatMessage {
	id: string;
	conversationId: string;
	senderId: string;
	text: string;
	createdAt: Timestamp;
}