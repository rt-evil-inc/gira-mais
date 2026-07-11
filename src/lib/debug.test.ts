import { describe, expect, it } from 'vitest';
import { distanceBetweenCoords } from '$lib/utils';
import { moveCoordinates } from '$lib/debug';

describe('debug movement', () => {
	it('moves in each cardinal direction', () => {
		expect(moveCoordinates(38.744, -9.15, 0, 1, 10).lat).toBeGreaterThan(38.744);
		expect(moveCoordinates(38.744, -9.15, 0, -1, 10).lat).toBeLessThan(38.744);
		expect(moveCoordinates(38.744, -9.15, 1, 0, 10).lng).toBeGreaterThan(-9.15);
		expect(moveCoordinates(38.744, -9.15, -1, 0, 10).lng).toBeLessThan(-9.15);
	});

	it('normalizes diagonal movement', () => {
		const start = { lat: 38.744, lng: -9.15 };
		const end = moveCoordinates(start.lat, start.lng, 1, 1, 10);
		expect(distanceBetweenCoords(start.lat, start.lng, end.lat, end.lng) * 1000).toBeCloseTo(10, 3);
	});

	it('scales movement distance and longitude by latitude', () => {
		const ten = moveCoordinates(38.744, -9.15, 1, 0, 10);
		const twenty = moveCoordinates(38.744, -9.15, 1, 0, 20);
		expect(twenty.lng - -9.15).toBeCloseTo((ten.lng - -9.15) * 2, 10);
		const equator = moveCoordinates(0, 0, 1, 0, 10);
		const lisbon = moveCoordinates(38.744, 0, 1, 0, 10);
		expect(lisbon.lng).toBeGreaterThan(equator.lng);
	});
});