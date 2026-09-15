import { LOCK_DISTANCE_m } from '$lib/constants';
import { getActiveTrip, knownErrors, quickStartBike } from '$lib/gira-api/api';
import type { ServerActiveTrip } from '$lib/gira-api/models';
import { VaimooApiError } from '$lib/vaimoo-api/client';
import { reportErrorEvent, reportTripStartEvent } from '$lib/gira-mais-api/gira-mais-api';
import { currentPos, setDebugPosition, watchPosition } from '$lib/location';
import { appSettings } from '$lib/settings';
import { errorMessages } from '$lib/ui.svelte';
import { distanceBetweenCoords } from '$lib/utils';
import { get, writable } from 'svelte/store';
import { refreshAccountInfo, refreshToken, token } from './account';
import type { StationInfo } from './map.svelte';
import { t, type Translations } from './translations';

export type ActiveTrip = {
	code: string;
	bikePlate: string | null;
	startPos: { lat: number; lng: number } | null;
	destination: { lat: number; lng: number } | null;
	traveledDistanceKm: number;
	distanceLeft: number | null;
	speed: number;
	startDate: Date;
	predictedEndDate: Date | null;
	arrivalTime: Date | null;
	finished: boolean;
	confirmed: boolean;
	pathTaken: { lat: number; lng: number; time: Date }[];
	lastUpdate: Date | null;
};

export type TripRating = {
	currentRating: {
		code: string;
		bikePlate: string;
		startDate: Date;
		endDate: Date;
	} | null;
};

export const currentTrip = writable<ActiveTrip | null>(null);
export const tripRating = writable<TripRating>({ currentRating: null });

export const DEBUG_TRIP_CODE = 'DEBUG-TRIP';
export const DEBUG_START_POSITION = { lat: 38.744, lng: -9.15 } as const;
const START_CONFIRM_TIMEOUT_MS = 30_000;
let statusRequest: Promise<ServerActiveTrip | null> | null = null;
let completingTripId: string | null = null;

function localTripFromServer(serverTrip: ServerActiveTrip, previous: ActiveTrip | null): ActiveTrip {
	const position = get(currentPos);
	return {
		code: serverTrip.id,
		bikePlate: serverTrip.bikeId ?? previous?.bikePlate ?? null,
		startPos: previous?.startPos ?? (position ? { lat: position.coords.latitude, lng: position.coords.longitude } : null),
		destination: previous?.destination ?? null,
		traveledDistanceKm: previous?.traveledDistanceKm ?? 0,
		distanceLeft: previous?.distanceLeft ?? null,
		speed: previous?.speed ?? 0,
		startDate: serverTrip.startedAt,
		predictedEndDate: previous?.predictedEndDate ?? null,
		arrivalTime: previous?.arrivalTime ?? null,
		finished: false,
		confirmed: true,
		pathTaken: previous?.pathTaken ?? [],
		lastUpdate: new Date,
	};
}

async function completeTrip(trip: ActiveTrip) {
	if (!trip.code || completingTripId === trip.code) return;
	completingTripId = trip.code;
	currentTrip.set(null);
	// VAIMOO has no trip-rating endpoint; the rating only feeds Gira+ bike-condition data.
	if (trip.bikePlate) {
		tripRating.set({ currentRating: { code: trip.code, bikePlate: trip.bikePlate, startDate: trip.startDate, endDate: new Date } });
	}
	await refreshAccountInfo().catch(error => console.error('Could not refresh account after trip completion', error));
	completingTripId = null;
}

/** Reconcile local state with VAIMOO's authoritative active-trip endpoint. */
export async function refreshTripStatus(): Promise<ServerActiveTrip | null> {
	if (statusRequest) return statusRequest;
	statusRequest = getActiveTrip();
	try {
		const serverTrip = await statusRequest;
		const localTrip = get(currentTrip);
		if (serverTrip) {
			currentTrip.set(localTripFromServer(serverTrip, localTrip));
			watchPosition();
		} else if (localTrip?.confirmed) {
			void completeTrip(localTrip);
		} else if (localTrip && Date.now() - localTrip.startDate.getTime() >= START_CONFIRM_TIMEOUT_MS) {
			currentTrip.set(null);
			errorMessages.add(get(t)('bike_unlock_error'));
		}
		return serverTrip;
	} finally {
		statusRequest = null;
	}
}

function addKnownApiError(error: unknown) {
	let added = false;
	if (error instanceof VaimooApiError) {
		for (const item of error.errors) {
			const known = knownErrors[item.message as keyof typeof knownErrors];
			if (known && 'message' in known) {
				errorMessages.add(get(t)(known.message as keyof Translations));
				added = true;
			}
			reportErrorEvent('gira_api_error', item.message);
		}
	}
	if (!added) errorMessages.add(get(t)('bike_unlock_error'));
}

export async function tryStartTrip(id: string, communicationId: string, station: StationInfo): Promise<boolean> {
	try {
		if (get(appSettings).distanceLock) {
			const position = get(currentPos);
			if (!position) {
				errorMessages.add(get(t)('location_determination_error'));
				return false;
			}
			if (distanceBetweenCoords(position.coords.latitude, position.coords.longitude, station.latitude, station.longitude) > LOCK_DISTANCE_m / 1_000) {
				errorMessages.add(get(t)('not_close_enough_error'));
				return false;
			}
		}

		const position = get(currentPos);
		const now = new Date;
		tripRating.set({ currentRating: null });
		currentTrip.set({
			code: '',
			arrivalTime: null,
			bikePlate: id,
			traveledDistanceKm: 0,
			destination: null,
			distanceLeft: null,
			speed: 0,
			startDate: now,
			startPos: position ? { lng: position.coords.longitude, lat: position.coords.latitude } : null,
			predictedEndDate: null,
			finished: false,
			confirmed: false,
			pathTaken: position ? [{ lng: position.coords.longitude, lat: position.coords.latitude, time: now }] : [],
			lastUpdate: now,
		});

		if (import.meta.env.DEV && get(appSettings).mockUnlock) {
			currentTrip.update(trip => trip ? { ...trip, code: DEBUG_TRIP_CODE, confirmed: true } : trip);
			return true;
		}
		await quickStartBike(communicationId);
		reportTripStartEvent(communicationId, station.serialNumber);
		watchPosition();
		void refreshTripStatus();
		return true;
	} catch (error) {
		currentTrip.set(null);
		addKnownApiError(error);
		console.error(error);
		return false;
	}
}

export function checkTripActive() {
	const trip = get(currentTrip);
	if (!trip || trip.code === DEBUG_TRIP_CODE) return;
	const lastUpdate = trip.lastUpdate;
	if (lastUpdate && Date.now() - lastUpdate.getTime() < 30_000) return;
	const currentToken = get(token);
	if (!currentToken) return;
	if (currentToken.expiration - Date.now() < 30_000) void refreshToken().then(refreshTripStatus);
	else void refreshTripStatus();
}

export function startDebugTrip() {
	if (!import.meta.env.DEV || get(currentTrip) !== null) return false;
	let position = get(currentPos);
	if (!position) {
		setDebugPosition({
			coords: { latitude: DEBUG_START_POSITION.lat, longitude: DEBUG_START_POSITION.lng, accuracy: 1, altitude: null, altitudeAccuracy: null, heading: null, speed: 0 },
			timestamp: Date.now(),
		});
		position = get(currentPos);
	}
	const startPos = position ? { lat: position.coords.latitude, lng: position.coords.longitude } : DEBUG_START_POSITION;
	const now = new Date;
	currentTrip.set({
		code: DEBUG_TRIP_CODE,
		bikePlate: 'DEBUG',
		startPos: { ...startPos },
		destination: null,
		traveledDistanceKm: 0,
		distanceLeft: null,
		speed: 0,
		startDate: now,
		predictedEndDate: null,
		arrivalTime: null,
		finished: false,
		confirmed: true,
		pathTaken: [{ ...startPos, time: now }],
		lastUpdate: now,
	});
	return true;
}

export function endDebugTrip() {
	if (!import.meta.env.DEV || get(currentTrip)?.code !== DEBUG_TRIP_CODE) return false;
	currentTrip.set(null);
	return true;
}

export function toggleDebugTrip() {
	const trip = get(currentTrip);
	if (!trip) return startDebugTrip();
	if (trip.code === DEBUG_TRIP_CODE) return endDebugTrip();
	console.warn('Cannot toggle a debug trip while a real trip is active.');
	return false;
}