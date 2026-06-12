import { browser } from '$app/environment';

export const themeState = $state({
	isDark: false,
	ready: false
});

export function applyTheme(isDark: boolean) {
	themeState.isDark = isDark;

	if (!browser) return;

	document.documentElement.classList.toggle('dark', isDark);
	localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

export function initTheme() {
	if (!browser || themeState.ready) return;

	const savedTheme = localStorage.getItem('theme');

	if (savedTheme === 'dark') {
		applyTheme(true);
	} else if (savedTheme === 'light') {
		applyTheme(false);
	} else {
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		applyTheme(prefersDark);
	}

	themeState.ready = true;
}