import { currentSession, refreshToken } from '$lib/account';
import type { StationInfo } from '$lib/map.svelte';
import type { Translations } from '$lib/translations';
import { vaimooFeedbackComment, type TripRatingDetails } from '$lib/trip-rating';
import {
	getCurrentVaimooTrip,
	getVaimooTripDetails,
	getVaimooRemainingCredit,
	getVaimooSubscriptionUsage,
	getVaimooTrips,
	quickStartVaimooTrip,
	submitVaimooTripFeedback,
} from '$lib/vaimoo-api/client';
import {
	getFirestoreBikes,
	getFirestoreStations,
	subscribeFirestoreBikes,
	subscribeFirestoreStations,
} from '$lib/vaimoo-api/firestore';
import { VaimooApiError } from '$lib/vaimoo-api/client';
import type { VaimooBike, VaimooSession, VaimooStation, VaimooTripDetails } from '$lib/vaimoo-api/types';
import type { AccountSnapshot, AvailableBike, CompletedTrip, ServerActiveTrip } from './models';

// TODO: these keys come from the legacy GIRA GraphQL API; VAIMOO error payloads still need to be mapped.
export const knownErrors = {
	trip_interval_limit: { message: 'trip_interval_limit_error', retry: false },
	not_enough_balance: { message: 'negative_balance_error', retry: false },
	has_no_active_subscriptions: { message: 'no_active_subscription_error', retry: false },
	already_active_trip: { message: 'already_active_trip_error', retry: false },
	already_has_active_trip: { message: 'already_active_trip_error', retry: false },
	unable_to_start_trip: { message: 'bike_unlock_error', retry: true },
	trip_not_found: { message: 'trip_not_found_error', retry: false },
	invalid_arguments: { retry: false },
	bike_already_in_trip: { message: 'bike_already_in_trip_error', retry: false },
	bike_already_reserved: { message: 'bike_already_reserved_error', retry: false },
	no_bike_found: { message: 'no_bike_found_error', retry: false },
	bike_on_repair: { message: 'bike_in_repair_error', retry: false },
	bike_in_repair: { message: 'bike_in_repair_error', retry: false },
} as const satisfies Record<string, { message?: keyof Translations; retry: boolean }>;

/**
 * VAIMOO's numeric `responseStatus.errorCode`s, taken from the official app's error enum. These are the
 * refusals worth naming for the user; anything else falls back to the generic unlock error. Unlocking a
 * bike the station feed hides relies on these, since such an attempt is the one most likely to be refused.
 */
export const knownErrorCodes = {
	412: 'bike_not_available_error',
	1100: 'no_bike_found_error',
	1103: 'bike_in_repair_error',
	1113: 'bike_uncharged_error',
	1122: 'bike_already_in_trip_error',
	1607: 'already_active_trip_error',
	5800: 'no_bike_found_error',
} as const satisfies Record<number, keyof Translations>;

function session(): VaimooSession {
	const current = currentSession();
	if (!current) throw new Error('Not authenticated with VAIMOO');
	return current;
}

/** Run a VAIMOO call with the current session, refreshing the token and retrying once if it was rejected. */
async function withSession<T>(request: (session: VaimooSession) => Promise<T>): Promise<T> {
	try {
		return await request(session());
	} catch (error) {
		if (!(error instanceof VaimooApiError) || error.status !== 401) throw error;
		console.debug('VAIMOO rejected the access token, refreshing and retrying');
		if (!await refreshToken()) throw error;
		return request(session());
	}
}

function stationDescription(station: VaimooStation) {
	return [station.StreetBuildingIdentifier, station.Street, station.City].filter(Boolean).join(' ');
}

// The station feed's AvailableBikes counter doesn't always match what can be unlocked: it sometimes counts
// bikes whose record names no dock. Once a station's bikes have been loaded, prefer the observed count for
// as long as the server counter stays at the value it had then.
const observedBikeCounts = new Map<string, { serverBikes: number; bikes: number }>;
let lastStations: VaimooStation[] = [];
let stationListener: ((stations: StationInfo[]) => void) | null = null;

function serverBikeCount(station: VaimooStation) {
	return Math.max(0, Math.trunc(station.AvailableBikes));
}

function stationBikeCount(station: VaimooStation) {
	const serverBikes = serverBikeCount(station);
	const observed = observedBikeCounts.get(String(station.DockingStationId));
	return observed && observed.serverBikes === serverBikes ? observed.bikes : serverBikes;
}

function recordObservedBikeCount(stationId: string, bikes: number) {
	const station = lastStations.find(candidate => String(candidate.DockingStationId) === stationId);
	if (!station) return;
	const serverBikes = serverBikeCount(station);
	const previous = observedBikeCounts.get(stationId);
	if (previous?.serverBikes === serverBikes && previous.bikes === bikes) return;
	const shownBefore = stationBikeCount(station);
	observedBikeCounts.set(stationId, { serverBikes, bikes });
	// Re-emitting rebuilds every map marker; skip it when the displayed count is unchanged, which
	// is the common case on the first snapshot of a station and would otherwise stutter the menu opening.
	if (stationBikeCount(station) === shownBefore) return;
	stationListener?.(mapStations(lastStations));
}

// Mirrors the official app, which keys station availability on ServiceStatus alone (IsActive is ignored) and
// treats IN_USE, LIMITED_USE and any status it doesn't recognise as usable.
const UNAVAILABLE_SERVICE_STATUSES = new Set(['DISABLED', 'UNAVAILABLE_BY_SYSTEM', 'UNAVAILABLE_BY_OPERATOR', 'UNKNOWN']);

function mapStations(response: VaimooStation[]): StationInfo[] {
	lastStations = response;
	return response.map(station => ({
		code: String(station.DockingStationId),
		description: stationDescription(station),
		latitude: station.Location.latitude,
		longitude: station.Location.longitude,
		name: station.Name,
		bikes: stationBikeCount(station),
		docks: Math.max(0, Math.trunc(station.DockLimit)),
		freeDocks: Math.max(0, Math.trunc(station.FreeDocks)),
		serialNumber: String(station.DockingStationId),
		assetStatus: UNAVAILABLE_SERVICE_STATUSES.has(station.ServiceStatus) ? 'repair' : 'active',
	}));
}

export async function getStations(): Promise<StationInfo[]> {
	return mapStations(await getFirestoreStations());
}

export function subscribeStations(onData: (stations: StationInfo[]) => void, onError?: (error: Error) => void) {
	stationListener = onData;
	const unsubscribe = subscribeFirestoreStations(stations => onData(mapStations(stations)), onError);
	return () => {
		if (stationListener === onData) stationListener = null;
		unsubscribe();
	};
}

/** The server's reasons for flagging a bike unavailable, from its `Comment` ("Has low battery; \tIs offline; \t"). */
function hidingReasons(bike: VaimooBike): string[] {
	return (bike.Comment ?? '').split(';').map(reason => reason.trim()).filter(reason => reason && reason !== 'Bike is OK');
}

function mapBike(bike: VaimooBike): AvailableBike {
	return {
		id: bike.VisualId,
		communicationId: bike.CommunicationId,
		type: bike.Category === 'E-Bike' ? 'electric' : 'classic',
		battery: bike.BatteryPercentage,
		remainingDistanceKm: bike.RemainingDistance,
		dock: bike.DockingPointVisualId ?? null,
		stationId: String(bike.DockingStationId),
		hiddenReasons: bike.IsAvaliable ? undefined : hidingReasons(bike),
		record: bike,
	};
}

function dockOrder(dock: string | null) {
	const number = dock == null ? NaN : parseInt(dock, 10);
	return Number.isNaN(number) ? Number.POSITIVE_INFINITY : number;
}

/**
 * Whether a bike can be unlocked from this station: available and in one of its docks. The dock matters
 * because the feed sometimes lists available bikes with no dock: the survey's typed-in bikes whose records
 * named no dock started a trip without the dock letting go, and those trips stayed open for hours.
 *
 * Bikes the server flags unavailable are left out, as the official app does. A field survey in September 2026
 * (see gira-web's unlock_attempts) found that VAIMOO only refused the ones flagged "Has repair", so v1.6.0
 * listed the rest. From 6 October 2026 (between 08:36 and 09:40 UTC) VAIMOO refuses every flagged bike with
 * error 1103 (BikeIsBrokenException), whatever the reason, and none has unlocked since.
 */
function isUnlockable(bike: VaimooBike) {
	return bike.IsAvaliable && !bike.IsBooked && !!bike.CommunicationId && !!bike.DockingPointVisualId;
}

// Firestore returns bikes in arbitrary order; list them by dock number like the station does.
function byDock(a: AvailableBike, b: AvailableBike) {
	return dockOrder(a.dock) - dockOrder(b.dock) || a.id.localeCompare(b.id);
}

function stationBikes(bikes: VaimooBike[]) {
	return bikes.filter(isUnlockable).map(mapBike).sort(byDock);
}

/** The station's unlockable bikes by dock; those the server flags unavailable carry `hiddenReasons`. */
export async function getStationBikes(stationId: string): Promise<AvailableBike[]> {
	return stationBikes(await getFirestoreBikes(Number(stationId)));
}

export function subscribeStationBikes(
	stationId: string,
	onData: (bikes: AvailableBike[]) => void,
	onError?: (error: Error) => void,
) {
	return subscribeFirestoreBikes(Number(stationId), bikes => {
		const unlockable = stationBikes(bikes);
		recordObservedBikeCount(stationId, unlockable.length);
		onData(unlockable);
	}, onError);
}

export async function quickStartBike(communicationId: string): Promise<void> {
	await withSession(currentSession => quickStartVaimooTrip(currentSession, communicationId));
}

/**
 * VAIMOO trip timestamps are UTC but carry no zone designator ("2026-09-15T21:20:22.308"); the official
 * app parses them with an explicit UTC formatter. `new Date` would read them as local time, an hour off
 * in Lisbon summer time, so append the designator when it is missing.
 */
export function parseVaimooDate(value: string): Date {
	const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/i.test(value);
	return new Date(hasOffset ? value : value + 'Z');
}

export async function getActiveTrip(): Promise<ServerActiveTrip | null> {
	const trip = await withSession(getCurrentVaimooTrip);
	if (trip.activeTripId == null || trip.activeTripId <= 0) return null;
	return {
		id: String(trip.activeTripId),
		bikeId: trip.visualId,
		startedAt: trip.tripStartDate ? parseVaimooDate(trip.tripStartDate) : new Date,
		bikeState: trip.bikePcbBikeState,
	};
}

function mapCompletedTrip(trip: VaimooTripDetails): CompletedTrip {
	return {
		id: String(trip.tripId ?? ''),
		startedAt: parseVaimooDate(trip.startDate),
		endedAt: parseVaimooDate(trip.endDate),
		bikeId: trip.vehicle?.visualId ?? null,
		bikeType: trip.vehicle?.vehicleCategoryCode ?? null,
		startStation: trip.startStation?.name ?? null,
		endStation: trip.endStation?.name ?? null,
		distanceMeters: trip.coveredDistanceInMeters,
		cost: trip.tripCost,
	};
}

export async function getTripHistory(page: number, pageSize: number): Promise<CompletedTrip[]> {
	const trips = await withSession(currentSession => getVaimooTrips(currentSession, page, pageSize));
	return trips.data.map(mapCompletedTrip);
}

function vaimooLocalTimestamp(date: Date) {
	const pad = (value: number, length = 2) => String(value).padStart(length, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** Submit the same trip feedback payload as the official Gira Android app, reasons and comment included. */
export async function submitTripRating(tripCode: string, bikePlate: string, rating: number, details?: TripRatingDetails, createdAt = new Date): Promise<void> {
	const tripId = Number(tripCode);
	if (!Number.isInteger(tripId) || tripId <= 0) throw new Error('Cannot rate a trip without a valid VAIMOO trip id');
	if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Trip rating must be between 1 and 5');

	await withSession(async currentSession => {
		const trip = await getVaimooTripDetails(currentSession, tripId);
		await submitVaimooTripFeedback(currentSession, {
			createDate: vaimooLocalTimestamp(createdAt),
			osVersion: 'Android',
			appVersion: '1.0.0',
			rating,
			comment: vaimooFeedbackComment(details),
			reportType: 'Opinion',
			vehicleVisualId: bikePlate,
			geoFenceId: trip.endStation?.stationId ?? null,
			tripId,
		});
	});
}

export async function getAccountSnapshot(): Promise<AccountSnapshot> {
	const [credit, usage] = await withSession(currentSession => Promise.all([
		getVaimooRemainingCredit(currentSession),
		getVaimooSubscriptionUsage(currentSession),
	]));
	const isExpired = (item: typeof usage[number]) => item.isExpired ?? new Date(item.expirationDate).getTime() <= Date.now();
	const activeUsage = usage.find(item => !isExpired(item)) ?? usage[0];
	return {
		balance: credit.remainingCredit,
		subscription: activeUsage ? {
			active: !isExpired(activeUsage),
			expiresAt: new Date(activeUsage.expirationDate),
			name: activeUsage.currentSubscription.name,
			status: isExpired(activeUsage) ? 'Expired' : 'Active',
			type: activeUsage.currentSubscription.membershipType ?? 'unknown',
		} : null,
	};
}