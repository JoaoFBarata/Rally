import type { ProfileGender } from '$lib/schema';

export interface ProfileAvatarOption {
	id: string;
	gender: ProfileGender;
	src: string;
	labelKey: string;
}

export const profileAvatarOptions: ProfileAvatarOption[] = [
	{
		id: 'female-rally-tennis',
		gender: 'female',
		src: '/avatars/avatar_2.png',
		labelKey: 'avatar_neutral_tennis'
	},
	{
		id: 'male-rally-football',
		gender: 'male',
		src: '/avatars/avatar_1.png',
		labelKey: 'avatar_neutral_football'
	},
	{
		id: 'neutral-football',
		gender: 'neutral',
		src: '/avatars/avatar_1.png',
		labelKey: 'avatar_neutral_football'
	},
	{
		id: 'neutral-tennis',
		gender: 'neutral',
		src: '/avatars/avatar_2.png',
		labelKey: 'avatar_neutral_tennis'
	},
	{
		id: 'neutral-training',
		gender: 'neutral',
		src: '/avatars/avatar_3.png',
		labelKey: 'avatar_neutral_training'
	},
	{
		id: 'neutral-cycling',
		gender: 'neutral',
		src: '/avatars/avatar_4.png',
		labelKey: 'avatar_neutral_cycling'
	}
];

export function getProfileAvatarsForGender(gender: ProfileGender) {
	return profileAvatarOptions.filter((avatar) => avatar.gender === gender);
}
