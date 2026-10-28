import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	preferences: new Map<string, string>,
	secure: new Map<string, unknown>,
	secureFails: false,
}));

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: async ({ key }: { key: string }) => ({ value: mocks.preferences.get(key) ?? null }),
		set: async ({ key, value }: { key: string; value: string }) => void mocks.preferences.set(key, value),
		remove: async ({ key }: { key: string }) => void mocks.preferences.delete(key),
	},
}));
vi.mock('@aparajita/capacitor-secure-storage', () => {
	const failing = () => {
		if (mocks.secureFails) throw new Error('KeyStore unavailable');
	};
	return {
		KeychainAccess: { afterFirstUnlock: 2 },
		SecureStorage: {
			get: async (key: string) => (failing(), mocks.secure.get(key) ?? null),
			set: async (key: string, data: unknown) => void (failing(), mocks.secure.set(key, data)),
			remove: async (key: string) => (failing(), mocks.secure.delete(key)),
		},
	};
});

import { clearCredentials, loadCredentials, saveCredentials } from './credentials';

const credentials = { email: 'rider@example.com', password: 'hunter2' };

describe('credentials', () => {
	beforeEach(() => {
		mocks.preferences.clear();
		mocks.secure.clear();
		mocks.secureFails = false;
	});

	it('loads nothing when nothing was saved', async () => {
		expect(await loadCredentials()).toBeNull();
	});

	it('saves to secure storage and loads back', async () => {
		await saveCredentials(credentials);
		expect(await loadCredentials()).toEqual(credentials);
		expect(mocks.preferences.size).toBe(0);
	});

	it('moves credentials an older version left in Preferences into secure storage', async () => {
		mocks.preferences.set('email', credentials.email);
		mocks.preferences.set('password', credentials.password);
		mocks.preferences.set('settings/theme', 'dark');

		expect(await loadCredentials()).toEqual(credentials);
		expect(mocks.secure.get('credentials')).toEqual(credentials);
		expect([...mocks.preferences.keys()]).toEqual(['settings/theme']);
	});

	it('keeps the old copy when secure storage fails, so the move is retried', async () => {
		mocks.preferences.set('email', credentials.email);
		mocks.preferences.set('password', credentials.password);
		mocks.secureFails = true;
		vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(await loadCredentials()).toEqual(credentials);
		expect(mocks.preferences.get('password')).toBe(credentials.password);
	});

	it('clears both the secure copy and any old one', async () => {
		await saveCredentials(credentials);
		mocks.preferences.set('email', credentials.email);
		mocks.preferences.set('password', credentials.password);

		await clearCredentials();
		expect(mocks.secure.size).toBe(0);
		expect(mocks.preferences.size).toBe(0);
	});
});