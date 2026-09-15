import { get } from 'svelte/store';
import { token } from '$lib/account';
import { stations } from '$lib/map.svelte';
import { currentTrip, DEBUG_TRIP_CODE, recoverRecentTripRating, refreshTripStatus } from '$lib/trip';
import { subscribeFirestoreBike } from '$lib/vaimoo-api/firestore';
import { subscribeStations } from './api';
import { errorMessages } from '$lib/ui.svelte';
import { t } from '$lib/translations';

const PENDING_TRIP_INTERVAL_MS = 3_000;
const FIRESTORE_START_TRIP_TIMEOUT = 100;
const ACTIVE_TRIP_INTERVAL_MS = 15_000;
let tripTimer: ReturnType<typeof setTimeout> | null = null;
let stopStationListener: (() => void) | null = null;
let stopBikeListener: (() => void) | null = null;
let stopTripStoreListener: (() => void) | null = null;
let watchedBikeId: string | null = null;
// Set when the bike document says the trip is over; keeps polling fast until /user/trip agrees.
let tripEndSignalled = false;

function logBackendSync(event: string, details: Record<string, unknown> = {}) {
	if (!import.meta.env.DEV) return;
	console.info('[backend-sync]', JSON.stringify({ time: new Date().toISOString(), event, ...details }));
}

function clearTripTimer() {
	if (tripTimer) {
		clearTimeout(tripTimer);
		logBackendSync('poll-cancelled');
	}
	tripTimer = null;
}

function scheduleTripCheck(confirmed: boolean) {
	clearTripTimer();
	const delayMs = confirmed && !tripEndSignalled ? ACTIVE_TRIP_INTERVAL_MS : PENDING_TRIP_INTERVAL_MS;
	logBackendSync('poll-scheduled', { confirmed, tripEndSignalled, delayMs });
	const timer = setTimeout(async () => {
		logBackendSync('poll-fired', { confirmed, hasToken: Boolean(get(token)) });
		if (!get(token)) return;
		try {
			await refreshTripStatus('scheduled-poll');
		} catch (error) {
			console.error('VAIMOO trip status refresh failed', error);
		} finally {
			const trip = get(currentTrip);
			if (tripTimer === timer && trip && trip.code !== DEBUG_TRIP_CODE) scheduleTripCheck(trip.confirmed);
		}
	}, delayMs);
	tripTimer = timer;
}

function followActiveBike(bikeId: string | null) {
	if (watchedBikeId === bikeId) return;
	logBackendSync('bike-listener-changing', { previousBikeId: watchedBikeId, bikeId });
	stopBikeListener?.();
	stopBikeListener = null;
	watchedBikeId = bikeId;
	if (!bikeId) return;

	let previousState: string | null | undefined;
	let previousErrorCode: number | null | undefined;
	stopBikeListener = subscribeFirestoreBike(
		bikeId,
		bike => {
			const nextState = bike?.TripVehicleState ?? null;
			const nextErrorCode = bike?.TripErrorCode ?? null;
			// Same rule as the official app: LOCKED with no trip id means the trip is over.
			const tripEnded = bike != null && nextState === 'LOCKED' && bike.TripId == null;
			logBackendSync('bike-snapshot', {
				bikeId,
				found: Boolean(bike),
				previousState,
				nextState,
				previousErrorCode,
				nextErrorCode,
				tripId: bike?.TripId ?? null,
				available: bike?.IsAvaliable ?? null,
				tripEnded,
				tripEndSignalled,
			});
			const trip = get(currentTrip);
			if (tripEnded && trip?.confirmed && !tripEndSignalled) {
				console.debug('Firestore reports the bike locked with no trip, confirming with VAIMOO');
				logBackendSync('trip-end-signalled', { bikeId, nextState, tripId: bike.TripId ?? null });
				tripEndSignalled = true;
				scheduleTripCheck(true);
				void refreshTripStatus('firestore-locked-no-trip');
			} else if (previousState !== undefined && previousState !== nextState) {
				void refreshTripStatus(`firestore-state:${previousState ?? 'null'}->${nextState ?? 'null'}`);
			}
			// The official app surfaces these codes straight from the bike document (100 = start timeout, 4xx = end failures).
			if (previousErrorCode !== undefined && previousErrorCode !== nextErrorCode && nextErrorCode != null) {
				console.warn('VAIMOO bike reported trip error code', nextErrorCode);
				if (nextErrorCode === FIRESTORE_START_TRIP_TIMEOUT) errorMessages.add(get(t)('bike_unlock_error'));
				void refreshTripStatus(`firestore-error:${nextErrorCode}`);
			}
			previousState = nextState;
			previousErrorCode = nextErrorCode;
		},
		error => console.error('VAIMOO active-bike listener failed', error),
	);
}

export function startBackendSync() {
	const firstStart = !stopTripStoreListener;
	logBackendSync('sync-started', {
		hasStationListener: Boolean(stopStationListener),
		hasTripStoreListener: Boolean(stopTripStoreListener),
	});
	if (!stopStationListener) {
		stopStationListener = subscribeStations(
			value => stations.value = value,
			error => console.error('VAIMOO station listener failed', error),
		);
	}
	if (!stopTripStoreListener) {
		let polledTripCode: string | null = null;
		let polledTripConfirmed: boolean | null = null;
		stopTripStoreListener = currentTrip.subscribe(trip => {
			if (!trip || trip.code === DEBUG_TRIP_CODE) {
				logBackendSync('trip-store-state', {
					code: trip?.code || null,
					bikePlate: trip?.bikePlate ?? null,
					confirmed: trip?.confirmed ?? null,
				});
				polledTripCode = null;
				polledTripConfirmed = null;
				tripEndSignalled = false;
				clearTripTimer();
				followActiveBike(null);
				return;
			}
			followActiveBike(trip.bikePlate);
			// GPS and routing updates must not postpone the next backend check.
			if (trip.code !== polledTripCode || trip.confirmed !== polledTripConfirmed) {
				logBackendSync('trip-store-state', {
					code: trip.code || null,
					bikePlate: trip.bikePlate,
					confirmed: trip.confirmed,
				});
				polledTripCode = trip.code;
				polledTripConfirmed = trip.confirmed;
				scheduleTripCheck(trip.confirmed);
			}
		});
	}
	void (async () => {
		try {
			const activeTrip = await refreshTripStatus('backend-sync-start');
			if (firstStart && !activeTrip) await recoverRecentTripRating();
		} catch (error) {
			console.error('Initial VAIMOO trip status refresh failed', error);
		}
	})();
}

export function stopBackendSync() {
	logBackendSync('sync-stopped');
	clearTripTimer();
	tripEndSignalled = false;
	stopStationListener?.();
	stopBikeListener?.();
	stopTripStoreListener?.();
	stopStationListener = null;
	stopBikeListener = null;
	stopTripStoreListener = null;
	watchedBikeId = null;
}
