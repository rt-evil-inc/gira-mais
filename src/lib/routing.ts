import { get, writable } from 'svelte/store';
import { currentPos } from '$lib/location';
import { currentTrip } from '$lib/trip';
import { stations, type StationInfo } from '$lib/map.svelte';
import { ROUTING_API_URL } from '$lib/constants';
import { distanceBetweenCoords } from '$lib/utils';
import { CapacitorHttp } from '@capacitor/core';
import { errorMessages } from '$lib/ui.svelte';
import { t } from '$lib/translations';

export type Coord = { lat: number, lng: number };
export type Destination = Coord & { name?: string, stationSerial?: string };
export type RouteLeg = {
	mode: 'foot'|'bike',
	coordinates: [number, number][], // [lng, lat]
	distance: number, // meters
	duration: number, // seconds
};
export type PlannedRoute = {
	legs: RouteLeg[],
	totalDistance: number, // meters
	totalDuration: number, // seconds
	startStationSerial: string|null,
	endStationSerial: string|null,
	origin: Coord,
	destination: Destination,
	computedAt: number,
};

export const routeDestination = writable<Destination|null>(null);
export const currentRoute = writable<PlannedRoute|null>(null);
export const routePending = writable(false);

// Time overhead of picking up / docking a bike, used when comparing
// walking-only routes with walk+bike+walk combinations
const BIKE_PICKUP_OVERHEAD_s = 60;
const BIKE_DOCK_OVERHEAD_s = 30;
const MAX_STATION_CANDIDATES = 3;
const ARRIVAL_RADIUS_m = 40;
const RECOMPUTE_MIN_MOVE_m = 30;
const RECOMPUTE_MIN_INTERVAL_ms = 5000;

type OsrmRoute = { distance: number, duration: number, geometry: { coordinates: [number, number][] } };

const OSRM_ATTEMPTS = 3;

/** GET an OSRM endpoint, retrying transient failures: network errors, timeouts
  * and 5xx responses (e.g. a 502 while the routing server restarts). Throws if
  * they persist, so a failed request is never mistaken for "no route exists".
  * Legitimate routing errors (4xx, code !== 'Ok') are returned, not retried. */
async function osrmGet(url: string): Promise<{ code?: string, routes?: OsrmRoute[], durations?: (number|null)[][] }> {
	for (let attempt = 1; ; attempt++) {
		try {
			const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out')), 5000));
			const res = await Promise.race([
				CapacitorHttp.get({ url, readTimeout: 5000, connectTimeout: 5000 }),
				timeoutPromise,
			]);
			if (res.status >= 500) throw new Error(`Routing server error ${res.status}`);
			return res.data;
		} catch (e) {
			if (attempt >= OSRM_ATTEMPTS) throw e;
			console.warn(`Routing request failed (attempt ${attempt}/${OSRM_ATTEMPTS})`, e);
			await new Promise(resolve => setTimeout(resolve, 300 * attempt));
		}
	}
}

async function osrmRoute(profile: 'foot'|'bike', from: Coord, to: Coord): Promise<OsrmRoute|null> {
	const url = `${ROUTING_API_URL}/${profile}/route/v1/-/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false&alternatives=false`;
	const data = await osrmGet(url);
	if (data?.code !== 'Ok' || !data.routes?.length) return null;
	return data.routes[0];
}

/** Returns a matrix of durations in seconds, durations[source][destination] */
async function osrmTable(profile: 'foot'|'bike', sources: Coord[], destinations: Coord[]): Promise<(number|null)[][]|null> {
	const coords = [...sources, ...destinations].map(c => `${c.lng},${c.lat}`).join(';');
	const sourceIdxs = sources.map((_, i) => i).join(';');
	const destinationIdxs = destinations.map((_, i) => i + sources.length).join(';');
	const url = `${ROUTING_API_URL}/${profile}/table/v1/-/${coords}?sources=${sourceIdxs}&destinations=${destinationIdxs}`;
	const data = await osrmGet(url);
	if (data?.code !== 'Ok' || !data.durations) return null;
	return data.durations;
}

function stationCoord(s: StationInfo): Coord {
	return { lat: s.latitude, lng: s.longitude };
}

function nearestStations(target: Coord, filter: (s: StationInfo) => boolean): StationInfo[] {
	return stations.value
		.filter(s => s.assetStatus === 'active' && filter(s))
		.map(s => ({ s, d: distanceBetweenCoords(target.lat, target.lng, s.latitude, s.longitude) }))
		.sort((a, b) => a.d - b.d)
		.slice(0, MAX_STATION_CANDIDATES)
		.map(x => x.s);
}

function footLeg(route: OsrmRoute): RouteLeg {
	return { mode: 'foot', coordinates: route.geometry.coordinates, distance: route.distance, duration: route.duration };
}

function bikeLeg(route: OsrmRoute): RouteLeg {
	return { mode: 'bike', coordinates: route.geometry.coordinates, distance: route.distance, duration: route.duration };
}

function buildRoute(origin: Coord, destination: Destination, legs: RouteLeg[], startStationSerial: string|null, endStationSerial: string|null): PlannedRoute {
	return {
		legs,
		totalDistance: legs.reduce((acc, l) => acc + l.distance, 0),
		totalDuration: legs.reduce((acc, l) => acc + l.duration, 0),
		startStationSerial,
		endStationSerial,
		origin,
		destination,
		computedAt: Date.now(),
	};
}

/** Best station to dock at + walk to the destination, or null if walking from
  * a dock is impossible. Returns the station, bike duration and walk duration. */
async function bestEndStation(from: Coord, destination: Destination, profileFrom: 'foot'|'bike'): Promise<{ station: StationInfo, toStation: number, toDestination: number }|null> {
	const destStation = destination.stationSerial ? stations.value.find(s => s.serialNumber === destination.stationSerial) : undefined;
	const candidates = destStation ? [destStation] : nearestStations(destination, s => s.docks - s.bikes > 0);
	if (candidates.length === 0) return null;

	const toStations = await osrmTable(profileFrom, [from], candidates.map(stationCoord));
	if (!toStations) return null;
	// No walking leg needed when the destination is the station itself
	const toDest = destStation ? [candidates.map(() => 0)] : await osrmTable('foot', candidates.map(stationCoord), [destination]);
	if (!toDest) return null;

	let best: { station: StationInfo, toStation: number, toDestination: number }|null = null;
	for (let i = 0; i < candidates.length; i++) {
		const toStation = toStations[0][i];
		const toDestination = destStation ? 0 : toDest[i][0];
		if (toStation == null || toDestination == null) continue;
		if (!best || toStation + toDestination < best.toStation + best.toDestination) {
			best = { station: candidates[i], toStation, toDestination };
		}
	}
	return best;
}

/** Compute the best route from origin to destination.
  * With a bike (active trip): bike to the best dock near the destination, then walk.
  * Without a bike: walk to a station with bikes, bike to a dock near the
  * destination, walk to the destination — unless walking directly is faster. */
export async function computeRoute(origin: Coord, destination: Destination, hasBike: boolean): Promise<PlannedRoute|null> {
	if (hasBike) {
		const best = await bestEndStation(origin, destination, 'bike');
		if (!best) return null;
		const bike = await osrmRoute('bike', origin, stationCoord(best.station));
		if (!bike) return null;
		const legs = [bikeLeg(bike)];
		if (!destination.stationSerial) {
			const walk = await osrmRoute('foot', stationCoord(best.station), destination);
			if (walk) legs.push(footLeg(walk));
		}
		return buildRoute(origin, destination, legs, null, best.station.serialNumber);
	}

	const startCandidates = nearestStations(origin, s => s.bikes > 0 && s.serialNumber !== destination.stationSerial);
	const destStation = destination.stationSerial ? stations.value.find(s => s.serialNumber === destination.stationSerial) : undefined;
	const endCandidates = destStation ? [destStation] : nearestStations(destination, s => s.docks - s.bikes > 0);
	const useStations = startCandidates.length > 0 && endCandidates.length > 0;
	// A single Promise.all so that one failing request never leaves the others
	// dangling: either all results arrive or the whole computation throws
	const [directWalk, walkTable, bikeTable, endTable] = await Promise.all([
		osrmRoute('foot', origin, destination),
		useStations ? osrmTable('foot', [origin], startCandidates.map(stationCoord)) : null,
		useStations ? osrmTable('bike', startCandidates.map(stationCoord), endCandidates.map(stationCoord)) : null,
		useStations ? destStation ? [endCandidates.map(() => 0)] : osrmTable('foot', endCandidates.map(stationCoord), [destination]) : null,
	]);

	let combo: { start: StationInfo, end: StationInfo, walk1: number, bike: number, walk2: number }|null = null;
	if (walkTable && bikeTable && endTable) {
		for (let i = 0; i < startCandidates.length; i++) {
			for (let j = 0; j < endCandidates.length; j++) {
				if (startCandidates[i].serialNumber === endCandidates[j].serialNumber) continue;
				const walk1 = walkTable[0][i], bike = bikeTable[i][j];
				const walk2 = destStation ? 0 : endTable[j][0];
				if (walk1 == null || bike == null || walk2 == null) continue;
				if (!combo || walk1 + bike + walk2 < combo.walk1 + combo.bike + combo.walk2) {
					combo = { start: startCandidates[i], end: endCandidates[j], walk1, bike, walk2 };
				}
			}
		}
	}
	const comboDuration = combo ? combo.walk1 + BIKE_PICKUP_OVERHEAD_s + combo.bike + BIKE_DOCK_OVERHEAD_s + combo.walk2 : Infinity;
	if (directWalk && directWalk.duration <= comboDuration) {
		return buildRoute(origin, destination, [footLeg(directWalk)], null, null);
	}
	if (!combo) return null;

	const [walk1, bike, walk2] = await Promise.all([
		osrmRoute('foot', origin, stationCoord(combo.start)),
		osrmRoute('bike', stationCoord(combo.start), stationCoord(combo.end)),
		destination.stationSerial ? Promise.resolve(null) : osrmRoute('foot', stationCoord(combo.end), destination),
	]);
	if (!bike) return null;
	const legs: RouteLeg[] = [];
	if (walk1) legs.push(footLeg(walk1));
	legs.push(bikeLeg(bike));
	if (walk2) legs.push(footLeg(walk2));
	return buildRoute(origin, destination, legs, combo.start.serialNumber, combo.end.serialNumber);
}

/** Same place, ignoring metadata like the name (which e.g. reverse geocoding
  * fills in asynchronously after a pin is dropped) */
function sameSpot(a: Destination|null, b: Destination|null) {
	return a != null && b != null && a.lat === b.lat && a.lng === b.lng && a.stationSerial === b.stationSerial;
}

let computing: Destination|null = null;
let recomputeQueued = false;
let lastFailedAt = 0;

async function recomputeRoute() {
	const destination = get(routeDestination);
	if (!destination) return;
	if (computing) {
		// A computation for another spot is in flight; rerun when it finishes
		if (!sameSpot(computing, destination)) recomputeQueued = true;
		return;
	}
	const pos = get(currentPos);
	if (!pos) return;
	computing = destination;
	routePending.set(true);
	try {
		const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
		const route = await computeRoute(origin, destination, get(currentTrip) !== null);
		const current = get(routeDestination);
		if (!sameSpot(current, destination)) return; // destination changed meanwhile
		if (!route) {
			lastFailedAt = Date.now();
			errorMessages.add(get(t)('no_route_found'));
		}
		currentRoute.set(route ? { ...route, destination: current! } : null);
	} catch (e) {
		// The routing server could not be reached; rather than showing a
		// misleading partial result, keep an existing route to this destination
		// (it will refresh on the next recompute) or show nothing
		console.error('Route computation failed', e);
		lastFailedAt = Date.now();
		const existing = get(currentRoute);
		if (!existing || !sameSpot(existing.destination, destination)) {
			currentRoute.set(null);
			errorMessages.add(get(t)('route_computation_error'));
		}
	} finally {
		computing = null;
		routePending.set(false);
		if (recomputeQueued) {
			recomputeQueued = false;
			recomputeRoute();
		}
	}
}

export function clearRouteDestination() {
	routeDestination.set(null);
}

routeDestination.subscribe(destination => {
	if (!destination) {
		currentRoute.set(null);
		return;
	}
	const route = get(currentRoute);
	if (route && sameSpot(route.destination, destination)) {
		// Same place, only metadata changed — no need to recompute
		currentRoute.set({ ...route, destination });
		return;
	}
	recomputeRoute();
});

currentPos.subscribe(pos => {
	if (!pos) return;
	const destination = get(routeDestination);
	if (!destination) return;

	// Arrived at the destination
	if (distanceBetweenCoords(pos.coords.latitude, pos.coords.longitude, destination.lat, destination.lng) * 1000 < ARRIVAL_RADIUS_m && get(currentTrip) === null) {
		routeDestination.set(null);
		return;
	}

	const route = get(currentRoute);
	if (route) {
		const movedM = distanceBetweenCoords(pos.coords.latitude, pos.coords.longitude, route.origin.lat, route.origin.lng) * 1000;
		if (movedM > RECOMPUTE_MIN_MOVE_m && Date.now() - route.computedAt > RECOMPUTE_MIN_INTERVAL_ms) recomputeRoute();
	} else if (Date.now() - lastFailedAt > 3 * RECOMPUTE_MIN_INTERVAL_ms) {
		recomputeRoute();
	}
});

// Recompute when a trip starts or ends (walk+bike+walk becomes bike+walk and vice versa),
// and keep the trip's destination metrics in sync with the computed route
let hadBike = false;
currentTrip.subscribe(trip => {
	const hasBike = trip !== null;
	if (hasBike !== hadBike) {
		hadBike = hasBike;
		if (get(routeDestination)) recomputeRoute();
	}
});

currentRoute.subscribe(route => {
	const trip = get(currentTrip);
	if (!trip) return;
	const destination = route ? { lat: route.destination.lat, lng: route.destination.lng } : null;
	const distanceLeft = route ? route.totalDistance / 1000 : null;
	const arrivalTime = route ? new Date(Date.now() + route.totalDuration * 1000) : null;
	if (trip.destination?.lat === destination?.lat && trip.destination?.lng === destination?.lng && trip.distanceLeft === distanceLeft) return;
	currentTrip.update(t => t ? { ...t, destination, distanceLeft, arrivalTime, predictedEndDate: arrivalTime } : t);
});