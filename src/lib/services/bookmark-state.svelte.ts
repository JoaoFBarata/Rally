import { browser } from '$app/environment';
import { auth, db } from '$lib/firebase';
import {
	arrayRemove,
	arrayUnion,
	doc,
	onSnapshot,
	updateDoc,
	type Unsubscribe
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import {
	getSavedBookmarkIds,
	setSavedBookmarkIds,
	type BookmarkKind
} from '$lib/services/bookmark.service';

class BookmarkState {
	version = $state(0);
	eventIds = $state<string[]>([]);
	venueIds = $state<string[]>([]);
	userId = $state('');
	ready = $state(false);
	private unsubscribeProfile: Unsubscribe | null = null;
	private migratedUsers = new Set<string>();

	constructor() {
		if (!browser) return;

		onAuthStateChanged(auth, (user) => {
			this.unsubscribeProfile?.();
			this.unsubscribeProfile = null;
			this.userId = user?.uid ?? '';
			this.ready = false;

			if (!user) {
				this.eventIds = getSavedBookmarkIds('event');
				this.venueIds = getSavedBookmarkIds('venue');
				this.ready = true;
				this.version++;
				return;
			}

			const profileRef = doc(db, 'users', user.uid);
			this.unsubscribeProfile = onSnapshot(profileRef, (snapshot) => {
				const data = snapshot.data();
				const serverEventIds = Array.isArray(data?.savedEventIds) ? data.savedEventIds : [];
				const serverVenueIds = Array.isArray(data?.savedVenueIds) ? data.savedVenueIds : [];
				const localEventIds = getSavedBookmarkIds('event');
				const localVenueIds = getSavedBookmarkIds('venue');
				const migrationOwner = localStorage.getItem('rally-bookmarks-migration-owner');
				const shouldMigrate =
					!this.migratedUsers.has(user.uid) && (!migrationOwner || migrationOwner === user.uid);

				this.eventIds = [
					...new Set(shouldMigrate ? [...serverEventIds, ...localEventIds] : serverEventIds)
				];
				this.venueIds = [
					...new Set(shouldMigrate ? [...serverVenueIds, ...localVenueIds] : serverVenueIds)
				];
				this.ready = true;
				this.version++;

				if (shouldMigrate) {
					this.migratedUsers.add(user.uid);
					localStorage.setItem('rally-bookmarks-migration-owner', user.uid);
					const migration: Promise<unknown>[] = [];
					if (localEventIds.length) {
						migration.push(updateDoc(profileRef, { savedEventIds: arrayUnion(...localEventIds) }));
					}
					if (localVenueIds.length) {
						migration.push(updateDoc(profileRef, { savedVenueIds: arrayUnion(...localVenueIds) }));
					}
					void Promise.all(migration).catch((error) =>
						console.error('Could not migrate local bookmarks to the account:', error)
					);
				}
			});
		});
	}

	getSavedIds(kind: BookmarkKind) {
		this.version;
		return kind === 'event' ? this.eventIds : this.venueIds;
	}

	isSaved(kind: BookmarkKind, id: string) {
		return Boolean(id) && this.getSavedIds(kind).includes(id);
	}

	toggle(kind: BookmarkKind, id: string) {
		if (!id) return;
		const wasSaved = this.isSaved(kind, id);
		const nextIds = wasSaved
			? this.getSavedIds(kind).filter((savedId) => savedId !== id)
			: [...this.getSavedIds(kind), id];

		if (kind === 'event') this.eventIds = nextIds;
		else this.venueIds = nextIds;
		setSavedBookmarkIds(kind, nextIds, id);
		this.version++;

		if (this.userId) {
			const field = kind === 'event' ? 'savedEventIds' : 'savedVenueIds';
			void updateDoc(doc(db, 'users', this.userId), {
				[field]: wasSaved ? arrayRemove(id) : arrayUnion(id)
			}).catch((error) => {
				console.error('Could not sync bookmark with the account:', error);
				if (kind === 'event')
					this.eventIds = wasSaved ? [...nextIds, id] : nextIds.filter((x) => x !== id);
				else this.venueIds = wasSaved ? [...nextIds, id] : nextIds.filter((x) => x !== id);
				this.version++;
			});
		}
	}
}

export const bookmarkState = new BookmarkState();
