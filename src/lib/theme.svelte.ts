import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export const themeState = writable(false);

export function applyTheme(isDark: boolean) {
	themeState.set(isDark);

	if (!browser) return;

	document.documentElement.classList.toggle('dark', isDark);
	localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

export function initTheme() {
	if (!browser) return;

	const savedTheme = localStorage.getItem('theme');

	if (savedTheme === 'dark') {
		applyTheme(true);
	} else if (savedTheme === 'light') {
		applyTheme(false);
	} else {
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		applyTheme(prefersDark);
	}
}