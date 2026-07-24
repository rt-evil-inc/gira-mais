import type { Position } from '@capacitor/geolocation';
import { get } from 'svelte/store';
import { currentPos, setDebugPosition } from '$lib/location';
import { following } from '$lib/map.svelte';
import { appSettings } from '$lib/settings';
import { shortestAngleDelta } from '$lib/marker-animation';
import { currentTrip, DEBUG_START_POSITION, toggleDebugTrip } from '$lib/trip';

/** Riding a Gira, ~18 km/h. */
export const DEBUG_BIKE_SPEED_MPS = 5;
/** Walking to the station, ~5 km/h. */
export const DEBUG_WALK_SPEED_MPS = 1.4;
/** Holding shift covers ground quickly when the destination is far away. */
const FAST_TRAVEL_FACTOR = 6;

const EARTH_RADIUS_M = 6_371_000;
const MOVEMENT_KEYS = new Set(['w', 'a', 's', 'd']);

// A receiver reports roughly once a second, never quite on time, and loses the
// odd fix under tree cover or between buildings
const FIX_INTERVAL_ms = 1000;
const FIX_JITTER_ms = 200;
const FIX_DROP_CHANCE = 0.06;

// Horizontal error wanders instead of being redrawn independently per fix, so
// it is modelled as a slowly decaying random walk — that wander is what makes a
// parked marker creep around. Multipath off a building throws a single fix much
// further out
const NOISE_SIGMA_m = 4;
const NOISE_HALFLIFE_ms = 8000;
const GLITCH_CHANCE = 0.03;
const GLITCH_SIGMA_m = 20;

// Neither the rider nor the reported course changes instantly
const SPEED_HALFLIFE_ms = 800;
const TURN_RATE_dps = 90;
const SPEED_NOISE_mps = 0.3;
const HEADING_NOISE_deg = 4;
/** Below this a receiver stops reporting a usable course. */
const COURSE_MIN_SPEED_mps = 0.8;

export function moveCoordinates(lat: number, lng: number, east: number, north: number, distanceM: number) {
	const length = Math.hypot(east, north);
	if (length === 0) return { lat, lng };
	const northM = north / length * distanceM;
	const eastM = east / length * distanceM;
	const nextLat = lat + northM / EARTH_RADIUS_M * 180 / Math.PI;
	const nextLng = lng + eastM / (EARTH_RADIUS_M * Math.cos(lat * Math.PI / 180)) * 180 / Math.PI;
	return { lat: nextLat, lng: nextLng };
}

/** Standard normal sample (Box-Muller). */
function gaussian() {
	return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

/** Fraction of a value left after `elapsed`, decaying by half every `halflife`. */
function decayed(halflife: number, elapsed: number) {
	return Math.pow(0.5, elapsed / halflife);
}

function isEditableTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false;
	return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName);
}

function debugPosition(lat: number, lng: number, heading: number|null, speed: number, accuracy: number): Position {
	return {
		coords: {
			latitude: lat,
			longitude: lng,
			accuracy,
			altitude: null,
			altitudeAccuracy: null,
			heading,
			speed,
		},
		timestamp: Date.now(),
	};
}

export function startDebugControls() {
	if (!import.meta.env.DEV || typeof window === 'undefined') return () => undefined;
	const held = new Set<string>;
	let fastTravel = false;
	let frame: number | null = null;
	let lastTime: number | null = null;

	// The true position the rider is at, kept apart from what gets published:
	// feeding the noisy fixes back in would let the error random-walk away
	let truth: { lat: number, lng: number } = { ...DEBUG_START_POSITION };
	let speed = 0;
	let heading = 0;
	let noiseEast = 0;
	let noiseNorth = 0;
	let fixTimeout: ReturnType<typeof setTimeout> | null = null;
	let lastFixTime = 0;

	const cruiseSpeed = () => (get(currentTrip) !== null ? DEBUG_BIKE_SPEED_MPS : DEBUG_WALK_SPEED_MPS) *
		(fastTravel ? FAST_TRAVEL_FACTOR : 1);

	const publishFix = () => {
		const now = performance.now();
		const elapsed = lastFixTime === 0 ? FIX_INTERVAL_ms : now - lastFixTime;
		lastFixTime = now;

		const decay = decayed(NOISE_HALFLIFE_ms, elapsed);
		// Scaled so the walk settles at a standard deviation of NOISE_SIGMA_m
		const spread = NOISE_SIGMA_m * Math.sqrt(1 - decay * decay);
		noiseEast = noiseEast * decay + gaussian() * spread;
		noiseNorth = noiseNorth * decay + gaussian() * spread;

		const glitch = Math.random() < GLITCH_CHANCE;
		const east = noiseEast + (glitch ? gaussian() * GLITCH_SIGMA_m : 0);
		const north = noiseNorth + (glitch ? gaussian() * GLITCH_SIGMA_m : 0);
		const offset = moveCoordinates(truth.lat, truth.lng, east, north, Math.hypot(east, north));

		const reportedSpeed = Math.max(0, speed + gaussian() * SPEED_NOISE_mps);
		const reportedHeading = speed >= COURSE_MIN_SPEED_mps ?
			(heading + gaussian() * HEADING_NOISE_deg + 360) % 360 :
			null;
		const accuracy = Math.min(40, 4 + Math.hypot(east, north) * 0.8 + Math.abs(gaussian()) * 2);
		setDebugPosition(debugPosition(offset.lat, offset.lng, reportedHeading, reportedSpeed, accuracy));
	};

	const scheduleFix = () => {
		fixTimeout = setTimeout(() => {
			// A dropped fix leaves a gap of roughly two intervals, like losing the
			// sky for a moment
			if (Math.random() >= FIX_DROP_CHANCE) publishFix();
			scheduleFix();
		}, FIX_INTERVAL_ms + (Math.random() * 2 - 1) * FIX_JITTER_ms);
	};

	const startFixes = () => {
		if (fixTimeout !== null) return;
		const position = get(currentPos);
		truth = position ?
			{ lat: position.coords.latitude, lng: position.coords.longitude } :
			{ ...DEBUG_START_POSITION };
		scheduleFix();
	};

	const step = (time: number) => {
		frame = null;
		const east = Number(held.has('d')) - Number(held.has('a'));
		const north = Number(held.has('w')) - Number(held.has('s'));
		const elapsedSeconds = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
		lastTime = time;

		// Ease onto and off the pedals, and lean into turns rather than pivoting
		const target = east === 0 && north === 0 ? 0 : cruiseSpeed();
		speed += (target - speed) * (1 - decayed(SPEED_HALFLIFE_ms, elapsedSeconds * 1000));
		if (east !== 0 || north !== 0) {
			const desired = (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
			const turn = shortestAngleDelta(heading, desired);
			heading = (heading + Math.sign(turn) * Math.min(Math.abs(turn), TURN_RATE_dps * elapsedSeconds) + 360) % 360;
		}
		truth = moveCoordinates(truth.lat, truth.lng, Math.sin(heading * Math.PI / 180), Math.cos(heading * Math.PI / 180), speed * elapsedSeconds);

		// Coasting to a stop still moves, so keep stepping until it is negligible
		if (target === 0 && speed < 0.05) {
			speed = 0;
			lastTime = null;
			return;
		}
		frame = requestAnimationFrame(step);
	};

	const startFrame = () => {
		if (frame === null) frame = requestAnimationFrame(step);
	};
	const clearMovement = () => {
		held.clear();
		fastTravel = false;
	};
	const keydown = (event: KeyboardEvent) => {
		if (event.ctrlKey || event.altKey || event.metaKey || isEditableTarget(event.target)) return;
		const key = event.key.toLowerCase();
		fastTravel = event.shiftKey;
		if (MOVEMENT_KEYS.has(key)) {
			if (held.size === 0) following.set(true);
			held.add(key);
			startFixes();
			startFrame();
		} else if (key === 't' && !event.repeat) {
			if (toggleDebugTrip()) startFixes();
		} else if (key === 'm' && !event.repeat) {
			// The same switch as the development setting, for quick A/B comparisons
			const settings = get(appSettings);
			if (!settings) return;
			const enabled = !settings.markerSmoothing;
			appSettings.set({ ...settings, markerSmoothing: enabled });
			console.info(`Marker smoothing ${enabled ? 'on' : 'off — raw fixes'}`);
		}
	};
	const keyup = (event: KeyboardEvent) => {
		fastTravel = event.shiftKey;
		held.delete(event.key.toLowerCase());
	};
	const visibilitychange = () => {
		if (document.hidden) clearMovement();
	};

	window.addEventListener('keydown', keydown);
	window.addEventListener('keyup', keyup);
	window.addEventListener('blur', clearMovement);
	document.addEventListener('visibilitychange', visibilitychange);
	return () => {
		clearMovement();
		if (frame !== null) cancelAnimationFrame(frame);
		frame = null;
		if (fixTimeout !== null) clearTimeout(fixTimeout);
		fixTimeout = null;
		window.removeEventListener('keydown', keydown);
		window.removeEventListener('keyup', keyup);
		window.removeEventListener('blur', clearMovement);
		document.removeEventListener('visibilitychange', visibilitychange);
	};
}