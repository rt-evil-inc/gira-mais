import { get, writable } from 'svelte/store';
import { currentPos } from '$lib/location';
import { currentTrip } from '$lib/trip';
import { LOCK_DISTANCE_m } from '$lib/constants';
import { selectedStation, stations, type StationInfo } from '$lib/map.svelte';
import { distanceBetweenCoords } from '$lib/utils';
import { errorMessages } from '$lib/ui.svelte';
import { t } from '$lib/translations';
import { osrmRoute, osrmTable, type Coord, type OsrmRoute } from '$lib/osrm';

export type { Coord } from '$lib/osrm';
export type LocationDestination = Coord & {
	type: 'location',
	name?: string,
};
export type StationDestination = Coord & {
	type: 'station',
	name: string,
	stationSerial: string,
};
export type Destination = LocationDestination|StationDestination;
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
const BIKE_PICKUP_OVERHEAD_SECONDS = 60;
const BIKE_DOCK_OVERHEAD_SECONDS = 30;
const MAX_STATION_CANDIDATES = 3;
const ARRIVAL_RADIUS_METERS = 40;
const RECOMPUTE_MIN_MOVE_METERS = 30;
const RECOMPUTE_MIN_INTERVAL_MS = 5000;

function stationCoord(s: StationInfo): Coord {
	return { lat: s.latitude, lng: s.longitude };
}

function resolveDestinationStation(destination: Destination): StationInfo|undefined {
	return destination.type === 'station' ?
		stations.value.find(s => s.serialNumber === destination.stationSerial) :
		undefined;
}

function hasAvailableBike(station: StationInfo): boolean {
	return station.assetStatus === 'active' && station.bikes > 0;
}

function hasAvailableDock(station: StationInfo): boolean {
	return station.assetStatus === 'active' && station.docks - station.bikes > 0;
}

function nearestStations(target: Coord, isEligible: (station: StationInfo) => boolean): StationInfo[] {
	return stations.value
		.filter(isEligible)
		.map(s => ({ s, d: distanceBetweenCoords(target.lat, target.lng, s.latitude, s.longitude) }))
		.sort((a, b) => a.d - b.d)
		.slice(0, MAX_STATION_CANDIDATES)
		.map(x => x.s);
}

function routeLeg(mode: RouteLeg['mode'], route: OsrmRoute): RouteLeg {
	return { mode, coordinates: route.geometry.coordinates, distance: route.distance, duration: route.duration };
}

type BuildRouteOptions = {
	origin: Coord,
	destination: Destination,
	legs: RouteLeg[],
	pickupStationSerial: string|null,
	dropoffStationSerial: string|null,
};

function buildRoute({ origin, destination, legs, pickupStationSerial, dropoffStationSerial }: BuildRouteOptions): PlannedRoute {
	return {
		legs,
		totalDistance: legs.reduce((acc, l) => acc + l.distance, 0),
		totalDuration: legs.reduce((acc, l) => acc + l.duration, 0),
		startStationSerial: pickupStationSerial,
		endStationSerial: dropoffStationSerial,
		origin,
		destination,
		computedAt: Date.now(),
	};
}

type EndStationCandidate = {
	station: StationInfo,
	travelToStationDuration: number,
	walkToDestinationDuration: number,
};

/** Finds the station that minimizes travel to the station plus the final walk. */
async function findBestEndStation(from: Coord, destination: Destination, travelMode: 'foot'|'bike'): Promise<EndStationCandidate|null> {
	const requestedStation = resolveDestinationStation(destination);
	if (requestedStation) {
		const travelDurations = await osrmTable(travelMode, [from], [stationCoord(requestedStation)]);
		const travelToStationDuration = travelDurations?.[0][0];
		return travelToStationDuration == null ? null : {
			station: requestedStation,
			travelToStationDuration,
			walkToDestinationDuration: 0,
		};
	}

	const candidates = nearestStations(destination, hasAvailableDock);
	if (candidates.length === 0) return null;
	const candidateCoordinates = candidates.map(stationCoord);
	const [travelDurations, walkingDurations] = await Promise.all([
		osrmTable(travelMode, [from], candidateCoordinates),
		osrmTable('foot', candidateCoordinates, [destination]),
	]);
	if (!travelDurations || !walkingDurations) return null;

	let best: EndStationCandidate|null = null;
	for (let i = 0; i < candidates.length; i++) {
		const travelToStationDuration = travelDurations[0][i];
		const walkToDestinationDuration = walkingDurations[i][0];
		if (travelToStationDuration == null || walkToDestinationDuration == null) continue;
		if (!best || travelToStationDuration + walkToDestinationDuration < best.travelToStationDuration + best.walkToDestinationDuration) {
			best = { station: candidates[i], travelToStationDuration, walkToDestinationDuration };
		}
	}
	return best;
}

async function computeRouteWithBike(origin: Coord, destination: Destination): Promise<PlannedRoute|null> {
	const destinationStation = resolveDestinationStation(destination);
	const endStation = await findBestEndStation(origin, destination, 'bike');
	if (!endStation) return null;

	const bikeRoute = await osrmRoute('bike', origin, stationCoord(endStation.station));
	if (!bikeRoute) return null;
	const legs = [routeLeg('bike', bikeRoute)];
	if (!destinationStation) {
		const finalWalkRoute = await osrmRoute('foot', stationCoord(endStation.station), destination);
		if (finalWalkRoute) legs.push(routeLeg('foot', finalWalkRoute));
	}
	return buildRoute({
		origin,
		destination,
		legs,
		pickupStationSerial: null,
		dropoffStationSerial: endStation.station.serialNumber,
	});
}

type StationRouteCandidate = {
	pickupStation: StationInfo,
	dropoffStation: StationInfo,
	walkToPickupDuration: number,
	bikeDuration: number,
	walkFromDropoffDuration: number,
};

async function computeRouteWithoutBike(origin: Coord, destination: Destination): Promise<PlannedRoute|null> {
	const destinationStation = resolveDestinationStation(destination);
	const pickupCandidates = nearestStations(origin, station => hasAvailableBike(station) && station.serialNumber !== destinationStation?.serialNumber);
	const dropoffCandidates = destinationStation ? [destinationStation] : nearestStations(destination, hasAvailableDock);
	const canUseStations = pickupCandidates.length > 0 && dropoffCandidates.length > 0;
	const [directWalkRoute, walkToPickupDurations, bikeDurations, walkFromDropoffDurations] = await Promise.all([
		osrmRoute('foot', origin, destination),
		canUseStations ? osrmTable('foot', [origin], pickupCandidates.map(stationCoord)) : null,
		canUseStations ? osrmTable('bike', pickupCandidates.map(stationCoord), dropoffCandidates.map(stationCoord)) : null,
		canUseStations && !destinationStation ? osrmTable('foot', dropoffCandidates.map(stationCoord), [destination]) : null,
	]);

	let bestCandidate: StationRouteCandidate|null = null;
	if (walkToPickupDurations && bikeDurations && (destinationStation || walkFromDropoffDurations)) {
		for (let pickupIndex = 0; pickupIndex < pickupCandidates.length; pickupIndex++) {
			for (let dropoffIndex = 0; dropoffIndex < dropoffCandidates.length; dropoffIndex++) {
				const pickupStation = pickupCandidates[pickupIndex];
				const dropoffStation = dropoffCandidates[dropoffIndex];

				// Direct walking should always beat this combination. Exclude it anyway so
				// inconsistent OSRM responses cannot produce a pointless same-station bike leg.
				if (pickupStation.serialNumber === dropoffStation.serialNumber) continue;

				const walkToPickupDuration = walkToPickupDurations[0][pickupIndex];
				const bikeDuration = bikeDurations[pickupIndex][dropoffIndex];
				const walkFromDropoffDuration = destinationStation ? 0 : walkFromDropoffDurations![dropoffIndex][0];
				if (walkToPickupDuration == null || bikeDuration == null || walkFromDropoffDuration == null) continue;
				const totalDuration = walkToPickupDuration + bikeDuration + walkFromDropoffDuration;
				const bestDuration = bestCandidate ?
					bestCandidate.walkToPickupDuration + bestCandidate.bikeDuration + bestCandidate.walkFromDropoffDuration :
					Infinity;
				if (totalDuration < bestDuration) {
					bestCandidate = { pickupStation, dropoffStation, walkToPickupDuration, bikeDuration, walkFromDropoffDuration };
				}
			}
		}
	}
	const stationRouteDuration = bestCandidate ?
		bestCandidate.walkToPickupDuration + BIKE_PICKUP_OVERHEAD_SECONDS + bestCandidate.bikeDuration + BIKE_DOCK_OVERHEAD_SECONDS + bestCandidate.walkFromDropoffDuration :
		Infinity;
	if (directWalkRoute && directWalkRoute.duration <= stationRouteDuration) {
		return buildRoute({ origin, destination, legs: [routeLeg('foot', directWalkRoute)], pickupStationSerial: null, dropoffStationSerial: null });
	}
	if (!bestCandidate) return null;

	const [walkToPickupRoute, bikeRoute, walkFromDropoffRoute] = await Promise.all([
		osrmRoute('foot', origin, stationCoord(bestCandidate.pickupStation)),
		osrmRoute('bike', stationCoord(bestCandidate.pickupStation), stationCoord(bestCandidate.dropoffStation)),
		destinationStation ? Promise.resolve(null) : osrmRoute('foot', stationCoord(bestCandidate.dropoffStation), destination),
	]);
	if (!bikeRoute) return null;
	const legs: RouteLeg[] = [];
	if (walkToPickupRoute) legs.push(routeLeg('foot', walkToPickupRoute));
	legs.push(routeLeg('bike', bikeRoute));
	if (walkFromDropoffRoute) legs.push(routeLeg('foot', walkFromDropoffRoute));
	return buildRoute({
		origin,
		destination,
		legs,
		pickupStationSerial: bestCandidate.pickupStation.serialNumber,
		dropoffStationSerial: bestCandidate.dropoffStation.serialNumber,
	});
}

/** Compute the best route from origin to destination using the rider's current bike state. */
export async function computeRoute(origin: Coord, destination: Destination, hasBike: boolean): Promise<PlannedRoute|null> {
	return hasBike ?
		computeRouteWithBike(origin, destination) :
		computeRouteWithoutBike(origin, destination);
}

/** Same place, ignoring metadata like the name (which e.g. reverse geocoding
  * fills in asynchronously after a pin is dropped) */
function sameRoutingDestination(a: Destination|null, b: Destination|null) {
	if (!a || !b || a.type !== b.type || a.lat !== b.lat || a.lng !== b.lng) return false;
	return a.type === 'location' || (b.type === 'station' && a.stationSerial === b.stationSerial);
}

let computing: Destination|null = null;
let recomputeQueued = false;
let lastFailedAt = 0;

async function recomputeRoute() {
	const destination = get(routeDestination);
	if (!destination) return;
	if (computing) {
		// A computation for another spot is in flight; rerun when it finishes
		if (!sameRoutingDestination(computing, destination)) recomputeQueued = true;
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
		if (!current || !sameRoutingDestination(current, destination)) return; // destination changed meanwhile
		if (!route) {
			lastFailedAt = Date.now();
			errorMessages.add(get(t)('no_route_found'));
		}
		currentRoute.set(route ? { ...route, destination: current } : null);
	} catch (e) {
		// The routing server could not be reached; rather than showing a
		// misleading partial result, keep an existing route to this destination
		// (it will refresh on the next recompute) or show nothing
		console.error('Route computation failed', e);
		lastFailedAt = Date.now();
		const existing = get(currentRoute);
		if (!existing || !sameRoutingDestination(existing.destination, destination)) {
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

/** The station the route heads to for picking up a bike — the pickup station,
  * or a station destination itself when walking straight to one */
export function routePickupStationSerial(route: PlannedRoute|null): string|null {
	if (!route) return null;
	return route.startStationSerial ?? (route.destination.type === 'station' ? route.destination.stationSerial : null);
}

// Open the station menu automatically when the user reaches the station where
// they will pick up a bike, so they don't need to tap it to unlock one
let autoOpenedStation: string|null = null;
function autoOpenStationMenu(pos: Coord) {
	if (get(currentTrip) !== null) return;
	const serial = routePickupStationSerial(get(currentRoute));
	if (!serial || autoOpenedStation === serial) return;
	const station = stations.value.find(s => s.serialNumber === serial);
	if (!station) return;
	if (distanceBetweenCoords(pos.lat, pos.lng, station.latitude, station.longitude) * 1000 > LOCK_DISTANCE_m) return;
	autoOpenedStation = serial; // only once per approach, so dismissing it sticks
	if (get(selectedStation) == null) selectedStation.set(serial);
}

routeDestination.subscribe(destination => {
	autoOpenedStation = null;
	if (!destination) {
		currentRoute.set(null);
		return;
	}
	const route = get(currentRoute);
	if (route && sameRoutingDestination(route.destination, destination)) {
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
	if (distanceBetweenCoords(pos.coords.latitude, pos.coords.longitude, destination.lat, destination.lng) * 1000 < ARRIVAL_RADIUS_METERS && get(currentTrip) === null) {
		routeDestination.set(null);
		return;
	}

	autoOpenStationMenu({ lat: pos.coords.latitude, lng: pos.coords.longitude });

	const route = get(currentRoute);
	if (route) {
		const movedM = distanceBetweenCoords(pos.coords.latitude, pos.coords.longitude, route.origin.lat, route.origin.lng) * 1000;
		if (movedM > RECOMPUTE_MIN_MOVE_METERS && Date.now() - route.computedAt > RECOMPUTE_MIN_INTERVAL_MS) recomputeRoute();
	} else if (Date.now() - lastFailedAt > 3 * RECOMPUTE_MIN_INTERVAL_MS) {
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