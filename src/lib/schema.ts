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

export interface UserProfile {
	id: string;
	email: string;
	displayName: string;
	photoURL?: string | null;

	sports: Sport[];
	location?: {
		city?: string;
		lat?: number;
		lng?: number;
	};

	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface SportEvent {
	id: string;
	title: string;
	description?: string;

	sport: Sport;
	creatorId: string;

	location: {
		name: string;
		address?: string;
		lat?: number;
		lng?: number;
	};

	startAt: Timestamp;
	endAt?: Timestamp;

	maxParticipants: number;
	participantIds: string[];

	visibility: EventVisibility;
	status: EventStatus;

	priceTotal?: number;
	pricePerPerson?: number;
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