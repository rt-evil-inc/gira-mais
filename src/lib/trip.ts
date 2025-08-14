import { get, writable } from 'svelte/store';
import type { ThrownError } from '$lib/gira-api/api-types';
import { accountInfo } from '$lib/account';
import { errorMessages } from '$lib/ui';
import { appSettings } from '$lib/settings';
import { currentPos, watchPosition } from '$lib/location';
import { distanceBetweenCoords } from '$lib/utils';
import { LOCK_DISTANCE_m } from '$lib/constants';
import { getTripHistory, getUnratedTrips, knownErrors, reserveBike, startTrip, tripPayWithPoints } from '$lib/gira-api/api';
import type { StationInfo } from './map';
import { ingestLastUnratedTrip, updateActiveTripInfo } from './injest-api-data';
import { reportErrorEvent, reportTripStartEvent } from '$lib/gira-mais-api/gira-mais-api';
import { refreshToken, token, type JWT } from './account';
import { t, type Translations } from './translations';

export type ActiveTrip = {
	code: string,
	bikePlate: string|null,
	startPos: {lat: number, lng: number}|null,
	destination: {lat: number, lng: number}|null,
	traveledDistanceKm: number,
	distanceLeft: number|null,
	speed: number,
	startDate: Date,
	predictedEndDate: Date|null,
	arrivalTime: Date|null,
	finished: boolean,
	confirmed: boolean,
	pathTaken : {lat: number, lng: number, time:Date}[],
	lastUpdate: Date | null,
}
export type TripRating = {
	currentRating:{
		code:string,
		bikePlate:string,
		startDate:Date,
		endDate:Date,
		tripPoints:number,
	}|null,
}

export const currentTrip = writable<ActiveTrip|null>(null);
export const tripRating = writable<TripRating>({ currentRating: null });

let updating = false;

async function checkTripStarted(serial: string) {
	if (get(currentTrip) === null) return;
	if ((await reserveBike(serial)).reserveBike) {
		currentTrip.set(null);
	} else if (!get(currentTrip)?.confirmed) {
		updateActiveTripInfo();
	}
}

export async function tryStartTrip(id: string, serial: string, station: StationInfo) {
	if (serial == null) return;
	try {
		if (get(appSettings).distanceLock) {
			const pos = get(currentPos);
			if (pos == null) {
				errorMessages.add(get(t)('location_determination_error'));
				return false;
			} else {
				if (distanceBetweenCoords(pos.coords.latitude, pos.coords.longitude, station.latitude, station.longitude) > LOCK_DISTANCE_m / 1000) {
					errorMessages.add(get(t)('not_close_enough_error'));
					return false;
				}
			}
		}
		const reservedBike = (await reserveBike(serial)).reserveBike;
		if (reservedBike) {
			const success = (await startTrip()).startTrip;
			if (success) {
				reportTripStartEvent(serial, station.serialNumber);
				for (let i = 15000; i <= 30000; i += 5000) {
					setTimeout(() => checkTripStarted(serial), i);
				}
				const pos = get(currentPos);
				currentTrip.set({
					code: '',
					arrivalTime: null,
					bikePlate: id,
					traveledDistanceKm: 0,
					destination: null,
					distanceLeft: null,
					speed: 0,
					startDate: new Date,
					startPos: pos ? {
						lng: pos.coords.longitude,
						lat: pos.coords.latitude,
					} : null,
					predictedEndDate: null,
					finished: false,
					confirmed: false,
					pathTaken: pos ? [{
						lng: pos.coords.longitude,
						lat: pos.coords.latitude,
						time: new Date,
					}] : [],
					lastUpdate: new Date,
				});
				watchPosition();
				return true;
			} else {
				errorMessages.add(get(t)('bike_unlock_error'));
				reportErrorEvent('bike_unlock_error');
				return false;
			}
		}
	} catch (_e) {
		const e = _e as ThrownError;
		let addedError = false;
		if (e && e.errors) {
			for (const error of e.errors) {
				const knownError = knownErrors[error.message as keyof typeof knownErrors];
				if ('message' in knownError) {
					errorMessages.add(get(t)(knownError.message as keyof Translations));
					addedError = true;
				}
				reportErrorEvent('gira_api_error', error.message);
			}
			if (!addedError) {
				errorMessages.add(get(t)('bike_unlock_error'));
			}
		}
		console.error(e);
		return false;
	}
}

/** Force trip info update if more than 30 seconds have passed since last update.
	* Meant to be called while the app is in background. */
export function checkTripActive() {
	if (updating) return;

	const lastUpdate = get(currentTrip)?.lastUpdate;
	if (!lastUpdate || Date.now() - lastUpdate.getTime() < 1000 * 30) return;

	const t = get(token);
	if (!t) return;
	const jwt:JWT = JSON.parse(window.atob(t.accessToken.split('.')[1]));

	// Refresh token if it expires in less than 30 seconds and update trip info
	if (jwt.exp * 1000 - Date.now() < 30 * 1000) {
		updating = true;
		refreshToken().then(updateActiveTripInfo).finally(() => updating = false);
	} else {
		updateActiveTripInfo();
	}
}

/** Gracefully end the trip.
  * Meant to be called when an abrupt trip end was detected. */
export async function endTrip() {
	const trip = get(currentTrip);

	// Attempt to pay with points just in case
	if (trip) tripPayWithPoints(trip.code);

	currentTrip.set(null);

	// Check if there is a rating to be done
	ingestLastUnratedTrip({
		unratedTrips: (await getUnratedTrips(0, 1)).unratedTrips,
		tripHistory: (await getTripHistory(0, 1)).tripHistory,
	});
}