import { LOCK_DISTANCE_m } from '$lib/constants';
import { getActiveTrip, getTripHistory, knownErrors, quickStartBike } from '$lib/gira-api/api';
import type { ServerActiveTrip } from '$lib/gira-api/models';
import { VaimooApiError, VaimooNetworkError } from '$lib/vaimoo-api/client';
import { reportErrorEvent, reportTripStartEvent } from '$lib/gira-mais-api/gira-mais-api';
import { currentPos, setDebugPosition, watchPosition } from '$lib/location';
import { appSettings } from '$lib/settings';
import { errorMessages } from '$lib/ui.svelte';
import { distanceBetweenCoords } from '$lib/utils';
import { get, writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
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
const RECENT_RATING_WINDOW_MS = 60 * 60 * 1_000;
const LAST_RATED_TRIP_KEY = 'trip/lastRatedTripId';
let statusRequest: Promise<ServerActiveTrip | null> | null = null;
let completingTripId: string | null = null;
let ratingRecoveryRequest: Promise<void> | null = null;

function logTripLifecycle(event: string, details: Record<string, unknown> = {}) {
	if (!import.meta.env.DEV) return;
	console.info('[trip-lifecycle]', JSON.stringify({ time: (new Date).toISOString(), event, ...details }));
}

function tripSummary(trip: ActiveTrip | null) {
	return trip ? {
		code: trip.code || null,
		bikePlate: trip.bikePlate,
		confirmed: trip.confirmed,
		lastUpdate: trip.lastUpdate?.toISOString() ?? null,
	} : null;
}

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
	if (!trip.code || completingTripId === trip.code) {
		logTripLifecycle('completion-skipped', { trip: tripSummary(trip), completingTripId });
		return;
	}
	logTripLifecycle('completion-started', { trip: tripSummary(trip) });
	completingTripId = trip.code;
	currentTrip.set(null);
	if (trip.bikePlate) {
		tripRating.set({ currentRating: { code: trip.code, bikePlate: trip.bikePlate, startDate: trip.startDate, endDate: new Date } });
	}
	await refreshAccountInfo().catch(error => console.error('Could not refresh account after trip completion', error));
	completingTripId = null;
	logTripLifecycle('completion-finished', { tripCode: trip.code });
}

/** Recover a rating prompt after the app restarts around trip completion. */
export async function recoverRecentTripRating(): Promise<void> {
	if (get(currentTrip) || get(tripRating).currentRating) return;
	if (ratingRecoveryRequest) return ratingRecoveryRequest;
	ratingRecoveryRequest = (async () => {
		const [latest] = await getTripHistory(1, 1);
		if (!latest?.id || !latest.bikeId || !Number.isFinite(latest.endedAt.getTime())) return;
		const ageMs = Date.now() - latest.endedAt.getTime();
		if (ageMs < 0 || ageMs > RECENT_RATING_WINDOW_MS) return;
		const lastRatedTripId = (await Preferences.get({ key: LAST_RATED_TRIP_KEY })).value;
		if (lastRatedTripId === latest.id) return;
		logTripLifecycle('rating-prompt-recovered', { tripCode: latest.id, bikePlate: latest.bikeId, ageMs });
		tripRating.set({
			currentRating: {
				code: latest.id,
				bikePlate: latest.bikeId,
				startDate: latest.startedAt,
				endDate: latest.endedAt,
			},
		});
	})().finally(() => ratingRecoveryRequest = null);
	return ratingRecoveryRequest;
}

export async function markTripRated(tripCode: string): Promise<void> {
	await Preferences.set({ key: LAST_RATED_TRIP_KEY, value: tripCode });
}

/** Drop a trip that VAIMOO never confirmed, e.g. after the bike reported a start timeout. */
export function abortPendingTrip(source = 'unspecified') {
	const trip = get(currentTrip);
	if (!trip || trip.confirmed || trip.code === DEBUG_TRIP_CODE) return false;
	logTripLifecycle('pending-trip-aborted', { source, trip: tripSummary(trip) });
	currentTrip.set(null);
	return true;
}

/**
 * Reconcile local state with VAIMOO's authoritative active-trip endpoint.
 * Failures are logged and resolve to null: most callers fire and forget, and the next poll retries anyway.
 */
export async function refreshTripStatus(source = 'unspecified'): Promise<ServerActiveTrip | null> {
	if (!get(token)) return null;
	if (statusRequest) {
		logTripLifecycle('refresh-coalesced', { source, localTrip: tripSummary(get(currentTrip)) });
		return statusRequest;
	}
	logTripLifecycle('refresh-started', { source, localTrip: tripSummary(get(currentTrip)) });
	statusRequest = getActiveTrip();
	try {
		const serverTrip = await statusRequest;
		const localTrip = get(currentTrip);
		logTripLifecycle('refresh-result', {
			source,
			localTrip: tripSummary(localTrip),
			serverTrip: serverTrip ? {
				id: serverTrip.id,
				bikeId: serverTrip.bikeId,
				bikeState: serverTrip.bikeState,
				startedAt: serverTrip.startedAt.toISOString(),
			} : null,
		});
		if (serverTrip) {
			logTripLifecycle('trip-kept-active', { source, bikeState: serverTrip.bikeState });
			currentTrip.set(localTripFromServer(serverTrip, localTrip));
			watchPosition();
		} else if (localTrip?.confirmed) {
			logTripLifecycle('trip-completion-detected', { source, trip: tripSummary(localTrip) });
			void completeTrip(localTrip);
		} else if (localTrip && Date.now() - localTrip.startDate.getTime() >= START_CONFIRM_TIMEOUT_MS) {
			logTripLifecycle('start-confirmation-timed-out', { source, trip: tripSummary(localTrip) });
			currentTrip.set(null);
			errorMessages.add(get(t)('bike_unlock_error'));
		}
		return serverTrip;
	} catch (error) {
		logTripLifecycle('refresh-failed', {
			source,
			message: error instanceof Error ? error.message : String(error),
		});
		console.error(`VAIMOO trip status refresh failed (${source})`, error);
		return null;
	} finally {
		statusRequest = null;
		logTripLifecycle('refresh-finished', { source });
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
			// Include VAIMOO's numeric code so the real codes can be learned from the reports and mapped above.
			reportErrorEvent('gira_api_error', error.code != null ? `${error.code}: ${item.message}` : item.message);
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

		const mockUnlock = import.meta.env.DEV && get(appSettings).mockUnlock;
		// Ask VAIMOO to unlock before showing the trip view, so the unlock slider can finish its animation.
		if (!mockUnlock) await quickStartBike(communicationId);

		const position = get(currentPos);
		const now = new Date;
		tripRating.set({ currentRating: null });
		currentTrip.set({
			code: mockUnlock ? DEBUG_TRIP_CODE : '',
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
			confirmed: mockUnlock,
			pathTaken: position ? [{ lng: position.coords.longitude, lat: position.coords.latitude, time: now }] : [],
			lastUpdate: now,
		});
		if (mockUnlock) return true;

		reportTripStartEvent(communicationId, station.serialNumber);
		watchPosition();
		void refreshTripStatus('quick-start-response');
		return true;
	} catch (error) {
		console.error(error);
		if (error instanceof VaimooNetworkError) {
			// The unlock is not retried, so the connection may have dropped after VAIMOO started the trip.
			const serverTrip = await refreshTripStatus('quick-start-network-error');
			if (serverTrip) {
				logTripLifecycle('trip-started-despite-network-error', { serverTripId: serverTrip.id });
				reportTripStartEvent(communicationId, station.serialNumber);
				return true;
			}
		}
		currentTrip.set(null);
		addKnownApiError(error);
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
	if (currentToken.expiration - Date.now() < 30_000) void refreshToken().then(() => refreshTripStatus('background-location-after-token-refresh'));
	else void refreshTripStatus('background-location');
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