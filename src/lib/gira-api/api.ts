import { get } from 'svelte/store';
import { token } from '$lib/account';
import type { StationInfo } from '$lib/map.svelte';
import type { Translations } from '$lib/translations';
import {
	getCurrentVaimooTrip,
	getVaimooIssueCategories,
	getVaimooRemainingCredit,
	getVaimooSubscriptionUsage,
	getVaimooTrips,
	quickStartVaimooTrip,
	submitVaimooTripIssue,
	vaimooRequest,
} from '$lib/vaimoo-api/client';
import {
	findFirestoreBike,
	getFirestoreBikes,
	getFirestoreStations,
	subscribeFirestoreBikes,
	subscribeFirestoreStations,
} from '$lib/vaimoo-api/firestore';
import type { VaimooBike, VaimooSession, VaimooStation, VaimooTripDetails } from '$lib/vaimoo-api/types';
import type { AccountSnapshot, AvailableBike, CompletedTrip, IssueCategory, ServerActiveTrip, TripIssueReport } from './models';

export const knownErrors = {
	'Serviço indisponível. Horário de utilização entre as 06:00 e as 02:00.': { message: 'service_hours_error', retry: false },
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
		user: { userId: current.userId, tenantId: current.tenantId ?? 'P1/EML/EML/' },
	};
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

function availableBikes(bikes: VaimooBike[]) {
	return bikes.filter(bike => bike.IsAvaliable && !bike.IsBooked && Boolean(bike.CommunicationId)).map(bike => mapBike(bike));
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
	await quickStartVaimooTrip(session(), communicationId);
}

export async function getActiveTrip(): Promise<ServerActiveTrip | null> {
	const trip = await getCurrentVaimooTrip(session());
	if (trip.activeTripId == null || trip.activeTripId <= 0) return null;
	return {
		id: String(trip.activeTripId),
		bikeId: trip.visualId,
		startedAt: trip.tripStartDate ? new Date(trip.tripStartDate) : new Date(),
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

export async function getTripDetails(tripId: string): Promise<CompletedTrip> {
	const currentSession = session();
	const trip = await vaimooRequest<VaimooTripDetails>(`trip/trip-details/${encodeURIComponent(tripId)}`, {
		token: currentSession.accessToken,
		userId: currentSession.userId,
	});
	return mapCompletedTrip(trip);
}

export async function getTripHistory(page: number, pageSize: number): Promise<CompletedTrip[]> {
	const trips = await getVaimooTrips(session(), page, pageSize);
	return trips.data.map(mapCompletedTrip);
}

export async function getAccountSnapshot(): Promise<AccountSnapshot> {
	const currentSession = session();
	const [credit, usage] = await Promise.all([
		getVaimooRemainingCredit(currentSession),
		getVaimooSubscriptionUsage(currentSession),
	]);
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

export async function submitTripIssue(report: TripIssueReport): Promise<number> {
	const response = await submitVaimooTripIssue(session(), {
		tripId: Number(report.tripId),
		vehicleVisualId: report.bikeId ?? '',
		comment: [report.comment],
		issueCategoryId: report.issueCategoryId,
		location: report.location,
	});
	return response.reportId;
}

export async function getIssueCategories(): Promise<IssueCategory[]> {
	return (await getVaimooIssueCategories(session())).map(category => ({
		id: category.id,
		name: category.name,
		description: category.description,
	}));
}
