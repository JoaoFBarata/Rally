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

export type AccountType = 'personal' | 'organization';
export type EventVisibility = 'private' | 'friends' | 'public';
export type EventStatus = 'draft' | 'open' | 'full' | 'cancelled' | 'finished';
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'maybe';
export type PaymentStatus = 'not_required' | 'pending' | 'paid' | 'refunded';
export type SportLevel = 'beginner' | 'casual' | 'intermediate' | 'advanced';
export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';

export type OrganizationType =
	| 'company'
	| 'sports_club'
	| 'venue'
	| 'gym'
	| 'event_organizer'
	| 'university'
	| 'community_group'
	| 'other';

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type VerificationLevel = 'none' | 'basic' | 'legal' | 'venue';
export type EventHostType = 'user' | 'organization';
export type EventPaymentMode = 'none' | 'split' | 'official';

export interface UserProfile {
	id: string;
	email: string;
	displayName: string;
	photoURL?: string | null;
	profilePhotoPath?: string | null;
    
	accountType?: AccountType;
	activeOrganizationId?: string | null;

	rallyTag?: string;
	bio?: string;
	city?: string;
	age?: number | null;
	level?: SportLevel;
	sports: Sport[];

	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface Organization {
	id: string;
	name: string;
	handle: string;
	type: OrganizationType;
	description?: string;
	logoURL?: string | null;
	logoPath?: string | null;

	website?: string;
	phone?: string;
	contactEmail: string;
	address?: string;
	city?: string;
	nif?: string;

	verificationStatus: VerificationStatus;
	verificationLevel: VerificationLevel;
	verificationNote?: string;
	verifiedAt?: Timestamp | null;
	verifiedBy?: string | null;

	ownerId: string;
	adminIds: string[];
	memberIds: string[];

	followersCount?: number;

	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface OrganizationFollower {
	id: string;
	organizationId: string;
	userId: string;
	createdAt: Timestamp;
}

export interface OrganizationVerificationRequest {
	id: string;
	organizationId: string;
	submittedBy: string;
	legalName: string;
	nif?: string;
	website?: string;
	address?: string;
	note?: string;
	requestedLevel: VerificationLevel;
	status: 'pending' | 'approved' | 'rejected';
	adminNote?: string;
	createdAt: Timestamp;
	updatedAt: Timestamp;
	reviewedAt?: Timestamp | null;
	reviewedBy?: string | null;
}

export interface SportEvent {
	id: string;
	title: string;
	description?: string;
	sport: Sport;

	// creatorId = user Firebase que criou o documento.
	creatorId: string;

	// hostType indica se o evento aparece publicamente como user ou organization.
	hostType?: EventHostType;
	organizationId?: string | null;
	organizationName?: string | null;
	organizationLogoURL?: string | null;
	organizationVerificationStatus?: VerificationStatus | null;

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
	paymentMode?: EventPaymentMode;

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

export interface ChatTypingState {
	userId: string;
	displayName: string;
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
	lastSenderId?: string;
	lastMessageAt?: Timestamp;
	unreadFor?: string[];
	unreadCounts?: Record<string, number>;
	typing?: Record<string, ChatTypingState>;
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
