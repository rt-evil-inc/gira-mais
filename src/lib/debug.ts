import type { Position } from '@capacitor/geolocation';
import { get } from 'svelte/store';
import { currentPos, setDebugPosition } from '$lib/location';
import { following } from '$lib/map.svelte';
import { DEBUG_START_POSITION, toggleDebugTrip } from '$lib/trip';

export const DEBUG_WALK_SPEED_MPS = 120;
const EARTH_RADIUS_M = 6_371_000;
const MOVEMENT_KEYS = new Set(['w', 'a', 's', 'd']);

export function moveCoordinates(lat: number, lng: number, east: number, north: number, distanceM: number) {
	const length = Math.hypot(east, north);
	if (length === 0) return { lat, lng };
	const northM = north / length * distanceM;
	const eastM = east / length * distanceM;
	const nextLat = lat + northM / EARTH_RADIUS_M * 180 / Math.PI;
	const nextLng = lng + eastM / (EARTH_RADIUS_M * Math.cos(lat * Math.PI / 180)) * 180 / Math.PI;
	return { lat: nextLat, lng: nextLng };
}

function isEditableTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false;
	return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName);
}

function debugPosition(lat: number, lng: number, heading: number, timestamp: number): Position {
	return {
		coords: {
			latitude: lat,
			longitude: lng,
			accuracy: 1,
			altitude: null,
			altitudeAccuracy: null,
			heading,
			speed: DEBUG_WALK_SPEED_MPS,
		},
		timestamp,
	};
}

export function startDebugControls() {
	if (!import.meta.env.DEV || typeof window === 'undefined') return () => undefined;
	const held = new Set<string>;
	let frame: number | null = null;
	let lastTime: number | null = null;

	const step = (time: number) => {
		frame = null;
		const east = Number(held.has('d')) - Number(held.has('a'));
		const north = Number(held.has('w')) - Number(held.has('s'));
		if (east === 0 && north === 0) {
			lastTime = null;
			return;
		}
		const position = get(currentPos);
		const lat = position?.coords.latitude ?? DEBUG_START_POSITION.lat;
		const lng = position?.coords.longitude ?? DEBUG_START_POSITION.lng;
		const elapsedSeconds = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
		lastTime = time;
		const moved = moveCoordinates(lat, lng, east, north, DEBUG_WALK_SPEED_MPS * elapsedSeconds);
		const heading = (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
		setDebugPosition(debugPosition(moved.lat, moved.lng, heading, Date.now()));
		following.set(true);
		frame = requestAnimationFrame(step);
	};

	const startFrame = () => {
		if (frame === null) frame = requestAnimationFrame(step);
	};
	const clearMovement = () => {
		held.clear();
		lastTime = null;
		if (frame !== null) cancelAnimationFrame(frame);
		frame = null;
	};
	const keydown = (event: KeyboardEvent) => {
		if (event.ctrlKey || event.altKey || event.metaKey || isEditableTarget(event.target)) return;
		const key = event.key.toLowerCase();
		if (MOVEMENT_KEYS.has(key)) {
			held.add(key);
			startFrame();
		} else if (key === 't' && !event.repeat) {
			toggleDebugTrip();
		}
	};
	const keyup = (event: KeyboardEvent) => held.delete(event.key.toLowerCase());
	const visibilitychange = () => {
		if (document.hidden) clearMovement();
	};

	window.addEventListener('keydown', keydown);
	window.addEventListener('keyup', keyup);
	window.addEventListener('blur', clearMovement);
	document.addEventListener('visibilitychange', visibilitychange);
	return () => {
		clearMovement();
		window.removeEventListener('keydown', keydown);
		window.removeEventListener('keyup', keyup);
		window.removeEventListener('blur', clearMovement);
		document.removeEventListener('visibilitychange', visibilitychange);
	};
}