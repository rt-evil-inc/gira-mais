import { describe, expect, it } from 'vitest';
import { beamHalfAngle } from '$lib/heading-beam';

describe('beamHalfAngle', () => {
	it('falls back to the default width without an accuracy estimate', () => {
		expect(beamHalfAngle(null)).toBe(30);
		expect(beamHalfAngle(NaN)).toBe(30);
	});

	it('keeps the beam at least as wide as the reported error', () => {
		expect(beamHalfAngle(0)).toBe(20);
		expect(beamHalfAngle(20)).toBe(20);
		expect(beamHalfAngle(21)).toBe(30);
		expect(beamHalfAngle(44)).toBe(45);
	});

	it('caps the beam at the widest fan for very poor readings', () => {
		expect(beamHalfAngle(90)).toBe(60);
		expect(beamHalfAngle(180)).toBe(60);
	});
});