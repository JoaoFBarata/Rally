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
    private revision = 0;

    constructor() {
        onAuthStateChanged(auth, async (u) => {
            const revision = ++this.revision;
            this.loading = true;
            this.user = u;
            this.requiresEmailVerification = false;

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

            if (revision === this.revision) this.loading = false;
        });
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
}

export const authState = new AuthState();
