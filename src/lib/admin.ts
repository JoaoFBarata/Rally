export const PLATFORM_ADMIN_EMAILS = [
	'duarte.v.ayres@gmail.com',
	'guilherme.martins.e.silva@gmail.com'
] as const;

export function isPlatformAdminEmail(email?: string | null) {
	const normalizedEmail = email?.trim().toLowerCase();
	return PLATFORM_ADMIN_EMAILS.some((adminEmail) => adminEmail === normalizedEmail);
}
