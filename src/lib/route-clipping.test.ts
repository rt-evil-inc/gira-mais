import { describe, expect, it } from 'vitest';
import {
	clipRouteAtProjection,
	emptyRouteClippingState,
	projectPositionOntoRoute,
	remainingRoute,
	ROUTE_GLOBAL_REMATCH_READINGS,
} from '$lib/route-clipping';
import type { PlannedRoute, RouteLeg } from '$lib/routing';

const destination = { type: 'location' as const, lat: 0, lng: 0 };

function route(legs: RouteLeg[]): PlannedRoute {
	return {
		legs,
		totalDistance: 0,
		totalDuration: 0,
		startStationSerial: null,
		endStationSerial: null,
		origin: { lat: 0, lng: 0 },
		destination,
		computedAt: 0,
	};
}

function leg(mode: RouteLeg['mode'], coordinates: [number, number][]): RouteLeg {
	return { mode, coordinates, distance: 0, duration: 0 };
}

describe('route clipping', () => {
	it('clips precisely within a sparse segment', () => {
		const planned = route([leg('foot', [[0, 0], [0.002, 0]])]);
		const state = projectPositionOntoRoute(planned, { lng: 0.001, lat: 0.00001 }, emptyRouteClippingState(), 'foot');
		const clipped = clipRouteAtProjection(planned, state.accepted);
		expect(clipped[0].coordinates[0][0]).toBeCloseTo(0.001);
		expect(clipped[0].coordinates[0][1]).toBeCloseTo(0);
		expect(clipped[0].coordinates.at(-1)).toEqual([0.002, 0]);
	});

	it('removes completed legs and preserves future leg modes', () => {
		const planned = route([
			leg('bike', [[0, 0], [0.003, 0]]),
			leg('foot', [[0.003, 0], [0.004, 0]]),
		]);
		const state = projectPositionOntoRoute(planned, { lng: 0.002, lat: 0 }, emptyRouteClippingState(), 'bike');
		const clipped = clipRouteAtProjection(planned, state.accepted);
		expect(clipped.map(l => l.mode)).toEqual(['bike', 'foot']);
		expect(clipped[0].coordinates[0][0]).toBeCloseTo(0.002);
	});

	it('does not clip the bike leg when walking across it before the pickup station', () => {
		const planned = route([
			leg('foot', [[0, 0], [0.001, 0]]),
			leg('bike', [[0.001, 0], [0.003, 0]]),
			leg('foot', [[0.003, 0], [0.004, 0]]),
		]);
		// standing in the middle of the bike leg while still walking to the station
		const state = projectPositionOntoRoute(planned, { lng: 0.002, lat: 0 }, emptyRouteClippingState(), 'foot');
		expect(state.accepted).toBeNull();
		const clipped = clipRouteAtProjection(planned, state.accepted);
		expect(clipped.map(l => l.mode)).toEqual(['foot', 'bike', 'foot']);
		expect(clipped[0].coordinates[0]).toEqual([0, 0]);
	});

	it('does not clip the final walking leg when riding across it', () => {
		const planned = route([
			leg('bike', [[0, 0], [0.003, 0]]),
			leg('foot', [[0.003, 0], [0.003, 0.001]]),
		]);
		// riding past the middle of the final walking leg
		const state = projectPositionOntoRoute(planned, { lng: 0.003, lat: 0.0005 }, emptyRouteClippingState(), 'bike');
		expect(state.accepted).toBeNull();
		expect(clipRouteAtProjection(planned, state.accepted).map(l => l.mode)).toEqual(['bike', 'foot']);
	});

	it('advances immediately but ignores small backwards GPS noise', () => {
		const planned = route([leg('bike', [[0, 0], [0.01, 0]])]);
		let state = projectPositionOntoRoute(planned, { lng: 0.005, lat: 0 }, emptyRouteClippingState(), 'bike');
		state = projectPositionOntoRoute(planned, { lng: 0.006, lat: 0 }, state, 'bike');
		const forward = state.accepted!.distanceAlongRoute;
		state = projectPositionOntoRoute(planned, { lng: 0.00598, lat: 0 }, state, 'bike');
		expect(state.accepted!.distanceAlongRoute).toBe(forward);
	});

	it('restores route geometry after meaningful backwards travel', () => {
		const planned = route([leg('bike', [[0, 0], [0.01, 0]])]);
		let state = projectPositionOntoRoute(planned, { lng: 0.006, lat: 0 }, emptyRouteClippingState(), 'bike');
		const before = state.accepted!.distanceAlongRoute;
		state = projectPositionOntoRoute(planned, { lng: 0.0058, lat: 0 }, state, 'bike');
		expect(state.accepted!.distanceAlongRoute).toBeLessThan(before - 5);
		expect(clipRouteAtProjection(planned, state.accepted)[0].coordinates[0][0]).toBeCloseTo(0.0058);
	});

	it('retains stable progress while off route and leaves an initially off-route route complete', () => {
		const planned = route([leg('foot', [[0, 0], [0.01, 0]])]);
		const initial = projectPositionOntoRoute(planned, { lng: 0.005, lat: 0.001 }, emptyRouteClippingState(), 'foot');
		expect(initial.accepted).toBeNull();
		expect(clipRouteAtProjection(planned, initial.accepted)[0].coordinates).toEqual(planned.legs[0].coordinates);
		const matched = projectPositionOntoRoute(planned, { lng: 0.005, lat: 0 }, initial, 'foot');
		const offRoute = projectPositionOntoRoute(planned, { lng: 0.009, lat: 0.001 }, matched, 'foot');
		expect(offRoute.accepted).toEqual(matched.accepted);
	});

	it('prefers nearby route continuity at a crossing', () => {
		const coordinates: [number, number][] = [];
		for (let i = 0; i <= 25; i++) coordinates.push([i * 0.0001, 0]);
		for (let i = 25; i >= 0; i--) coordinates.push([i * 0.0001, 0.00002]);
		const planned = route([leg('bike', coordinates)]);
		let state = projectPositionOntoRoute(planned, { lng: 0.0002, lat: 0 }, emptyRouteClippingState(), 'bike');
		state = projectPositionOntoRoute(planned, { lng: 0.0002, lat: 0.00002 }, state, 'bike');
		expect(state.accepted!.segmentOrder).toBeLessThanOrEqual(20);
	});

	it('requires consecutive readings before a materially better distant rematch', () => {
		const coordinates: [number, number][] = [];
		for (let i = 0; i <= 25; i++) coordinates.push([i * 0.0001, 0]);
		for (let i = 25; i >= 0; i--) coordinates.push([i * 0.0001, 0.0003]);
		const planned = route([leg('bike', coordinates)]);
		let state = projectPositionOntoRoute(planned, { lng: 0.0002, lat: 0 }, emptyRouteClippingState(), 'bike');
		for (let i = 1; i < ROUTE_GLOBAL_REMATCH_READINGS; i++) {
			state = projectPositionOntoRoute(planned, { lng: 0.0002, lat: 0.0003 }, state, 'bike');
			expect(state.accepted!.segmentOrder).toBeLessThanOrEqual(20);
		}
		state = projectPositionOntoRoute(planned, { lng: 0.0002, lat: 0.0003 }, state, 'bike');
		expect(state.accepted!.segmentOrder).toBeGreaterThan(20);
	});

	it('reports the distance and duration remaining ahead of the projection', () => {
		const planned = route([
			{ ...leg('foot', [[0, 0], [0.01, 0]]), duration: 300 },
			{ ...leg('bike', [[0.01, 0], [0.02, 0]]), duration: 600 },
		]);
		const full = remainingRoute(planned, null);
		expect(full.duration).toBe(900);
		// halfway through the walking leg: half its duration plus the whole ride
		const state = projectPositionOntoRoute(planned, { lng: 0.005, lat: 0 }, emptyRouteClippingState(), 'foot');
		const remaining = remainingRoute(planned, state.accepted);
		expect(remaining.distance / full.distance).toBeCloseTo(0.75, 1);
		expect(remaining.duration).toBeCloseTo(750, 0);
	});

	it('ignores degenerate geometry and never returns invalid lines', () => {
		const planned = route([
			leg('foot', []),
			leg('bike', [[0, 0]]),
			leg('foot', [[0, 0], [0, 0]]),
			leg('bike', [[0, 0], [0.001, 0]]),
		]);
		const state = projectPositionOntoRoute(planned, { lng: 0.0005, lat: 0 }, emptyRouteClippingState(), 'bike');
		const clipped = clipRouteAtProjection(planned, state.accepted);
		expect(clipped.every(l => l.coordinates.length >= 2)).toBe(true);
		expect(clipped).toHaveLength(1);
	});
});