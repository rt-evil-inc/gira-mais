export type MarkerState = { lng: number, lat: number, heading: number };
export type MarkerTarget = { lng: number, lat: number, heading: number|null };

/** Signed shortest rotation (-180, 180] to get from one bearing to another. */
export function shortestAngleDelta(from: number, to: number): number {
	return ((to - from + 540) % 360) - 180;
}

// GPS fixes land roughly once per second; gliding towards each one over the
// time since the previous fix keeps the marker moving at a steady pace. The
// clamp guards against bursts and long gaps, and anything past SNAP_DISTANCE
// is a relocation (first fix, GPS jump), not movement worth animating
const MIN_GLIDE_ms = 200;
const MAX_GLIDE_ms = 1500;
const HEADING_GLIDE_ms = 300;
const SNAP_DISTANCE_deg = 0.005; // ~500 m

/**
 * Glides a marker between position updates instead of teleporting it.
 * `apply` is called with the interpolated state on every animation frame
 * (and synchronously when a target snaps).
 */
export function createMarkerAnimator(apply: (state: MarkerState) => void) {
	let displayed: MarkerState|null = null;
	let from: MarkerState|null = null;
	let target: MarkerState|null = null;
	let startTime = 0;
	let duration = 0;
	let lastTargetTime: number|null = null;
	let frame: number|null = null;

	function step(time: number) {
		frame = null;
		if (!from || !target) return;
		const t = duration <= 0 ? 1 : Math.min((time - startTime) / duration, 1);
		displayed = {
			lng: from.lng + (target.lng - from.lng) * t,
			lat: from.lat + (target.lat - from.lat) * t,
			heading: (from.heading + shortestAngleDelta(from.heading, target.heading) * t + 360) % 360,
		};
		if (t < 1) frame = requestAnimationFrame(step);
		apply(displayed);
	}

	function setTarget(next: MarkerTarget) {
		const time = performance.now();
		// While the heading is unknown (stationary, first fixes) keep pointing
		// the way we were last known to be going
		const heading = next.heading ?? target?.heading ?? 0;
		const jumped = displayed !== null && (
			Math.abs(next.lat - displayed.lat) > SNAP_DISTANCE_deg ||
			Math.abs(next.lng - displayed.lng) > SNAP_DISTANCE_deg
		);
		target = { lng: next.lng, lat: next.lat, heading };
		if (displayed === null || jumped) {
			from = target;
			duration = 0;
		} else {
			from = displayed;
			duration = Math.min(Math.max(lastTargetTime === null ? 0 : time - lastTargetTime, MIN_GLIDE_ms), MAX_GLIDE_ms);
		}
		lastTargetTime = time;
		startTime = time;
		if (duration <= 0) {
			if (frame !== null) cancelAnimationFrame(frame);
			step(time);
		} else if (frame === null) {
			frame = requestAnimationFrame(step);
		}
	}

	/** Retarget only the heading (e.g. from the compass while standing still),
	 * keeping any in-flight position glide aimed at its current target. */
	function setHeading(heading: number) {
		if (!displayed || !target) return;
		from = displayed;
		target = { ...target, heading };
		startTime = performance.now();
		duration = HEADING_GLIDE_ms;
		if (frame === null) frame = requestAnimationFrame(step);
	}

	function stop() {
		if (frame !== null) cancelAnimationFrame(frame);
		frame = null;
	}

	return { setTarget, setHeading, stop, displayed: () => displayed };
}