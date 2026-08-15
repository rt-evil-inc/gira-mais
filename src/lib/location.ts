import { registerPlugin } from '@capacitor/core';
import { get, writable } from 'svelte/store';
import { type Position, Geolocation } from '@capacitor/geolocation';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { checkTripActive, currentTrip } from '$lib/trip';
import { compassHeading } from '$lib/compass';
import { bearingBetweenCoords, distanceBetweenCoords } from '$lib/utils';
import { MIN_TRAVEL_DISTANCE_m } from '$lib/constants';
import { appSettings } from './settings';

export const currentPos = writable<Position|null>(null);
export const bearingNorth = writable<boolean>(false);
export const bearing = writable<number>(0);
/** Last known traveling direction in degrees clockwise from north. */
export const currentHeading = writable<number|null>(null);

// The GPS course is meaningless while standing still (it drifts or freezes at
// arbitrary values), so it's only trusted above a minimum speed; positions too
// close together are likewise just accuracy noise, so the fallback bearing is
// only computed once the anchor point is far enough behind
const HEADING_MIN_SPEED_mps = 0.5;
const HEADING_MIN_DISTANCE_m = 5;
let headingAnchor: {lat: number, lng: number}|null = null;
let lastCourseTime = 0;

currentPos.subscribe(pos => {
	if (!pos) return;
	const { latitude, longitude, heading, speed } = pos.coords;
	let course = typeof heading === 'number' && Number.isFinite(heading) && heading >= 0 &&
		(speed == null || speed >= HEADING_MIN_SPEED_mps) ? heading % 360 : null;
	const moved = headingAnchor ? distanceBetweenCoords(headingAnchor.lat, headingAnchor.lng, latitude, longitude) * 1000 : 0;
	if (headingAnchor && moved >= HEADING_MIN_DISTANCE_m && course === null) {
		course = bearingBetweenCoords(headingAnchor.lat, headingAnchor.lng, latitude, longitude);
	}
	if (!headingAnchor || moved >= HEADING_MIN_DISTANCE_m) headingAnchor = { lat: latitude, lng: longitude };
	if (course !== null) {
		currentHeading.set(course);
		lastCourseTime = Date.now();
	}
});

// The GPS course wins while it's fresh (i.e. while moving); the compass takes
// over when standing still, where the course is unavailable or stale
const COMPASS_TAKEOVER_ms = 3000;

compassHeading.subscribe(heading => {
	if (heading === null) return;
	if (Date.now() - lastCourseTime < COMPASS_TAKEOVER_ms) return;
	currentHeading.set(heading);
});

let simulatedLocationActive = false;

/** Publish a development-only position and prevent GPS callbacks replacing it. */
export function setDebugPosition(position: Position) {
	if (!import.meta.env.DEV) return;
	simulatedLocationActive = true;
	currentPos.set(position);
}

currentPos.subscribe(async v => {
	if (!v) return;
	currentTrip.update(trip => {
		if (!trip) return trip;
		trip.pathTaken.push({ lat: v.coords.latitude, lng: v.coords.longitude, time: new Date(v.timestamp) });

		if (trip.pathTaken.length > 1) {
			const lastLocation = trip.pathTaken[trip.pathTaken.length - 2];
			const traveledDistance = distanceBetweenCoords(lastLocation.lat, lastLocation.lng, v.coords.latitude, v.coords.longitude);
			trip.traveledDistanceKm += traveledDistance;
			const speed = (trip.traveledDistanceKm / ((v.timestamp - trip.startDate.getTime()) / 1000)) * 3600;
			if (trip.traveledDistanceKm >= MIN_TRAVEL_DISTANCE_m / 1000) trip.speed = speed;
		}
		return trip;
	});
});

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

let watchId: string|null = null;
let backgroundWatchId: string|null = null;

export async function watchPosition() {
	if (simulatedLocationActive) return;
	const permission = (await Geolocation.checkPermissions()).location;
	if (permission !== 'granted') return;

	if (get(currentTrip) !== null && get(appSettings).backgroundLocation) {
		if (backgroundWatchId !== null) return;
		if (watchId !== null) {
			await Geolocation.clearWatch({ id: watchId });
			watchId = null;
		}

		backgroundWatchId = await BackgroundGeolocation.addWatcher({
			backgroundTitle: 'Active Trip',
			backgroundMessage: 'Tracking location in background',
		}, position => {
			if (position && !simulatedLocationActive) {
				currentPos.set({ coords: { ...position, heading: position.bearing }, timestamp: position.time ?? Date.now() });
			}
			checkTripActive();
		});
	} else {
		if (watchId !== null) return;
		if (backgroundWatchId !== null) {
			await BackgroundGeolocation.removeWatcher({ id: backgroundWatchId });
			backgroundWatchId = null;
		}

		watchId = await Geolocation.watchPosition({
			enableHighAccuracy: true,
			timeout: 2000,
			minimumUpdateInterval: 0,
		}, position => {
			if (position && !simulatedLocationActive) {
				currentPos.set(position);
			}
		});
	}
}