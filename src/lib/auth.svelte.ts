import { auth, authPersistenceReady, db } from '$lib/firebase';
import { Capacitor } from '@capacitor/core';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Gestao de estado reativa para o utilizador (Svelte 5 Runes)
 */
class AuthState {
	user = $state<User | null>(null);
	loading = $state(true);
	requiresEmailVerification = $state(false);
	private revision = 0;

	constructor() {
		if (typeof window !== 'undefined') {
			const loadingFallbackMs = Capacitor.isNativePlatform() ? 350 : 1500;
			window.setTimeout(() => {
				if (this.loading) {
					console.warn('Auth state loading fallback timeout reached.');
					this.loading = false;
				}
			}, loadingFallbackMs);
		}

		void authPersistenceReady.then(() =>
			onAuthStateChanged(auth, async (u) => {
				const revision = ++this.revision;
				this.user = u;
				this.requiresEmailVerification = false;

				// Firebase Auth has already restored the local session at this
				// point. Do not keep the whole native app behind the splash while
				// waiting for a separate Firestore profile request.
				this.loading = false;

				if (u) {
					try {
						const snap = await getDoc(doc(db, 'users', u.uid));
						if (revision === this.revision) {
							this.requiresEmailVerification = snap.data()?.requiresEmailVerification === true;
						}
					} catch (err) {
						console.error('Could not load auth verification requirement:', err);
					}
				}
			})
		);
	}

	async refresh() {
		const revision = ++this.revision;
		this.loading = true;

		if (auth.currentUser) {
			await auth.currentUser.reload();
			this.user = auth.currentUser;
			try {
				const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
				if (revision === this.revision) {
					this.requiresEmailVerification = snap.data()?.requiresEmailVerification === true;
				}
			} catch (err) {
				console.error('Could not refresh auth verification requirement:', err);
			}
		}

		if (revision === this.revision) this.loading = false;
	}

	setAuthenticatedUser(user: User, requiresEmailVerification = false) {
		this.revision += 1;
		this.user = user;
		this.requiresEmailVerification = requiresEmailVerification;
		this.loading = false;
	}
}

export const authState = new AuthState();
