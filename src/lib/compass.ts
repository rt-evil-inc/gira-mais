import { writable } from 'svelte/store';
import { shortestAngleDelta } from '$lib/marker-animation';

/** Direction the top of the screen points, in degrees clockwise from north,
 * from the device orientation sensors; null while unavailable or denied. */
export const compassHeading = writable<number|null>(null);

type DeviceOrientationEventStatic = typeof DeviceOrientationEvent & {
	requestPermission?: () => Promise<'granted'|'denied'>;
};
type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };

// The sensors report at tens of hertz with sub-degree jitter; only meaningful
// turns are published
const MIN_INTERVAL_ms = 200;
const MIN_CHANGE_deg = 2;
let lastUpdate = 0;
let lastValue: number|null = null;

function publish(heading: number) {
	const now = Date.now();
	if (lastValue !== null) {
		if (now - lastUpdate < MIN_INTERVAL_ms) return;
		if (Math.abs(shortestAngleDelta(lastValue, heading)) < MIN_CHANGE_deg) return;
	}
	lastUpdate = now;
	lastValue = heading;
	compassHeading.set(heading);
}

// In landscape the screen's top is no longer the device's top, but it's still
// what the user perceives as "forward"
function screenAngle() {
	return window.screen?.orientation?.angle ?? 0;
}

function onOrientation(e: CompassEvent) {
	if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) {
		// iOS: OS-provided tilt-compensated compass heading of the device top
		publish((e.webkitCompassHeading + screenAngle()) % 360);
	} else if (e.absolute && e.alpha !== null) {
		// elsewhere alpha is the yaw relative to north when the reading is absolute
		publish((360 - e.alpha + screenAngle()) % 360);
	}
}

let started = false;

/** Start listening to the device compass. On iOS the first call must come
 * from a user gesture, since it prompts for motion permission; calling it
 * repeatedly is safe and cheap. */
export async function startCompass() {
	if (started || typeof window === 'undefined') return;
	const orientationEvent = window.DeviceOrientationEvent as DeviceOrientationEventStatic|undefined;
	if (!orientationEvent) return;
	const supportsAbsolute = 'ondeviceorientationabsolute' in window;
	try {
		if (typeof orientationEvent.requestPermission === 'function') {
			if (await orientationEvent.requestPermission() !== 'granted') return;
			window.addEventListener('deviceorientation', onOrientation);
		} else if (supportsAbsolute) {
			window.addEventListener('deviceorientationabsolute', onOrientation as EventListener);
		} else {
			// the handler still ignores non-absolute readings
			window.addEventListener('deviceorientation', onOrientation);
		}
		started = true;
	} catch {
		// the permission request threw (e.g. called outside a user gesture) —
		// a later call from an actual tap can still succeed
	}
}

// Only iOS gates the sensor behind a permission prompt — everywhere else the
// compass can start with the app
if (typeof window !== 'undefined' && typeof (window.DeviceOrientationEvent as DeviceOrientationEventStatic|undefined)?.requestPermission !== 'function') {
	startCompass();
}