// The beam's width follows the compass's own error estimate, where the
// platform gives one (iOS does, Android doesn't): a confident heading gets a
// narrow beam, a doubtful one a wide fan, like Google Maps. One image is
// drawn per width, so the estimate is bucketed to these half-angles
export const BEAM_HALF_ANGLES_deg = [20, 30, 45, 60] as const;
export type BeamHalfAngle = typeof BEAM_HALF_ANGLES_deg[number];

const DEFAULT_HALF_ANGLE: BeamHalfAngle = 30;

/** The half-angle to draw the beam at for a reported compass error radius
 * in degrees, or the default when the platform reports none. */
export function beamHalfAngle(accuracy: number|null): BeamHalfAngle {
	if (accuracy === null || !Number.isFinite(accuracy)) return DEFAULT_HALF_ANGLE;
	return BEAM_HALF_ANGLES_deg.find(angle => angle >= accuracy) ?? BEAM_HALF_ANGLES_deg[BEAM_HALF_ANGLES_deg.length - 1];
}