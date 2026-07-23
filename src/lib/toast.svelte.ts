// src/lib/toast.svelte.ts

export interface Toast {
	id: string;
	title: string;
	message: string;
	type: 'message' | 'invite' | 'event';
}

class ToastState {
	toasts = $state<Toast[]>([]);

	add(title: string, message: string, type: Toast['type'], dedupeKey?: string) {
		if (dedupeKey && typeof localStorage !== 'undefined') {
			const storageKey = 'rally_seen_in_app_notifications';
			let storedKeys: string[] = [];
			try {
				const storedValue = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
				if (Array.isArray(storedValue)) storedKeys = storedValue;
			} catch {
				localStorage.removeItem(storageKey);
			}
			const seen = new Set<string>(storedKeys);
			if (seen.has(dedupeKey)) return;

			seen.add(dedupeKey);
			localStorage.setItem(storageKey, JSON.stringify([...seen].slice(-500)));
		}

		const id = Math.random().toString(36).substring(2);
		this.toasts.push({ id, title, message, type });

		// Automatically remove the toast after 5 seconds
		setTimeout(() => {
			this.remove(id);
		}, 5000);
	}

	remove(id: string) {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}
}

export const toastState = new ToastState();
