import { get } from 'svelte/store';
import { refreshToken, token } from '$lib/account';
import { GIRA_TENANT } from '$lib/constants';
import type { StationInfo } from '$lib/map.svelte';
import type { Translations } from '$lib/translations';
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
	findFirestoreBike,
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

function session(): VaimooSession {
	const current = get(token);
	if (!current?.accessToken || !current.refreshToken || current.userId == null) {
		throw new Error('Not authenticated with VAIMOO');
	}
	return {
		accessToken: current.accessToken,
		refreshToken: current.refreshToken,
		userId: current.userId,
		expiresAt: current.expiration,
		user: { userId: current.userId, tenantId: current.tenantId ?? GIRA_TENANT },
	};
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

function mapStations(response: VaimooStation[]): StationInfo[] {
	return response.map(station => ({
		code: String(station.DockingStationId),
		description: stationDescription(station),
		latitude: station.Location.latitude,
		longitude: station.Location.longitude,
		name: station.Name,
		bikes: Math.max(0, Math.trunc(station.AvailableBikes)),
		docks: Math.max(0, Math.trunc(station.DockLimit)),
		freeDocks: Math.max(0, Math.trunc(station.FreeDocks)),
		serialNumber: String(station.DockingStationId),
		assetStatus: station.IsActive && station.ServiceStatus === 'AVAILABLE' ? 'active' : 'repair',
	}));
}

export async function getStations(): Promise<StationInfo[]> {
	return mapStations(await getFirestoreStations());
}

export function subscribeStations(onData: (stations: StationInfo[]) => void, onError?: (error: Error) => void) {
	return subscribeFirestoreStations(stations => onData(mapStations(stations)), onError);
}

function mapBike(bike: VaimooBike, manual = false): AvailableBike {
	return {
		id: bike.VisualId,
		communicationId: bike.CommunicationId,
		type: bike.Category === 'E-Bike' ? 'electric' : 'classic',
		battery: bike.BatteryPercentage,
		remainingDistanceKm: bike.RemainingDistance,
		dock: bike.DockingPointVisualId ?? null,
		stationId: String(bike.DockingStationId),
		manual,
	};
}

function dockOrder(dock: string | null) {
	const number = dock == null ? NaN : parseInt(dock, 10);
	return Number.isNaN(number) ? Number.POSITIVE_INFINITY : number;
}

// Firestore returns bikes in arbitrary order; list them by dock number like the station does.
function availableBikes(bikes: VaimooBike[]) {
	return bikes
		.filter(bike => bike.IsAvaliable && !bike.IsBooked && Boolean(bike.CommunicationId))
		.map(bike => mapBike(bike))
		.sort((a, b) => dockOrder(a.dock) - dockOrder(b.dock) || a.id.localeCompare(b.id));
}

export async function getStationBikes(stationId: string): Promise<AvailableBike[]> {
	return availableBikes(await getFirestoreBikes(Number(stationId)));
}

export function subscribeStationBikes(
	stationId: string,
	onData: (bikes: AvailableBike[]) => void,
	onError?: (error: Error) => void,
) {
	return subscribeFirestoreBikes(Number(stationId), bikes => onData(availableBikes(bikes)), onError);
}

export async function findAvailableBike(visualId: string): Promise<AvailableBike | null> {
	const normalized = visualId.trim().toUpperCase();
	const bikes = await findFirestoreBike(normalized);
	const bike = bikes.find(candidate => candidate.IsAvaliable && !candidate.IsBooked && Boolean(candidate.CommunicationId));
	return bike ? mapBike(bike, true) : null;
}

export async function quickStartBike(communicationId: string): Promise<void> {
	await withSession(currentSession => quickStartVaimooTrip(currentSession, communicationId));
}

export async function getActiveTrip(): Promise<ServerActiveTrip | null> {
	const trip = await withSession(getCurrentVaimooTrip);
	if (trip.activeTripId == null || trip.activeTripId <= 0) return null;
	return {
		id: String(trip.activeTripId),
		bikeId: trip.visualId,
		startedAt: trip.tripStartDate ? new Date(trip.tripStartDate) : new Date,
		bikeState: trip.bikePcbBikeState,
	};
}

function mapCompletedTrip(trip: VaimooTripDetails): CompletedTrip {
	return {
		id: String(trip.tripId ?? ''),
		startedAt: new Date(trip.startDate),
		endedAt: new Date(trip.endDate),
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

/** Submit the same trip feedback payload as the official Gira Android app. */
export async function submitTripRating(tripCode: string, bikePlate: string, rating: number, createdAt = new Date): Promise<void> {
	const tripId = Number(tripCode);
	if (!Number.isInteger(tripId) || tripId <= 0) throw new Error('Cannot rate a trip without a valid VAIMOO trip id');
	if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Trip rating must be between 1 and 5');

	await withSession(async currentSession => {
		const details = await getVaimooTripDetails(currentSession, tripId);
		await submitVaimooTripFeedback(currentSession, {
			createDate: vaimooLocalTimestamp(createdAt),
			osVersion: 'Android',
			appVersion: '1.0.0',
			rating,
			comment: [''],
			reportType: 'Opinion',
			vehicleVisualId: bikePlate,
			geoFenceId: details.endStation?.stationId ?? null,
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