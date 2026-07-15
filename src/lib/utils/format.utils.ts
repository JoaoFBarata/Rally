import { PUBLIC_MAPBOX_ACCESS_TOKEN } from '$env/static/public';

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
	if (!date) return 'Date not set';
	return date.toLocaleString('en-GB', {
		...(includeWeekday && { weekday: 'short' }),
		day: '2-digit',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function formatShortDate(dateValue: unknown): string {
	const date = toDate(dateValue);
	if (!date) return 'Soon';
	return date.toLocaleDateString('en-GB', {
		day: '2-digit',
		month: 'short'
	});
}

export function formatSport(sport: string | undefined | null): string {
	if (!sport) return '';
	return sport.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
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
	if (!event) return 'Free';
	const symbol = getCurrencySymbol(event.currency);
	if (event.entryFeeAmount && event.entryFeeAmount > 0) {
		return `${symbol}${Number(event.entryFeeAmount).toFixed(2)}`;
	}
	if (event.pricePerPerson && event.pricePerPerson > 0) {
		return `${symbol}${Number(event.pricePerPerson).toFixed(2)} / person`;
	}
	if (event.priceTotal && event.priceTotal > 0) {
		const max = event.maxParticipants ?? 0;
		if (max > 0) {
			return `${symbol}${(event.priceTotal / max).toFixed(2)} / person`;
		}
		return `${symbol}${Number(event.priceTotal).toFixed(2)} total`;
	}
	return 'Free';
}

export function formatCapacity(event: { participantIds?: string[]; maxParticipants?: number; eventKind?: string; maxTournamentEntries?: number } | undefined | null): string {
	if (!event) return '';
	const joinedCount = event.participantIds?.length ?? 0;
	if (event.eventKind === 'tournament') {
		const maxEntries = event.maxTournamentEntries ?? event.maxParticipants ?? 0;
		return `${joinedCount}/${maxEntries} entries`;
	}
	const maxParticipants = event.maxParticipants ?? 0;
	return `${joinedCount}/${maxParticipants} joined`;
}

export function getMiniMapUrl(lat: number | null | undefined, lng: number | null | undefined, width = 144, height = 104, zoom = 13): string {
	if (!PUBLIC_MAPBOX_ACCESS_TOKEN || typeof lat !== 'number' || typeof lng !== 'number') return '';
	const marker = `pin-s+2563eb(${lng},${lat})`;
	return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${marker}/${lng},${lat},${zoom},0/${width}x${height}@2x?access_token=${PUBLIC_MAPBOX_ACCESS_TOKEN}`;
}
