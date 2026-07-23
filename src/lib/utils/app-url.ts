import { env } from '$env/dynamic/public';

const PUBLIC_APP_URL = 'https://synqo-rally.web.app';

function normalizeBaseUrl(url: string) {
	return url.replace(/\/+$/, '');
}

export function getPublicAppBaseUrl() {
	const configuredUrl = env.PUBLIC_RALLY_APP_URL?.trim();

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

	return PUBLIC_APP_URL;
}

export function createAppUrl(path: string) {
	const baseUrl = getPublicAppBaseUrl();
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;

	return `${baseUrl}${normalizedPath}`;
}
