import { shortestAngleDelta } from '$lib/marker-animation';

// The compass is often off by tens of degrees, sometimes reversed outright:
// the magnetometer may not be calibrated, and the steel of the bike and the
// mount bend the field around it. But the error is steady over the short
// term, and a stop almost always faces the way we were just riding, so the
// offset between compass and GPS course measured along the last leg is taken
// out while the compass has the say.

// How quickly older samples stop counting, and how many consistent ones are
// needed before the estimate is trusted at all
const MEMORY_ms = 10_000;
const MIN_SAMPLES = 3;
// Resultant length of the averaged offset unit vectors: 1 means every sample
// agreed, and this threshold amounts to roughly 18° of scatter. A phone held
// at a random angle to the bike never gets past it
const MIN_CONSISTENCY = 0.95;
// The GPS course lags the compass by about a fix, so pairing them during a
// turn is meaningless: the compass has to have held still for a while
const STABLE_WINDOW_ms = 2000;
const STABLE_MIN_SPAN_ms = 1000;
const STABLE_deg = 8;
const COMPASS_MAX_AGE_ms = 1500;

const toRad = (deg: number) => deg * Math.PI / 180;
const toDeg = (rad: number) => rad * 180 / Math.PI;

export type CompassOffsetEstimator = ReturnType<typeof createCompassOffsetEstimator>;

/** Learns the compass error from the GPS course while moving, so the compass
 * can be corrected when it takes over at a stop. Feed it every raw compass
 * reading and every trusted course, and ask it to correct compass headings. */
export function createCompassOffsetEstimator() {
	// raw compass readings from the last STABLE_WINDOW_ms, oldest first
	let recent: { time: number, heading: number }[] = [];
	// exponentially weighted mean of the offset as a unit vector
	let offX = 0, offY = 0;
	let samples = 0;
	let lastSampleTime = 0;

	function observeCompass(heading: number, now: number) {
		recent.push({ time: now, heading });
		const cutoff = now - STABLE_WINDOW_ms;
		let drop = 0;
		while (drop < recent.length && recent[drop].time <= cutoff) drop++;
		if (drop > 0) recent = recent.slice(drop);
	}

	/** The compass heading to pair a course with — the average over the
	 * stability window, to shed the sensor jitter — or null if there's no
	 * reading recent enough or the compass was turning. */
	function stableCompassHeading(now: number): number|null {
		const latest = recent[recent.length - 1];
		if (!latest || now - latest.time > COMPASS_MAX_AGE_ms) return null;
		if (latest.time - recent[0].time < STABLE_MIN_SPAN_ms) return null;
		let x = 0, y = 0;
		for (const reading of recent) {
			if (Math.abs(shortestAngleDelta(reading.heading, latest.heading)) > STABLE_deg) return null;
			x += Math.cos(toRad(reading.heading));
			y += Math.sin(toRad(reading.heading));
		}
		return toDeg(Math.atan2(y, x));
	}

	/** Record a trusted travel direction (a GPS course at riding speed). */
	function observeCourse(course: number, now: number) {
		const compass = stableCompassHeading(now);
		if (compass === null) return;
		const delta = shortestAngleDelta(compass, course);
		const weight = samples === 0 ? 1 : 1 - Math.exp(-(now - lastSampleTime) / MEMORY_ms);
		offX += (Math.cos(toRad(delta)) - offX) * weight;
		offY += (Math.sin(toRad(delta)) - offY) * weight;
		samples++;
		lastSampleTime = now;
	}

	/** Signed correction to add to a compass heading; 0 while there's nothing
	 * trustworthy to go on. */
	function offset(): number {
		if (samples < MIN_SAMPLES || Math.hypot(offX, offY) < MIN_CONSISTENCY) return 0;
		return toDeg(Math.atan2(offY, offX));
	}

	function correct(heading: number): number {
		return (heading + offset() + 360) % 360;
	}

	function reset() {
		recent = [];
		offX = offY = 0;
		samples = 0;
		lastSampleTime = 0;
	}

	return { observeCompass, observeCourse, offset, correct, reset };
}

/** The app's single estimator, fed by the compass and location modules. */
export const compassOffset = createCompassOffsetEstimator();

// The screen is kept awake during a trip, so it going dark means the phone
// was pocketed, where it points anywhere but forward: what was learned before
// doesn't hold in there, and what's learned in there doesn't hold once it's
// out again
if (typeof document !== 'undefined') {
	document.addEventListener('visibilitychange', () => compassOffset.reset());
}