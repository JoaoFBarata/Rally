import { browser } from '$app/environment';

export type BookmarkKind = 'event' | 'venue';

const storageKeys: Record<BookmarkKind, string> = {
	event: 'rally-saved-events',
	venue: 'rally-saved-venues'
};

export function getSavedBookmarkIds(kind: BookmarkKind) {
	if (!browser) return [];
	try {
		const value = JSON.parse(localStorage.getItem(storageKeys[kind]) ?? '[]');
		return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
	} catch {
		return [];
	}
}

export function isBookmarkSaved(kind: BookmarkKind, id: string) {
	return getSavedBookmarkIds(kind).includes(id);
}

export function toggleBookmark(kind: BookmarkKind, id: string) {
	const ids = getSavedBookmarkIds(kind);
	const saved = ids.includes(id);
	const nextIds = saved ? ids.filter((savedId) => savedId !== id) : [...ids, id];
	localStorage.setItem(storageKeys[kind], JSON.stringify(nextIds));
	window.dispatchEvent(new CustomEvent('rally:bookmarks-changed', { detail: { kind, id } }));
	return !saved;
}
