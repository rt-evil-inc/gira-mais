import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

type Callback = (position: unknown, error?: { code: string }) => void;

const mocks = vi.hoisted(() => ({
	geoWatchers: new Map<string, Callback>,
	bgWatchers: new Map<string, Callback>,
	preferences: new Map<string, string>,
	next: 0,
}));

vi.mock('@capacitor/core', () => ({
	registerPlugin: () => ({
		addWatcher: async (_options: unknown, callback: Callback) => {
			const id = `bg-${mocks.next++}`;
			mocks.bgWatchers.set(id, callback);
			return id;
		},
		removeWatcher: async ({ id }: { id: string }) => void mocks.bgWatchers.delete(id),
	}),
}));
vi.mock('@capacitor/geolocation', () => ({
	Geolocation: {
		checkPermissions: async () => ({ location: 'granted' }),
		getCurrentPosition: vi.fn(() => new Promise(() => {})),
		watchPosition: vi.fn(async (_options: unknown, callback: Callback) => {
			const id = `geo-${mocks.next++}`;
			mocks.geoWatchers.set(id, callback);
			return id;
		}),
		clearWatch: async ({ id }: { id: string }) => void mocks.geoWatchers.delete(id),
	},
}));
vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: async ({ key }: { key: string }) => ({ value: mocks.preferences.get(key) ?? null }),
		set: async ({ key, value }: { key: string, value: string }) => void mocks.preferences.set(key, value),
	},
}));
vi.mock('$lib/trip', async () => {
	const { writable } = await import('svelte/store');
	return { currentTrip: writable(null), checkTripActive: vi.fn() };
});
vi.mock('./settings', async () => {
	const { writable } = await import('svelte/store');
	return { appSettings: writable(null) };
});

const DECLINED = { code: 'OS-PLUG-GLOC-0009' };
const DECLINED_KEY = 'locationAccuracyDeclined';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

// The decline is module state, so every launch gets a module of its own
async function launch() {
	vi.resetModules();
	vi.clearAllMocks();
	const { Geolocation } = await import('@capacitor/geolocation');
	return { Geolocation: vi.mocked(Geolocation), ...await import('./location') };
}

describe('declining the location accuracy prompt', () => {
	beforeEach(() => {
		mocks.geoWatchers.clear();
		mocks.bgWatchers.clear();
		mocks.preferences.clear();
	});

	it('falls back to the watcher without the prompt and never starts the regular one again', async () => {
		const { Geolocation, currentPos, restartPositionWatch, watchPosition } = await launch();
		await watchPosition();
		const [regular] = mocks.geoWatchers.values();

		// The user taps "No thanks" in the Play Services dialog
		regular(null, DECLINED);
		await flush();
		expect(mocks.geoWatchers.size).toBe(0);
		expect(mocks.bgWatchers.size).toBe(1);
		const [firstFallbackId] = mocks.bgWatchers.keys();
		await watchPosition();
		expect([...mocks.bgWatchers.keys()]).toEqual([firstFallbackId]);

		// Closing the dialog resumes the app, which restarts the watcher
		await restartPositionWatch();
		expect(Geolocation.watchPosition).toHaveBeenCalledTimes(1);
		expect(mocks.bgWatchers.size).toBe(1);
		const [[fallbackId, fallback]] = [...mocks.bgWatchers];
		expect(fallbackId).not.toBe(firstFallbackId);

		fallback({ latitude: 38.7, longitude: -9.1, bearing: 90, time: 1000 });
		expect(get(currentPos)).toMatchObject({ coords: { latitude: 38.7, longitude: -9.1, heading: 90 }, timestamp: 1000 });
	});

	it('does not ask again on later launches', async () => {
		const first = await launch();
		await first.watchPosition();
		const [regular] = mocks.geoWatchers.values();
		regular(null, DECLINED);
		await flush();
		mocks.bgWatchers.clear();

		const { Geolocation, watchPosition } = await launch();
		await watchPosition();
		expect(Geolocation.watchPosition).not.toHaveBeenCalled();
		expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled();
		expect(mocks.bgWatchers.size).toBe(1);
	});

	it('swaps the fallback watcher for the trip one and back', async () => {
		mocks.preferences.set(DECLINED_KEY, 'true');
		const { watchPosition } = await launch();
		const { currentTrip } = await import('$lib/trip');
		const { appSettings } = await import('./settings');
		await watchPosition();
		const [fallbackId] = mocks.bgWatchers.keys();

		appSettings.set({ backgroundLocation: true } as never);
		currentTrip.set({ pathTaken: [] } as never);
		await watchPosition();
		const [tripId] = mocks.bgWatchers.keys();
		expect(mocks.bgWatchers.size).toBe(1);
		expect(tripId).not.toBe(fallbackId);

		currentTrip.set(null);
		await watchPosition();
		expect(mocks.bgWatchers.size).toBe(1);
		expect(mocks.bgWatchers.has(tripId)).toBe(false);
	});

	it('starts another fallback watcher after one failed to start', async () => {
		mocks.preferences.set(DECLINED_KEY, 'true');
		const { watchPosition } = await launch();
		await watchPosition();
		const [failed] = mocks.bgWatchers.values();

		// The plugin reports it never had the watcher
		mocks.bgWatchers.clear();
		failed(null, { code: 'NOT_AUTHORIZED' });
		await watchPosition();
		expect(mocks.bgWatchers.size).toBe(1);
	});
});