import {
	getSavedBookmarkIds,
	toggleBookmark,
	type BookmarkKind
} from '$lib/services/bookmark.service';
import { browser } from '$app/environment';

class BookmarkState {
	version = $state(0);

	constructor() {
		if (browser) {
			window.addEventListener('storage', () => this.refresh());
			window.addEventListener('rally:bookmarks-changed', () => this.refresh());
		}
	}

	isSaved(kind: BookmarkKind, id: string) {
		this.version;
		return Boolean(id) && getSavedBookmarkIds(kind).includes(id);
	}

	toggle(kind: BookmarkKind, id: string) {
		if (!id) return false;
		return toggleBookmark(kind, id);
	}

	refresh() {
		this.version++;
	}
}

export const bookmarkState = new BookmarkState();
