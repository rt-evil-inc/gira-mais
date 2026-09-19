import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import type { Snippet } from 'svelte';
import { writable } from 'svelte/store';

export type Insets = {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

export const safeInsets = writable<Insets>({ top: 0, bottom: 0, left: 0, right: 0 });

export const errorMessages = (() => {
	const { subscribe, update } = writable<{ msg: string, id: number, count: number }[]>([]);
	const timeouts = new Map<number, ReturnType<typeof setTimeout>>;
	const remove = (id: number) => {
		timeouts.delete(id);
		update(messages => messages.filter(m => m.id !== id));
	};
	const add = async (msg: string, delay = 3000) => {
		if (!(await App.getState()).isActive) return;
		update(messages => {
			// Re-adding a visible message (e.g. each attempt of a retried request)
			// refreshes it and bumps its counter instead of stacking a duplicate
			const existing = messages.find(m => m.msg === msg);
			if (existing) {
				clearTimeout(timeouts.get(existing.id));
				timeouts.set(existing.id, setTimeout(() => remove(existing.id), delay));
				return messages.map(m => m === existing ? { ...m, count: m.count + 1 } : m);
			}
			const id = Math.random();
			timeouts.set(id, setTimeout(() => remove(id), delay));
			return [...messages, { msg, id, count: 1 }].slice(-3);
		});
	};
	return { subscribe, add };
})();

// TODO: remove this file and put it in a svelte file using context
type DialogSnippet = Snippet<[dismiss: () => void]>;

export const dialogQueue = $state<{ snippet: DialogSnippet, dismiss:() => void }[]>([]);

export const enqueueDialog = (snippet: DialogSnippet) => {
	const dismiss = () => {
		const index = dialogQueue.findIndex(d => d.dismiss === dismiss);
		if (index !== -1) dialogQueue.splice(index, 1);
	};
	dialogQueue.push({ snippet, dismiss });
};

export const keyboard = $state({ visible: false, height: 0 });

Keyboard.addListener('keyboardWillShow', info => {
	keyboard.visible = true;
	keyboard.height = info.keyboardHeight;
}).catch(() => {}); // not implemented on web
Keyboard.addListener('keyboardWillHide', () => {
	keyboard.visible = false;
	keyboard.height = 0;
}).catch(() => {}); // not implemented on web