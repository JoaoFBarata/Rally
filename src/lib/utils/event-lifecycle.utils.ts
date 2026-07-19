import type { SportEvent } from '$lib/schema';

export type EventTemporalState = 'cancelled' | 'finished' | 'live' | 'starting_soon' | 'upcoming';

export const DEFAULT_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;
export const STARTING_SOON_MS = 60 * 60 * 1000;

export function timestampToMillis(value: unknown): number {
	try {
		const timestamp = value as { toMillis?: () => number; toDate?: () => Date } | null;
		if (timestamp?.toMillis) return timestamp.toMillis();
		if (timestamp?.toDate) return timestamp.toDate().getTime();
		if (value instanceof Date) return value.getTime();
		if (typeof value === 'number') return value;
		if (typeof value === 'string') {
			const parsed = new Date(value).getTime();
			return Number.isNaN(parsed) ? 0 : parsed;
		}
		return 0;
	} catch {
		return 0;
	}
}

export function getEventStartMs(event: SportEvent): number {
	return timestampToMillis(event.startAt);
}

export function getEventEndMs(event: SportEvent): number {
	const explicitEndMs = timestampToMillis(event.endAt);
	if (explicitEndMs) return explicitEndMs;

	const startMs = getEventStartMs(event);
	if (!startMs) return 0;

	if (event.eventKind === 'tournament' || event.tournamentStatus) return 0;
	return startMs + DEFAULT_EVENT_DURATION_MS;
}

export function getEventTemporalState(
	event: SportEvent,
	nowMs = Date.now()
): EventTemporalState {
	if (event.status === 'cancelled') return 'cancelled';
	if (event.status === 'finished' || event.tournamentStatus === 'finished') return 'finished';

	const startMs = getEventStartMs(event);
	const endMs = getEventEndMs(event);

	if (endMs && nowMs >= endMs) return 'finished';
	if (startMs && nowMs >= startMs) return 'live';
	if (startMs && startMs - nowMs <= STARTING_SOON_MS) return 'starting_soon';

	return 'upcoming';
}

export function isEventLiveOrStartingSoon(event: SportEvent, nowMs = Date.now()) {
	const state = getEventTemporalState(event, nowMs);
	return state === 'live' || state === 'starting_soon';
}
