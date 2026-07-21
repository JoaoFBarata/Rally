import { auth } from '$lib/firebase';
import { db } from '$lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Gestão de estado reativa para o utilizador (Svelte 5 Runes)
 */
class AuthState {
    user = $state<User | null>(null);
    loading = $state(true);
    requiresEmailVerification = $state(false);

    constructor() {
        onAuthStateChanged(auth, async (u) => {
            this.user = u;
            this.requiresEmailVerification = false;

            if (u) {
                try {
                    const snap = await getDoc(doc(db, 'users', u.uid));
                    this.requiresEmailVerification = snap.data()?.requiresEmailVerification === true;
                } catch (err) {
                    console.error('Could not load auth verification requirement:', err);
                }
            }

            this.loading = false;
        });
    }

    async refresh() {
        if (auth.currentUser) {
            await auth.currentUser.reload();
            this.user = auth.currentUser;
            try {
                const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
                this.requiresEmailVerification = snap.data()?.requiresEmailVerification === true;
            } catch (err) {
                console.error('Could not refresh auth verification requirement:', err);
            }
        }
    }
}

export const authState = new AuthState();
