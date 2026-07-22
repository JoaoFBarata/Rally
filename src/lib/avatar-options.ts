import type { ProfileGender } from '$lib/schema';

export interface ProfileAvatarOption {
	id: string;
	gender: ProfileGender;
	src: string;
	labelKey: string;
}

export const profileAvatarOptions: ProfileAvatarOption[] = [
	// Female avatars
	{ id: 'female-tennis', gender: 'female', src: '/avatars/avatar_2.png', labelKey: 'sport_tennis' },
	{ id: 'female-running', gender: 'female', src: '/avatars/avatar_3.png', labelKey: 'sport_running' },
	{ id: 'female-football', gender: 'female', src: '/avatars/female_football.png', labelKey: 'sport_football' },
	{ id: 'female-basketball', gender: 'female', src: '/avatars/female_basketball.png', labelKey: 'sport_basketball' },
	{ id: 'female-cycling', gender: 'female', src: '/avatars/female_cycling.png', labelKey: 'sport_cycling' },
	{ id: 'female-swimming', gender: 'female', src: '/avatars/female_swimming.png', labelKey: 'sport_swimming' },
	{ id: 'female-volleyball', gender: 'female', src: '/avatars/female_volleyball.png', labelKey: 'sport_volleyball' },
	{ id: 'female-padel', gender: 'female', src: '/avatars/female_padel.png', labelKey: 'sport_padel' },

	// Male avatars
	{ id: 'male-football', gender: 'male', src: '/avatars/avatar_1.png', labelKey: 'sport_football' },
	{ id: 'male-basketball', gender: 'male', src: '/avatars/avatar_4.png', labelKey: 'sport_basketball' },
	{ id: 'male-cycling', gender: 'male', src: '/avatars/male_cycling.png', labelKey: 'sport_cycling' },
	{ id: 'male-swimming', gender: 'male', src: '/avatars/male_swimming.png', labelKey: 'sport_swimming' },
	{ id: 'male-padel', gender: 'male', src: '/avatars/male_padel.png', labelKey: 'sport_padel' },
	{ id: 'male-volleyball', gender: 'male', src: '/avatars/male_volleyball.png', labelKey: 'sport_volleyball' },
	{ id: 'male-boxing', gender: 'male', src: '/avatars/male_boxing.png', labelKey: 'sport_boxing' },
	{ id: 'male-hiking', gender: 'male', src: '/avatars/male_hiking.png', labelKey: 'sport_hiking' },

	// Gender-neutral Rally symbols
	{ id: 'neutral-trophy', gender: 'neutral', src: '/avatars/neutral_trophy.png', labelKey: 'avatar_neutral_trophy' },
	{ id: 'neutral-sports', gender: 'neutral', src: '/avatars/neutral_sports.png', labelKey: 'avatar_neutral_sports' },
	{ id: 'neutral-summit', gender: 'neutral', src: '/avatars/neutral_summit.png', labelKey: 'avatar_neutral_summit' },
	{ id: 'neutral-energy', gender: 'neutral', src: '/avatars/neutral_energy.png', labelKey: 'avatar_neutral_energy' }
];

export function getProfileAvatarsForGender(gender: ProfileGender) {
	return profileAvatarOptions.filter((avatar) => avatar.gender === gender);
}
