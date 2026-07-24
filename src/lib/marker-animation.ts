export type MarkerState = { lng: number, lat: number, heading: number };
export type MarkerTarget = { lng: number, lat: number, heading: number|null };

/** Signed shortest rotation (-180, 180] to get from one bearing to another. */
export function shortestAngleDelta(from: number, to: number): number {
	return ((to - from + 540) % 360) - 180;
}

// GPS fixes land roughly once per second; gliding towards each one over the
// time since the previous fix keeps the marker moving at a steady pace. The
// clamp guards against long gaps, and anything past SNAP_DISTANCE is a
// relocation (first fix, GPS jump), not movement worth animating.
// There is deliberately no lower bound: updates can also arrive per frame (the
// debug controls, a high-rate fix stream), and gliding those over a floor well
// above their own interval would leave the marker permanently behind
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
	// Position and heading glide on independent tracks: a compass heading can
	// arrive mid-glide (and Svelte defers a store set made inside another store's
	// notification, so even a fix's own heading lands after its position), and
	// re-timing the position from those would cut the glide short and leave the
	// marker sprinting between fixes and then stalling
	let posFrom: { lng: number, lat: number }|null = null;
	let posTarget: { lng: number, lat: number }|null = null;
	let posStart = 0;
	let posDuration = 0;
	let headFrom = 0;
	let headTarget = 0;
	let headStart = 0;
	let headDuration = 0;
	let lastTargetTime: number|null = null;
	let frame: number|null = null;
	let smoothing = true;

	/** Progress along a track, clamped to the segment it interpolates. */
	function progress(start: number, duration: number, now: number) {
		if (duration <= 0) return 1;
		return Math.min(Math.max((now - start) / duration, 0), 1);
	}

	/** How long a track may take, which is no time at all without smoothing. */
	function glide(duration: number) {
		return smoothing ? duration : 0;
	}

	/** Render straight away once nothing is left to animate, otherwise keep the
	 * animation loop running. */
	function advance(settled: boolean) {
		if (settled) {
			if (frame !== null) cancelAnimationFrame(frame);
			step();
		} else if (frame === null) {
			frame = requestAnimationFrame(step);
		}
	}

	// Progress is measured with performance.now() rather than the frame timestamp
	// handed to the callback: that timestamp marks the start of the frame, while
	// the start times are taken when a target arrives, which on a busy frame (or
	// a high refresh rate) is already past the next frame's timestamp — mixing
	// the two makes progress negative and walks the marker backwards
	function step() {
		frame = null;
		if (!posFrom || !posTarget) return;
		const now = performance.now();
		const tp = progress(posStart, posDuration, now);
		const th = progress(headStart, headDuration, now);
		displayed = {
			lng: posFrom.lng + (posTarget.lng - posFrom.lng) * tp,
			lat: posFrom.lat + (posTarget.lat - posFrom.lat) * tp,
			heading: (headFrom + shortestAngleDelta(headFrom, headTarget) * th + 360) % 360,
		};
		if (tp < 1 || th < 1) frame = requestAnimationFrame(step);
		apply(displayed);
	}

	function setTarget(next: MarkerTarget) {
		const time = performance.now();
		// While the heading is unknown (stationary, first fixes) keep pointing
		// the way we were last known to be going
		const heading = next.heading ?? headTarget;
		const jumped = displayed !== null && (
			Math.abs(next.lat - displayed.lat) > SNAP_DISTANCE_deg ||
			Math.abs(next.lng - displayed.lng) > SNAP_DISTANCE_deg
		);
		posTarget = { lng: next.lng, lat: next.lat };
		if (displayed === null || jumped) {
			posFrom = posTarget;
			posDuration = 0;
			headFrom = heading;
			headDuration = 0;
		} else {
			posFrom = { lng: displayed.lng, lat: displayed.lat };
			posDuration = glide(Math.min(lastTargetTime === null ? 0 : time - lastTargetTime, MAX_GLIDE_ms));
			// Turn across the same interval, so the marker rotates as steadily as
			// it travels instead of snapping round on arrival
			headFrom = displayed.heading;
			headDuration = posDuration;
		}
		headTarget = heading;
		lastTargetTime = time;
		posStart = time;
		headStart = time;
		advance(posDuration <= 0 && headDuration <= 0);
	}

	/** Retarget only the heading (e.g. from the compass while standing still),
	 * keeping any in-flight position glide aimed at its current target. */
	function setHeading(heading: number) {
		if (!displayed || !posTarget) return;
		headFrom = displayed.heading;
		headTarget = heading;
		headStart = performance.now();
		headDuration = glide(HEADING_GLIDE_ms);
		advance(headDuration <= 0);
	}

	/** Turning smoothing off drops the marker straight onto every update from
	 * then on, and settles any glide already in flight. */
	function setSmoothing(enabled: boolean) {
		if (smoothing === enabled) return;
		smoothing = enabled;
		if (enabled || !posTarget) return;
		posDuration = 0;
		headDuration = 0;
		advance(true);
	}

	function stop() {
		if (frame !== null) cancelAnimationFrame(frame);
		frame = null;
	}

	return { setTarget, setHeading, setSmoothing, stop, displayed: () => displayed };
}