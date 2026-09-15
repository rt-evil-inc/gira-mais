import { get } from 'svelte/store';
import { token } from '$lib/account';
import { stations } from '$lib/map.svelte';
import { currentTrip, DEBUG_TRIP_CODE, refreshTripStatus } from '$lib/trip';
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

function clearTripTimer() {
	if (tripTimer) clearTimeout(tripTimer);
	tripTimer = null;
}

function scheduleTripCheck(confirmed: boolean) {
	clearTripTimer();
	const timer = setTimeout(async () => {
		if (!get(token)) return;
		try {
			await refreshTripStatus();
		} catch (error) {
			console.error('VAIMOO trip status refresh failed', error);
		} finally {
			const trip = get(currentTrip);
			if (tripTimer === timer && trip && trip.code !== DEBUG_TRIP_CODE) scheduleTripCheck(trip.confirmed);
		}
	}, confirmed && !tripEndSignalled ? ACTIVE_TRIP_INTERVAL_MS : PENDING_TRIP_INTERVAL_MS);
	tripTimer = timer;
}

function followActiveBike(bikeId: string | null) {
	if (watchedBikeId === bikeId) return;
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
			const nextErrorCode = bike?.TripErrorCode || null;
			// Same rule as the official app: LOCKED with no trip id means the trip is over.
			const tripEnded = bike != null && nextState === 'LOCKED' && bike.TripId == null;
			const trip = get(currentTrip);
			if (tripEnded && trip?.confirmed && !tripEndSignalled) {
				console.debug('Firestore reports the bike locked with no trip, confirming with VAIMOO');
				tripEndSignalled = true;
				scheduleTripCheck(true);
				void refreshTripStatus();
			} else if (previousState !== undefined && previousState !== nextState) {
				void refreshTripStatus();
			}
			// The official app surfaces these codes straight from the bike document (100 = start timeout, 4xx = end failures).
			if (previousErrorCode !== undefined && previousErrorCode !== nextErrorCode && nextErrorCode != null) {
				console.warn('VAIMOO bike reported trip error code', nextErrorCode);
				if (nextErrorCode === FIRESTORE_START_TRIP_TIMEOUT) errorMessages.add(get(t)('bike_unlock_error'));
				void refreshTripStatus();
			}
			previousState = nextState;
			previousErrorCode = nextErrorCode;
		},
		error => console.error('VAIMOO active-bike listener failed', error),
	);
}

export function startBackendSync() {
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
				polledTripCode = trip.code;
				polledTripConfirmed = trip.confirmed;
				scheduleTripCheck(trip.confirmed);
			}
		});
	}
	void refreshTripStatus().catch(error => console.error('Initial VAIMOO trip status refresh failed', error));
}

export function stopBackendSync() {
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