import distance from '@turf/distance';
import { lineString, point } from '@turf/helpers';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import type { Coord, PlannedRoute, RouteLeg } from '$lib/routing';

export const ROUTE_BACKWARD_DEADBAND_METERS = 5;
export const ROUTE_LOCAL_SEARCH_SEGMENTS = 20;
export const ROUTE_OFF_ROUTE_METERS = 40;
export const ROUTE_GLOBAL_REMATCH_READINGS = 3;
export const ROUTE_GLOBAL_REMATCH_ADVANTAGE_METERS = 15;

export type RouteProjection = {
	legIndex: number,
	segmentIndex: number,
	segmentOrder: number,
	distanceAlongRoute: number,
	coordinate: [number, number],
	distanceFromRoute: number,
};

export type RouteClippingState = {
	accepted: RouteProjection|null,
	pendingSegmentOrder: number|null,
	pendingReadings: number,
};

export type DisplayRouteLeg = Pick<RouteLeg, 'mode'|'coordinates'>;

export const emptyRouteClippingState = (): RouteClippingState => ({
	accepted: null,
	pendingSegmentOrder: null,
	pendingReadings: 0,
});

type Segment = {
	legIndex: number,
	segmentIndex: number,
	segmentOrder: number,
	coordinates: [[number, number], [number, number]],
	startDistance: number,
};

function routeSegments(route: PlannedRoute): Segment[] {
	const segments: Segment[] = [];
	let startDistance = 0;
	for (let legIndex = 0; legIndex < route.legs.length; legIndex++) {
		const coordinates = route.legs[legIndex].coordinates;
		for (let segmentIndex = 0; segmentIndex + 1 < coordinates.length; segmentIndex++) {
			const pair: Segment['coordinates'] = [coordinates[segmentIndex], coordinates[segmentIndex + 1]];
			const length = distance(pair[0], pair[1], { units: 'meters' });
			if (length === 0) continue;
			segments.push({ legIndex, segmentIndex, segmentOrder: segments.length, coordinates: pair, startDistance });
			startDistance += length;
		}
	}
	return segments;
}

function closestProjection(position: Coord, segments: Segment[], minOrder = 0, maxOrder = Infinity): RouteProjection|null {
	let best: RouteProjection|null = null;
	const location = point([position.lng, position.lat]);
	for (const segment of segments) {
		if (segment.segmentOrder < minOrder || segment.segmentOrder > maxOrder) continue;
		const snapped = nearestPointOnLine(lineString(segment.coordinates), location, { units: 'meters' });
		const candidate: RouteProjection = {
			legIndex: segment.legIndex,
			segmentIndex: segment.segmentIndex,
			segmentOrder: segment.segmentOrder,
			distanceAlongRoute: segment.startDistance + (snapped.properties.location ?? 0),
			coordinate: snapped.geometry.coordinates as [number, number],
			distanceFromRoute: snapped.properties.dist ?? Infinity,
		};
		if (!best || candidate.distanceFromRoute < best.distanceFromRoute) best = candidate;
	}
	return best;
}

/** Match a GPS position to a route while retaining enough state to avoid noisy jumps.
  * Matching is restricted to the legs the user can currently be traversing: the
  * leg of their current progress plus consecutive legs of their current travel
  * mode. Walking across a later bike leg on the way to the pickup station (or
  * riding across a later walking leg) must not advance the clipping. */
export function projectPositionOntoRoute(route: PlannedRoute, position: Coord, state: RouteClippingState, mode: RouteLeg['mode']): RouteClippingState {
	const segments = routeSegments(route);
	const firstLegIndex = state.accepted?.legIndex ?? segments[0]?.legIndex;
	if (firstLegIndex == null || route.legs[firstLegIndex].mode !== mode) return state;
	let lastLegIndex = firstLegIndex;
	while (lastLegIndex + 1 < route.legs.length && route.legs[lastLegIndex + 1].mode === mode) lastLegIndex++;
	const eligible = segments.filter(s => s.legIndex >= firstLegIndex && s.legIndex <= lastLegIndex);
	if (eligible.length === 0) return state;
	const minOrder = eligible[0].segmentOrder;
	const maxOrder = eligible[eligible.length - 1].segmentOrder;

	const global = closestProjection(position, segments, minOrder, maxOrder);
	if (!global || global.distanceFromRoute > ROUTE_OFF_ROUTE_METERS) {
		return { ...state, pendingSegmentOrder: null, pendingReadings: 0 };
	}

	let candidate = global;
	let pendingSegmentOrder: number|null = null;
	let pendingReadings = 0;
	if (state.accepted) {
		const local = closestProjection(position, segments, Math.max(minOrder, state.accepted.segmentOrder - ROUTE_LOCAL_SEARCH_SEGMENTS), Math.min(maxOrder, state.accepted.segmentOrder + ROUTE_LOCAL_SEARCH_SEGMENTS));
		if (local && Math.abs(global.segmentOrder - state.accepted.segmentOrder) > ROUTE_LOCAL_SEARCH_SEGMENTS) {
			if (global.distanceFromRoute + ROUTE_GLOBAL_REMATCH_ADVANTAGE_METERS < local.distanceFromRoute) {
				pendingSegmentOrder = global.segmentOrder;
				pendingReadings = state.pendingSegmentOrder === global.segmentOrder ? state.pendingReadings + 1 : 1;
				candidate = pendingReadings >= ROUTE_GLOBAL_REMATCH_READINGS ? global : local;
				if (candidate === global) {
					pendingSegmentOrder = null;
					pendingReadings = 0;
				}
			} else candidate = local;
		} else if (local) candidate = local;

		if (candidate.distanceFromRoute > ROUTE_OFF_ROUTE_METERS) {
			return { ...state, pendingSegmentOrder, pendingReadings };
		}
		const backwards = state.accepted.distanceAlongRoute - candidate.distanceAlongRoute;
		if (backwards > 0 && backwards <= ROUTE_BACKWARD_DEADBAND_METERS) {
			return { accepted: state.accepted, pendingSegmentOrder, pendingReadings };
		}
	}
	return { accepted: candidate, pendingSegmentOrder, pendingReadings };
}

/** Distance (meters) and duration (seconds) of the route remaining ahead of
  * the projection. The projected leg contributes its geometric remaining
  * fraction of the leg duration. */
export function remainingRoute(route: PlannedRoute, projection: RouteProjection|null): { distance: number, duration: number } {
	const segments = routeSegments(route);
	if (segments.length === 0) return { distance: 0, duration: 0 };
	const last = segments[segments.length - 1];
	const total = last.startDistance + distance(last.coordinates[0], last.coordinates[1], { units: 'meters' });
	const along = projection?.distanceAlongRoute ?? 0;

	let duration = 0;
	for (let legIndex = projection?.legIndex ?? 0; legIndex < route.legs.length; legIndex++) {
		if (!projection || legIndex > projection.legIndex) {
			duration += route.legs[legIndex].duration;
			continue;
		}
		const legSegments = segments.filter(s => s.legIndex === legIndex);
		if (legSegments.length === 0) continue;
		const legLast = legSegments[legSegments.length - 1];
		const legEnd = legLast.startDistance + distance(legLast.coordinates[0], legLast.coordinates[1], { units: 'meters' });
		const legLength = legEnd - legSegments[0].startDistance;
		if (legLength > 0) duration += route.legs[legIndex].duration * Math.max(0, legEnd - along) / legLength;
	}
	return { distance: Math.max(0, total - along), duration };
}

/** Return display-only legs starting precisely at the accepted route projection. */
export function clipRouteAtProjection(route: PlannedRoute, projection: RouteProjection|null): DisplayRouteLeg[] {
	if (!projection) return route.legs
		.filter(leg => leg.coordinates.length >= 2)
		.map(leg => ({ mode: leg.mode, coordinates: leg.coordinates }));

	return route.legs.slice(projection.legIndex).flatMap((leg, relativeLegIndex) => {
		const coordinates = relativeLegIndex === 0 ?
			[projection.coordinate, ...leg.coordinates.slice(projection.segmentIndex + 1)] : leg.coordinates;
		const unique = coordinates.filter((coordinate, index) => index === 0 ||
			coordinate[0] !== coordinates[index - 1][0] || coordinate[1] !== coordinates[index - 1][1]);
		return unique.length >= 2 ? [{ mode: leg.mode, coordinates: unique }] : [];
	});
}