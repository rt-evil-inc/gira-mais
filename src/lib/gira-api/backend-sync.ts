import { get } from 'svelte/store';
import { token } from '$lib/account';
import { stations } from '$lib/map.svelte';
import { currentTrip, DEBUG_TRIP_CODE, refreshTripStatus } from '$lib/trip';
import { subscribeFirestoreBike } from '$lib/vaimoo-api/firestore';
import { subscribeStations } from './api';

const PENDING_TRIP_INTERVAL_MS = 3_000;
const ACTIVE_TRIP_INTERVAL_MS = 15_000;
let tripTimer: ReturnType<typeof setTimeout> | null = null;
let stopStationListener: (() => void) | null = null;
let stopBikeListener: (() => void) | null = null;
let stopTripStoreListener: (() => void) | null = null;
let watchedBikeId: string | null = null;

function clearTripTimer() {
	if (tripTimer) clearTimeout(tripTimer);
	tripTimer = null;
}

function scheduleTripCheck(confirmed: boolean) {
	clearTripTimer();
	tripTimer = setTimeout(async () => {
		if (!get(token)) return;
		try {
			await refreshTripStatus();
		} catch (error) {
			console.error('VAIMOO trip status refresh failed', error);
		} finally {
			const trip = get(currentTrip);
			if (trip && trip.code !== DEBUG_TRIP_CODE) scheduleTripCheck(trip.confirmed);
		}
	}, confirmed ? ACTIVE_TRIP_INTERVAL_MS : PENDING_TRIP_INTERVAL_MS);
}

function followActiveBike(bikeId: string | null) {
	if (watchedBikeId === bikeId) return;
	stopBikeListener?.();
	stopBikeListener = null;
	watchedBikeId = bikeId;
	if (!bikeId) return;

	let previousState: string | null | undefined;
	stopBikeListener = subscribeFirestoreBike(
		bikeId,
		bike => {
			const nextState = bike?.TripVehicleState ?? null;
			if (previousState !== undefined && previousState !== nextState) void refreshTripStatus();
			previousState = nextState;
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
		stopTripStoreListener = currentTrip.subscribe(trip => {
			if (!trip || trip.code === DEBUG_TRIP_CODE) {
				clearTripTimer();
				followActiveBike(null);
				return;
			}
			followActiveBike(trip.bikePlate);
			scheduleTripCheck(trip.confirmed);
		});
	}
	void refreshTripStatus().catch(error => console.error('Initial VAIMOO trip status refresh failed', error));
}

export function stopBackendSync() {
	clearTripTimer();
	stopStationListener?.();
	stopBikeListener?.();
	stopTripStoreListener?.();
	stopStationListener = null;
	stopBikeListener = null;
	stopTripStoreListener = null;
	watchedBikeId = null;
}
