import { get, writable } from 'svelte/store';
import { shortestAngleDelta } from '$lib/marker-animation';
import { compassOffset } from '$lib/compass-offset';

/** Direction the top of the screen points, in degrees clockwise from north,
 * from the device orientation sensors; null while unavailable or denied. */
export const compassHeading = writable<number|null>(null);
/** How far off the compass heading may be, in degrees, as reported by the
 * sensor (iOS only); null where the platform doesn't say. */
export const compassAccuracy = writable<number|null>(null);
/** Where the sensor stands, for the development diagnostics: not started
 * yet, missing from the platform, refused, attached but silent, attached
 * but only delivering relative readings, or delivering headings. */
export const compassStatus = writable<'idle'|'unsupported'|'denied'|'listening'|'relative-only'|'active'>('idle');

type DeviceOrientationEventStatic = typeof DeviceOrientationEvent & {
	requestPermission?: () => Promise<'granted'|'denied'>;
};
type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number, webkitCompassAccuracy?: number };

// The sensors report at tens of hertz with sub-degree jitter. Readings are
// let through nearly at that rate so the marker tracks a turning phone
// closely (the marker animator irons out the jitter); the thresholds only
// drop the exact repeats and the noise floor
const MIN_INTERVAL_ms = 50;
const MIN_CHANGE_deg = 0.5;
let lastUpdate = 0;
let lastValue: number|null = null;

function publish(heading: number, accuracy: number|null) {
	const now = Date.now();
	compassStatus.set('active');
	// every raw reading feeds the error estimate, throttled or not
	compassOffset.observeCompass(heading, now);
	if (lastValue !== null) {
		if (now - lastUpdate < MIN_INTERVAL_ms) return;
		if (Math.abs(shortestAngleDelta(lastValue, heading)) < MIN_CHANGE_deg) return;
	}
	lastUpdate = now;
	lastValue = heading;
	compassHeading.set(heading);
	compassAccuracy.set(accuracy);
}

// In landscape the screen's top is no longer the device's top, but it's still
// what the user perceives as "forward"
function screenAngle() {
	return window.screen?.orientation?.angle ?? 0;
}

function onOrientation(e: CompassEvent) {
	if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) {
		// iOS: OS-provided tilt-compensated compass heading of the device top,
		// with its error radius (negative when the sensor can't say)
		const accuracy = typeof e.webkitCompassAccuracy === 'number' && e.webkitCompassAccuracy >= 0 ? e.webkitCompassAccuracy : null;
		publish((e.webkitCompassHeading + screenAngle()) % 360, accuracy);
	} else if (e.absolute && e.alpha !== null) {
		// elsewhere alpha is the yaw relative to north when the reading is absolute
		publish((360 - e.alpha + screenAngle()) % 360, null);
	} else if (get(compassStatus) === 'listening') {
		compassStatus.set('relative-only');
	}
}

let started = false;

// WebKit is the only engine without the absolute event: it folds the compass
// heading into the plain one instead. Chromium has both, and lately a
// requestPermission of its own, so the permission call can't tell them apart
const isWebKit = typeof window !== 'undefined' && !('ondeviceorientationabsolute' in window);

/** Start listening to the device compass. On iOS the first call must come
 * from a user gesture, since it prompts for motion permission; calling it
 * repeatedly is safe and cheap. */
export async function startCompass() {
	if (started || typeof window === 'undefined') return;
	const orientationEvent = window.DeviceOrientationEvent as DeviceOrientationEventStatic|undefined;
	if (!orientationEvent) {
		compassStatus.set('unsupported');
		return;
	}
	try {
		// iOS prompts here; Chromium answers straight away from its policy
		if (typeof orientationEvent.requestPermission === 'function' && await orientationEvent.requestPermission() !== 'granted') {
			compassStatus.set('denied');
			return;
		}
		// Chromium delivers north-referenced readings on its own event, but
		// some WebViews advertise it without ever firing it, while others
		// flag the plain event as absolute — take whichever comes with a
		// usable heading (the handler drops relative readings either way)
		if (!isWebKit) window.addEventListener('deviceorientationabsolute', onOrientation as EventListener);
		window.addEventListener('deviceorientation', onOrientation);
		started = true;
		compassStatus.set('listening');
	} catch {
		// the permission request threw (e.g. called outside a user gesture) —
		// a later call from an actual tap can still succeed
	}
}

// Only iOS gates the sensor behind a permission prompt — everywhere else the
// compass can start with the app
if (typeof window !== 'undefined' && !isWebKit) {
	startCompass();
}