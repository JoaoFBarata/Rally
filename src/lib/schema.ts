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
export type PayoutStatus = 'not_applicable' | 'held' | 'released' | 'blocked';
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
export type EventPromotionStatus = 'none' | 'active' | 'paused' | 'ended';
export type EventPromotionPlan = 'local' | 'sport' | 'featured';

export type EventKind = 'standard' | 'tournament';

export type TournamentFormat = 'knockout' | 'groups_playoff' | 'league';

export type TournamentRegistrationType = 'individual' | 'team';

export type TournamentStatus =
	| 'registration_open'
	| 'registration_closed'
	| 'in_progress'
	| 'finished';

export type EntryFeeType = 'free' | 'paid' | 'split';

export type PrizeType = 'none' | 'trophy' | 'product' | 'cash' | 'other';

export type TournamentEntryStatus = 'pending' | 'confirmed' | 'eliminated' | 'winner';

export type TournamentMatchStage =
	| 'group'
	| 'knockout'
	| 'semi_final'
	| 'final'
	| 'league';

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
	customSport?: string;
	level?: SportLevel;
	creatorId: string;

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
	paymentProtected?: boolean;
	payoutStatus?: PayoutStatus;

	promotionStatus?: EventPromotionStatus;
	isPromoted?: boolean;

	promotionPlan?: EventPromotionPlan | null;
	promotionBudget?: number | null;
	promotionCpm?: number | null;
	promotionImpressionLimit?: number | null;

	promotionTargetCity?: string;
	promotionTargetSport?: Sport | null;

	promotionStartedAt?: Timestamp | null;
	promotionEndsAt?: Timestamp | null;

	promotionViews?: number;
	promotionClicks?: number;

	eventKind?: EventKind;

	tournamentFormat?: TournamentFormat | null;
	tournamentRegistrationType?: TournamentRegistrationType | null;
	tournamentStatus?: TournamentStatus | null;

	maxTournamentEntries?: number | null;
	groupCount?: number | null;
	teamsPerGroup?: number | null;
	playoffSpots?: number | null;

	teamSize?: number | null;
	minTeamSize?: number | null;
	maxTeamSize?: number | null;
	allowOpenTeams?: boolean;

	registrationDeadline?: Timestamp | null;

	entryFeeType?: EntryFeeType;
	entryFeeAmount?: number | null;

	prizeType?: PrizeType;
	prizeDescription?: string;
	prizeValue?: number | null;

	tournamentRules?: string;

	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface EventInvite {
	id: string;
	eventId: string;
	fromUserId: string;
	toUserId: string;

	inviteType?: 'event' | 'tournament_team';
	teamId?: string | null;
	teamName?: string | null;

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
	type: 'direct' | 'group' | 'organization_direct' | 'rally_system';

	eventId?: string;
	title?: string;
	photoURL?: string | null;

	organizationId?: string | null;
	organizationName?: string | null;
	organizationLogoURL?: string | null;
	organizationVerificationStatus?: VerificationStatus | null;
	userId?: string | null;

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

export interface TournamentEntry {
	id: string;
	eventId: string;

	type: TournamentRegistrationType;
	name: string;

	captainId?: string | null;
	memberIds: string[];

	isOpen?: boolean;
	maxMembers?: number | null;

	groupName?: string | null;
	seed?: number | null;

	status: TournamentEntryStatus;

	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface TournamentMatch {
	id: string;
	eventId: string;

	stage: TournamentMatchStage;
	roundNumber: number;
	groupName?: string | null;

	homeEntryId?: string | null;
	awayEntryId?: string | null;

	homeName: string;
	awayName: string;

	homeScore?: number | null;
	awayScore?: number | null;
	winnerEntryId?: string | null;
	winnerName?: string | null;

	status: 'scheduled' | 'finished';

	scheduledAt?: Timestamp | null;

	createdAt: Timestamp;
	updatedAt: Timestamp;
}