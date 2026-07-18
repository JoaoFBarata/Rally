import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';
import { i18n } from '../services/i18n.svelte';

const dateLocales = {
	en: 'en-GB',
	pt: 'pt-PT',
	es: 'es-ES',
	fr: 'fr-FR'
} as const;

export function getCurrentLocale(): string {
	return dateLocales[i18n.currentLang] ?? 'en-GB';
}

export function toDate(dateValue: unknown): Date | null {
	try {
		if (!dateValue) return null;
		const timestamp = dateValue as { toDate?: () => Date };
		if (typeof timestamp.toDate === 'function') {
			return timestamp.toDate();
		}
		if (dateValue instanceof Date) {
			return dateValue;
		}
		if (typeof dateValue === 'string' || typeof dateValue === 'number') {
			const d = new Date(dateValue);
			return Number.isNaN(d.getTime()) ? null : d;
		}
		return null;
	} catch {
		return null;
	}
}

export function formatDate(dateValue: unknown, includeWeekday = false): string {
	const date = toDate(dateValue);
	if (!date) return i18n.t('date_not_set');
	return date.toLocaleString(getCurrentLocale(), {
		...(includeWeekday && { weekday: 'short' }),
		day: '2-digit',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function formatShortDate(dateValue: unknown): string {
	const date = toDate(dateValue);
	if (!date) return i18n.t('soon');
	return date.toLocaleDateString(getCurrentLocale(), {
		day: '2-digit',
		month: 'short'
	});
}

export function formatSport(sport: string | undefined | null): string {
	if (!sport) return '';
	const key = `sport_${sport.toLowerCase()}`;
	const translated = i18n.t(key);
	if (translated !== key) {
		return translated;
	}
	return sport.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getSportBackgroundImage(sport: string | undefined | null): string {
	const normalizedSport = (sport || 'other').toLowerCase();
	const sportImageFiles: Record<string, string> = {
		football: 'football.png',
		padel: 'padel.png',
		basketball: 'basketball.png',
		running: 'running.png',
		gym: 'gym.png',
		tennis: 'tennis.png',
		cycling: 'cycling.png',
		volleyball: 'volleyball.png',
		bowling: 'bowling.png',
		snooker: 'snooker.png',
		golf: 'golf.png',
		swimming: 'swimming.png',
		hiking: 'hiking.png',
		yoga: 'yoga.png',
		surf: 'surf.png',
		pingpong: 'pingpong.png',
		rugby: 'rugby.png',
		americanfootball: 'americanFootball.png',
		other: 'other.png'
	};

	return `/event-backgrounds/${sportImageFiles[normalizedSport] ?? sportImageFiles.other}`;
}

export function getCurrencySymbol(currency?: string | null): string {
	const symbols: Record<string, string> = {
		EUR: '€',
		USD: '$',
		GBP: '£',
		BRL: 'R$'
	};

	return symbols[currency || 'EUR'] ?? currency ?? '€';
}

export function formatPrice(event: { pricePerPerson?: number; entryFeeAmount?: number; priceTotal?: number; maxParticipants?: number; currency?: string | null } | undefined | null): string {
	if (!event) return i18n.t('free');
	const symbol = getCurrencySymbol(event.currency);
	if (event.entryFeeAmount && event.entryFeeAmount > 0) {
		return `${symbol}${Number(event.entryFeeAmount).toFixed(2)}`;
	}
	if (event.pricePerPerson && event.pricePerPerson > 0) {
		return `${symbol}${Number(event.pricePerPerson).toFixed(2)}${i18n.t('per_person')}`;
	}
	if (event.priceTotal && event.priceTotal > 0) {
		const max = event.maxParticipants ?? 0;
		if (max > 0) {
			return `${symbol}${(event.priceTotal / max).toFixed(2)}${i18n.t('per_person')}`;
		}
		return `${symbol}${Number(event.priceTotal).toFixed(2)}${i18n.t('total_label')}`;
	}
	return i18n.t('free');
}

export function formatCapacity(event: { participantIds?: string[]; maxParticipants?: number; eventKind?: string; maxTournamentEntries?: number } | undefined | null): string {
	if (!event) return '';
	const joinedCount = event.participantIds?.length ?? 0;
	if (event.eventKind === 'tournament') {
		const maxEntries = event.maxTournamentEntries ?? event.maxParticipants ?? 0;
		return i18n.t('entries_count', { count: joinedCount, max: maxEntries });
	}
	const maxParticipants = event.maxParticipants ?? 0;
	return i18n.t('spots_count', { count: joinedCount, max: maxParticipants });
}

export function getMiniMapUrl(lat: number | null | undefined, lng: number | null | undefined, width = 144, height = 104, zoom = 13): string {
	if (!PUBLIC_MAPBOX_ACCESS_TOKEN || typeof lat !== 'number' || typeof lng !== 'number') return '';
	const marker = `pin-s+2563eb(${lng},${lat})`;
	return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${marker}/${lng},${lat},${zoom},0/${width}x${height}@2x?access_token=${PUBLIC_MAPBOX_ACCESS_TOKEN}`;
}
