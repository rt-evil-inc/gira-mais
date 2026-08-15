import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { currentPos } from '$lib/location';
import { DEBUG_START_POSITION, DEBUG_TRIP_CODE, currentTrip, endDebugTrip, startDebugTrip, toggleDebugTrip, type ActiveTrip } from '$lib/trip';

vi.mock('$lib/gira-api/api');

describe('debug trips', () => {
	beforeEach(() => {
		currentTrip.set(null);
		currentPos.set(null);
	});

	it('starts at the current position', () => {
		currentPos.set({
			coords: { latitude: 38.7, longitude: -9.1, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
			timestamp: Date.now(),
		});
		expect(startDebugTrip()).toBe(true);
		const trip = get(currentTrip);
		expect(trip).toMatchObject({ code: DEBUG_TRIP_CODE, bikePlate: 'DEBUG', confirmed: true, traveledDistanceKm: 0 });
		expect(trip?.startPos).toEqual({ lat: 38.7, lng: -9.1 });
		expect(trip?.pathTaken[0]).toMatchObject({ lat: 38.7, lng: -9.1 });
	});

	it('initializes the Lisbon fallback when location is missing', () => {
		startDebugTrip();
		expect(get(currentPos)?.coords).toMatchObject({ latitude: DEBUG_START_POSITION.lat, longitude: DEBUG_START_POSITION.lng });
		expect(get(currentTrip)?.startPos).toEqual(DEBUG_START_POSITION);
	});

	it('toggles a debug trip but preserves a real trip', () => {
		startDebugTrip();
		expect(toggleDebugTrip()).toBe(true);
		expect(get(currentTrip)).toBeNull();
		const realTrip = { code: 'REAL' } as ActiveTrip;
		currentTrip.set(realTrip);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		expect(toggleDebugTrip()).toBe(false);
		expect(get(currentTrip)).toBe(realTrip);
		expect(endDebugTrip()).toBe(false);
	});

	it('records subsequent debug positions in the trip path', () => {
		startDebugTrip();
		const previous = get(currentPos)!;
		currentPos.set({ ...previous, coords: { ...previous.coords, latitude: previous.coords.latitude + 0.0001 }, timestamp: previous.timestamp + 1000 });
		expect(get(currentTrip)?.pathTaken).toHaveLength(2);
		expect(get(currentTrip)?.traveledDistanceKm).toBeGreaterThan(0);
	});
});