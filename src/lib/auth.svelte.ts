import { auth } from '$lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';

/**
 * Gestão de estado reativa para o utilizador (Svelte 5 Runes)
 */
class AuthState {
    user = $state<User | null>(null);
    loading = $state(true);

    constructor() {
        onAuthStateChanged(auth, (u) => {
            this.user = u;
            this.loading = false;
        });
    }
}

export const authState = new AuthState();