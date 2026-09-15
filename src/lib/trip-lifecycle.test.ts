import { get, writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getActiveTrip: vi.fn(),
	getTripDetails: vi.fn(),
	quickStartBike: vi.fn(),
	refreshAccountInfo: vi.fn(),
}));

vi.mock('$lib/gira-api/api', () => ({
	getActiveTrip: mocks.getActiveTrip,
	getTripDetails: mocks.getTripDetails,
	quickStartBike: mocks.quickStartBike,
	knownErrors: {},
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
vi.mock('$lib/gira-mais-api/gira-mais-api', () => ({ reportErrorEvent: vi.fn(), reportTripStartEvent: vi.fn() }));
vi.mock('$lib/translations', () => ({ t: writable((key: string) => key) }));

import { currentTrip, recentlyCompletedTrip, refreshTripStatus } from './trip';

describe('VAIMOO trip lifecycle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		currentTrip.set(null);
		recentlyCompletedTrip.set(null);
		mocks.refreshAccountInfo.mockResolvedValue(undefined);
	});

	it('restores an active server trip', async () => {
		mocks.getActiveTrip.mockResolvedValue({ id: '123', bikeId: 'E0980', startedAt: new Date('2026-09-14T10:00:00Z'), bikeState: 'RUNNING' });
		await refreshTripStatus();
		expect(get(currentTrip)).toEqual(expect.objectContaining({ code: '123', bikePlate: 'E0980', confirmed: true }));
	});

	it('ends locally only after the authoritative endpoint clears and loads final details', async () => {
		const startedAt = new Date('2026-09-14T10:00:00Z');
		currentTrip.set({
			code: '123', bikePlate: 'E0980', startPos: null, destination: null, traveledDistanceKm: 1,
			distanceLeft: null, speed: 0, startDate: startedAt, predictedEndDate: null, arrivalTime: null,
			finished: false, confirmed: true, pathTaken: [], lastUpdate: new Date(),
		});
		const completed = {
			id: '123', startedAt, endedAt: new Date('2026-09-14T10:15:00Z'), bikeId: 'E0980', bikeType: 'E-Bike',
			startStation: 'Start', endStation: 'End', distanceMeters: 1000, cost: 1.5,
		};
		mocks.getActiveTrip.mockResolvedValue(null);
		mocks.getTripDetails.mockResolvedValue(completed);

		await refreshTripStatus();
		await vi.waitFor(() => expect(get(recentlyCompletedTrip)).toEqual(completed));
		expect(get(currentTrip)).toBeNull();
		expect(mocks.refreshAccountInfo).toHaveBeenCalledOnce();
	});

	it('does not mistake a newly requested unlock for an ended trip', async () => {
		currentTrip.set({
			code: '', bikePlate: 'E0980', startPos: null, destination: null, traveledDistanceKm: 0,
			distanceLeft: null, speed: 0, startDate: new Date(), predictedEndDate: null, arrivalTime: null,
			finished: false, confirmed: false, pathTaken: [], lastUpdate: new Date(),
		});
		mocks.getActiveTrip.mockResolvedValue(null);
		await refreshTripStatus();
		expect(get(currentTrip)).toEqual(expect.objectContaining({ confirmed: false }));
	});
});
