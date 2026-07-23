import { PUBLIC_FIREBASE_AUTH_DOMAIN, PUBLIC_RALLY_APP_URL } from '$env/static/public';

function normalizeBaseUrl(url: string) {
	return url.replace(/\/+$/, '');
}

export function getPublicAppBaseUrl() {
	const configuredUrl = PUBLIC_RALLY_APP_URL?.trim();

	if (configuredUrl) {
		return normalizeBaseUrl(configuredUrl);
	}

	if (typeof window !== 'undefined') {
		const currentOrigin = window.location.origin;
		const isLocalhost =
			window.location.hostname === 'localhost' ||
			window.location.hostname === '127.0.0.1' ||
			window.location.protocol === 'capacitor:';

		if (!isLocalhost) {
			return normalizeBaseUrl(currentOrigin);
		}
	}

	const firebaseAuthDomain = PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();

	if (firebaseAuthDomain) {
		return `https://${firebaseAuthDomain}`;
	}

	if (typeof window !== 'undefined') {
		return normalizeBaseUrl(window.location.origin);
	}

	return '';
}

export function createAppUrl(path: string) {
	const baseUrl = getPublicAppBaseUrl();
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;

	return `${baseUrl}${normalizedPath}`;
}
