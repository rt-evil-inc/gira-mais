import { beforeEach, describe, expect, it, vi } from 'vitest';

type Callback = (position: unknown, error?: { code: string }) => void;

const mocks = vi.hoisted(() => ({
	geoWatchers: new Map<string, Callback>,
	bgWatchers: new Map<string, Callback>,
	next: 0,
}));

vi.mock('@capacitor/core', () => ({
	registerPlugin: () => ({
		addWatcher: vi.fn(async (_options: unknown, callback: Callback) => {
			const id = `bg-${mocks.next++}`;
			mocks.bgWatchers.set(id, callback);
			return id;
		}),
		removeWatcher: vi.fn(async ({ id }: { id: string }) => void mocks.bgWatchers.delete(id)),
	}),
}));
vi.mock('@capacitor/geolocation', () => ({
	Geolocation: {
		checkPermissions: vi.fn(async () => ({ location: 'granted' })),
		getCurrentPosition: vi.fn(() => new Promise(() => {})),
		watchPosition: vi.fn(async (_options: unknown, callback: Callback) => {
			const id = `geo-${mocks.next++}`;
			mocks.geoWatchers.set(id, callback);
			return id;
		}),
		clearWatch: vi.fn(async ({ id }: { id: string }) => void mocks.geoWatchers.delete(id)),
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
vi.mock('$lib/translations', async () => {
	const { readable } = await import('svelte/store');
	return { t: readable((key: string) => key) };
});
vi.mock('$lib/compass', async () => {
	const { writable } = await import('svelte/store');
	return { compassHeading: writable(null) };
});
vi.mock('$lib/compass-offset', () => ({ compassOffset: { observeCourse: vi.fn(), correct: (h: number) => h } }));

import { Geolocation } from '@capacitor/geolocation';
import { currentPos, restartPositionWatch, watchPosition } from './location';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('declining the location accuracy prompt', () => {
	beforeEach(() => {
		vi.mocked(Geolocation.watchPosition).mockClear();
	});

	it('stops asking again on every resume and falls back to a watcher without the prompt', async () => {
		await watchPosition();
		expect(Geolocation.watchPosition).toHaveBeenCalledTimes(1);
		const [[id, callback]] = [...mocks.geoWatchers];

		// The user taps "No" in the Play Services dialog
		callback(null, { code: 'OS-PLUG-GLOC-0009' });
		await flush();

		expect(mocks.geoWatchers.has(id)).toBe(false);
		expect(mocks.bgWatchers.size).toBe(1);

		// Closing the dialog resumes the app, which restarts the watcher
		await restartPositionWatch();
		await restartPositionWatch();
		expect(Geolocation.watchPosition).toHaveBeenCalledTimes(1);
		expect(mocks.bgWatchers.size).toBe(1);

		const [[, fallback]] = [...mocks.bgWatchers];
		fallback({ latitude: 38.7, longitude: -9.1, accuracy: 5, bearing: 90, time: 1000 });
		expect(currentPos).toBeDefined();
		let pos: unknown;
		currentPos.subscribe(v => pos = v)();
		expect(pos).toMatchObject({ coords: { latitude: 38.7, longitude: -9.1, heading: 90 }, timestamp: 1000 });
	});
});