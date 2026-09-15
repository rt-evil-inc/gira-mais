import { get, writable } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveTrip } from '$lib/trip';

const mocks = vi.hoisted(() => ({ refreshTripStatus: vi.fn(), recoverRecentTripRating: vi.fn(), bikeListener: null as null | ((bike: unknown) => void) }));
vi.mock('$lib/account', () => ({ token: writable({ accessToken: 'test' }) }));
vi.mock('$lib/map.svelte', () => ({ stations: { value: [] } }));
vi.mock('$lib/trip', () => ({
	currentTrip: writable(null),
	DEBUG_TRIP_CODE: 'DEBUG-TRIP',
	refreshTripStatus: mocks.refreshTripStatus,
	recoverRecentTripRating: mocks.recoverRecentTripRating,
}));
vi.mock('$lib/vaimoo-api/firestore', () => ({ subscribeFirestoreBike: vi.fn((_id: string, onData: (bike: unknown) => void) => { mocks.bikeListener = onData; return () => {}; }) }));
vi.mock('$lib/ui.svelte', () => ({ errorMessages: { add: vi.fn() } }));
vi.mock('$lib/translations', () => ({ t: writable((key: string) => key) }));
vi.mock('./api', () => ({ subscribeStations: vi.fn(() => () => {}) }));

import { currentTrip } from '$lib/trip';
import { startBackendSync, stopBackendSync } from './backend-sync';

function trip(confirmed = true): ActiveTrip {
	return {
		code: confirmed ? '123' : '',
		bikePlate: 'E0980',
		confirmed,
		startPos: null,
		destination: null,
		traveledDistanceKm: 0,
		distanceLeft: null,
		speed: 0,
		startDate: new Date,
		predictedEndDate: null,
		arrivalTime: null,
		finished: false,
		pathTaken: [],
		lastUpdate: new Date,
	};
}

describe('trip status polling', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mocks.refreshTripStatus.mockReset().mockResolvedValue(null);
		mocks.recoverRecentTripRating.mockReset().mockResolvedValue(undefined);
		currentTrip.set(null);
	});

	it('recovers a recent rating prompt when startup finds no active trip', async () => {
		startBackendSync();
		await vi.waitFor(() => expect(mocks.recoverRecentTripRating).toHaveBeenCalledOnce());
	});

	afterEach(() => {
		stopBackendSync();
		vi.useRealTimers();
	});

	it('keeps polling during frequent GPS updates and detects completion', async () => {
		currentTrip.set(trip());
		startBackendSync();
		await Promise.resolve();
		mocks.refreshTripStatus.mockClear();
		for (let seconds = 1; seconds <= 30; seconds++) {
			await vi.advanceTimersByTimeAsync(1_000);
			currentTrip.update(value => {
				if (value) value.traveledDistanceKm += 0.01;
				return value;
			});
		}
		expect(mocks.refreshTripStatus).toHaveBeenCalledTimes(2);
		mocks.refreshTripStatus.mockImplementation(async () => currentTrip.set(null));
		await vi.advanceTimersByTimeAsync(15_000);
		expect(get(currentTrip)).toBeNull();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(mocks.refreshTripStatus).toHaveBeenCalledTimes(3);
	});

	it('switches from pending to confirmed polling cadence', async () => {
		currentTrip.set(trip(false));
		startBackendSync();
		await Promise.resolve();
		mocks.refreshTripStatus.mockClear();
		await vi.advanceTimersByTimeAsync(3_000);
		expect(mocks.refreshTripStatus).toHaveBeenCalledTimes(1);
		currentTrip.set(trip());
		await vi.advanceTimersByTimeAsync(14_999);
		expect(mocks.refreshTripStatus).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(mocks.refreshTripStatus).toHaveBeenCalledTimes(2);
	});

	it('does not restart polling when an in-flight check finishes after sync stops', async () => {
		currentTrip.set(trip());
		startBackendSync();
		await Promise.resolve();
		let finish!: () => void;
		mocks.refreshTripStatus.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
		await vi.advanceTimersByTimeAsync(15_000);
		stopBackendSync();
		finish();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(mocks.refreshTripStatus).toHaveBeenCalledTimes(2);
	});

	it('polls quickly once Firestore reports the bike locked without a trip', async () => {
		currentTrip.set(trip());
		startBackendSync();
		await Promise.resolve();
		mocks.refreshTripStatus.mockClear();
		mocks.bikeListener!({ TripVehicleState: 'RUNNING', TripId: 1, TripErrorCode: 0 });
		expect(mocks.refreshTripStatus).not.toHaveBeenCalled();
		mocks.bikeListener!({ TripVehicleState: 'LOCKED', TripId: null, TripErrorCode: 0 });
		expect(mocks.refreshTripStatus).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(3_000);
		expect(mocks.refreshTripStatus).toHaveBeenCalledTimes(2);
	});
});