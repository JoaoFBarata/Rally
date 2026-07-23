export const TEXT_LIMITS = {
	displayName: 40,
	city: 60,
	bio: 180,
	eventTitle: 70,
	eventDescription: 700,
	whatToBring: 400,
	locationName: 90,
	customSport: 28,
	chatMessage: 10000,
	reviewComment: 500,
	reviewReply: 350,
	organizationName: 70,
	organizationDescription: 700,
	contactEmail: 120,
	phone: 30,
	website: 140,
	address: 140,
	taxId: 30
} as const;

export const EVENT_VALUE_LIMITS = {
	priceMax: 10000,
	participantsMax: 500,
	tournamentParticipantsMax: 1024,
	durationMinutesMax: 12 * 60 + 45,
	routePointsMax: 200
} as const;
