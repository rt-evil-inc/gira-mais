import { get, writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getActiveTrip: vi.fn(),
	getTripHistory: vi.fn(),
	quickStartBike: vi.fn(),
	refreshAccountInfo: vi.fn(),
	preferencesGet: vi.fn(),
	preferencesSet: vi.fn(),
	reportErrorEvent: vi.fn(),
	reportUnlockAttemptEvent: vi.fn(),
	reportUnlockResultEvent: vi.fn(),
}));

vi.mock('$lib/gira-api/api', () => ({
	getActiveTrip: mocks.getActiveTrip,
	getTripHistory: mocks.getTripHistory,
	quickStartBike: mocks.quickStartBike,
	knownErrors: {},
	knownErrorCodes: {},
}));
vi.mock('@capacitor/preferences', () => ({
	Preferences: { get: mocks.preferencesGet, set: mocks.preferencesSet },
}));
vi.mock('$lib/account', () => ({
	token: writable({ accessToken: 'access', expiration: Date.now() + 60_000 }),
	refreshToken: vi.fn(async () => true),
	refreshAccountInfo: mocks.refreshAccountInfo,
}));
vi.mock('$lib/location', () => ({
	currentPos: writable(null),
	watchPosition: vi.fn(),
	setDebugPosition: vi.fn(),
}));
vi.mock('$lib/settings', () => ({ appSettings: writable({ distanceLock: false, mockUnlock: false }) }));
vi.mock('$lib/ui.svelte', () => ({ errorMessages: { add: vi.fn() } }));
vi.mock('$lib/gira-mais-api/gira-mais-api', () => ({
	reportErrorEvent: mocks.reportErrorEvent,
	reportTripStartEvent: vi.fn(),
	reportUnlockAttemptEvent: mocks.reportUnlockAttemptEvent,
	reportUnlockResultEvent: mocks.reportUnlockResultEvent,
}));
const emitBike = vi.hoisted(() => ({ current: (_bike: unknown) => {} }));
vi.mock('$lib/vaimoo-api/firestore', () => ({
	subscribeFirestoreBike: (_id: string, onData: (bike: unknown) => void) => {
		emitBike.current = onData;
		return () => {};
	},
}));
vi.mock('$lib/translations', () => ({ t: writable((key: string) => key) }));

import { currentTrip, markTripRated, recoverRecentTripRating, refreshTripStatus, tripRating, tryStartTrip } from './trip';
import { VaimooApiError } from '$lib/vaimoo-api/client';
import type { StationInfo } from '$lib/map.svelte';

describe('VAIMOO trip lifecycle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		currentTrip.set(null);
		tripRating.set({ currentRating: null });
		mocks.refreshAccountInfo.mockResolvedValue(undefined);
		mocks.preferencesGet.mockResolvedValue({ value: null });
		mocks.preferencesSet.mockResolvedValue(undefined);
	});

	it('recovers a recent completed trip rating without persisting the active trip', async () => {
		const endedAt = new Date(Date.now() - 60_000);
		mocks.getTripHistory.mockResolvedValue([{
			id: '456',
			startedAt: new Date(endedAt.getTime() - 300_000),
			endedAt,
			bikeId: 'E2114',
		}]);

		await recoverRecentTripRating();

		expect(get(tripRating).currentRating).toMatchObject({ code: '456', bikePlate: 'E2114', endDate: endedAt });
	});

	it('does not recover a trip that was already rated successfully', async () => {
		mocks.getTripHistory.mockResolvedValue([{
			id: '456',
			startedAt: new Date(Date.now() - 300_000),
			endedAt: new Date(Date.now() - 60_000),
			bikeId: 'E2114',
		}]);
		// markTripRated persists through Preferences; feed whatever it stored back on the next read
		mocks.preferencesSet.mockImplementation(async ({ value }) => mocks.preferencesGet.mockResolvedValue({ value }));
		await markTripRated('456');

		await recoverRecentTripRating();

		expect(get(tripRating).currentRating).toBeNull();
	});

	it('restores an active server trip', async () => {
		mocks.getActiveTrip.mockResolvedValue({ id: '123', bikeId: 'E0980', startedAt: new Date('2026-09-14T10:00:00Z'), bikeState: 'RUNNING' });
		await refreshTripStatus();
		expect(get(currentTrip)).toEqual(expect.objectContaining({ code: '123', bikePlate: 'E0980', confirmed: true }));
	});

	it('ends locally only after the authoritative endpoint clears and asks for a rating', async () => {
		const startedAt = new Date('2026-09-14T10:00:00Z');
		currentTrip.set({
			code: '123',
			bikePlate: 'E0980',
			startPos: null,
			destination: null,
			traveledDistanceKm: 1,
			distanceLeft: null,
			speed: 0,
			startDate: startedAt,
			predictedEndDate: null,
			arrivalTime: null,
			finished: false,
			confirmed: true,
			pathTaken: [],
			lastUpdate: new Date,
		});
		mocks.getActiveTrip.mockResolvedValue(null);

		await refreshTripStatus();
		expect(get(currentTrip)).toBeNull();
		expect(get(tripRating).currentRating).toEqual(expect.objectContaining({ code: '123', bikePlate: 'E0980', startDate: startedAt }));
		await vi.waitFor(() => expect(mocks.refreshAccountInfo).toHaveBeenCalledOnce());
	});

	it('does not mistake a newly requested unlock for an ended trip', async () => {
		currentTrip.set({
			code: '',
			bikePlate: 'E0980',
			startPos: null,
			destination: null,
			traveledDistanceKm: 0,
			distanceLeft: null,
			speed: 0,
			startDate: new Date,
			predictedEndDate: null,
			arrivalTime: null,
			finished: false,
			confirmed: false,
			pathTaken: [],
			lastUpdate: new Date,
		});
		mocks.getActiveTrip.mockResolvedValue(null);
		await refreshTripStatus();
		expect(get(currentTrip)).toEqual(expect.objectContaining({ confirmed: false }));
	});

	it('reports a rejected unlock with the full VAIMOO response', async () => {
		const body = { responseStatus: { errorCode: 4, message: 'Not enough credit', errors: [{ errorCode: 4, message: 'Not enough credit' }] } };
		mocks.quickStartBike.mockRejectedValue(new VaimooApiError('VAIMOO request failed with HTTP 400', 400, body));
		const station = { serialNumber: '101', latitude: 38.7, longitude: -9.1 } as StationInfo;

		expect(await tryStartTrip('E0980', 'bike-comm-id', station)).toBe(false);

		expect(get(currentTrip)).toBeNull();
		expect(mocks.reportErrorEvent).toHaveBeenCalledOnce();
		expect(mocks.reportErrorEvent.mock.calls[0][0]).toBe('gira_api_error');
		// The server's answer must reach the database, not just the extracted message.
		expect(JSON.parse(mocks.reportErrorEvent.mock.calls[0][1])).toMatchObject({ bike: 'E0980', status: 400, code: 4, body });
	});

	it('reports an unlock of a hidden bike, and completes it once the bike is released', async () => {
		const station = { serialNumber: '101', latitude: 38.7, longitude: -9.1 } as StationInfo;
		const subject = { source: 'hidden' as const, hiddenReasons: ['Service status is not OK', 'Has low battery'], record: null };
		mocks.reportUnlockAttemptEvent.mockResolvedValue({ success: true });
		mocks.reportUnlockResultEvent.mockResolvedValue({ success: true });

		mocks.quickStartBike.mockResolvedValue(undefined);
		mocks.getActiveTrip.mockResolvedValue(null);
		expect(await tryStartTrip('E0980', 'bike-comm-id', station, subject)).toBe(true);
		expect(mocks.reportUnlockAttemptEvent).toHaveBeenCalledWith(expect.objectContaining({
			bike: 'E0980', station: '101', source: 'hidden', hiddenReasons: subject.hiddenReasons, request: 'accepted', vaimooCode: null,
		}));
		const { attemptId } = mocks.reportUnlockAttemptEvent.mock.calls[0][0];

		// Accepted is not released: the result only comes once the bike's record goes RUNNING.
		expect(mocks.reportUnlockResultEvent).not.toHaveBeenCalled();
		emitBike.current({ VisualId: 'E0980', TripVehicleState: 'RUNNING' });
		await vi.waitFor(() => expect(mocks.reportUnlockResultEvent).toHaveBeenCalledWith(attemptId, expect.objectContaining({ outcome: 'confirmed' })));
	});

	it('reports a refused unlock of a hidden bike with VAIMOO\'s code', async () => {
		const station = { serialNumber: '101', latitude: 38.7, longitude: -9.1 } as StationInfo;
		mocks.reportUnlockAttemptEvent.mockResolvedValue({ success: true });
		mocks.quickStartBike.mockRejectedValue(new VaimooApiError('VAIMOO request failed with HTTP 400', 400, { responseStatus: { errorCode: 1103 } }));

		expect(await tryStartTrip('E0980', 'bike-comm-id', station, { source: 'hidden', hiddenReasons: ['Has repair'], record: null })).toBe(false);
		expect(mocks.reportUnlockAttemptEvent).toHaveBeenCalledWith(expect.objectContaining({ source: 'hidden', request: 'refused', vaimooCode: 1103 }));
		expect(mocks.reportUnlockResultEvent).not.toHaveBeenCalled();
		// The ordinary unlock failure report still goes out alongside it.
		expect(mocks.reportErrorEvent).toHaveBeenCalledWith('gira_api_error', expect.any(String));
	});

	it('does not report unlocks of bikes the server lists as available', async () => {
		mocks.quickStartBike.mockResolvedValue(undefined);
		mocks.getActiveTrip.mockResolvedValue(null);
		const station = { serialNumber: '101', latitude: 38.7, longitude: -9.1 } as StationInfo;
		expect(await tryStartTrip('E0980', 'bike-comm-id', station, { source: 'listed', hiddenReasons: null, record: null })).toBe(true);
		expect(mocks.reportUnlockAttemptEvent).not.toHaveBeenCalled();
	});
});