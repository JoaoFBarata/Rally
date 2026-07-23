import { initializeApp, getApps } from 'firebase/app';
import { browser, dev } from '$app/environment';
import {
	browserLocalPersistence,
	browserPopupRedirectResolver,
	getAuth,
	indexedDBLocalPersistence,
	initializeAuth
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

import {
	PUBLIC_FIREBASE_API_KEY,
	PUBLIC_FIREBASE_AUTH_DOMAIN,
	PUBLIC_FIREBASE_PROJECT_ID,
	PUBLIC_FIREBASE_STORAGE_BUCKET,
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	PUBLIC_FIREBASE_APP_ID
} from '$env/static/public';

const firebaseConfig = {
	apiKey: PUBLIC_FIREBASE_API_KEY,
	authDomain: PUBLIC_FIREBASE_AUTH_DOMAIN,
	projectId: PUBLIC_FIREBASE_PROJECT_ID,
	storageBucket: PUBLIC_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	appId: PUBLIC_FIREBASE_APP_ID
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

function createAuth() {
	if (browser) {
		try {
			return initializeAuth(app, {
				persistence: [indexedDBLocalPersistence, browserLocalPersistence],
				popupRedirectResolver: browserPopupRedirectResolver
			});
		} catch {
			// Auth was already initialized during hot reload.
			return getAuth(app);
		}
	}

	return getAuth(app);
}

export const auth = createAuth();
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Use emulators only when explicitly requested. Normal localhost development
// calls the deployed Functions, so destructive/account flows do not silently
// fail when no emulator is running.
if (dev && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
	connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
