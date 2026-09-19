import { beforeEach, describe, expect, it } from 'vitest';
import { createCompassOffsetEstimator, type CompassOffsetEstimator } from '$lib/compass-offset';

describe('createCompassOffsetEstimator', () => {
	let estimator: CompassOffsetEstimator;
	let now: number;

	beforeEach(() => {
		estimator = createCompassOffsetEstimator();
		now = 100_000;
	});

	/** A steady compass stream for the given duration, several readings a second. */
	function holdCompass(heading: number, durationMs: number, jitter = 0) {
		const end = now + durationMs;
		let sign = 1;
		while (now < end) {
			estimator.observeCompass((heading + sign * jitter + 360) % 360, now);
			sign = -sign;
			now += 100;
		}
	}

	/** Rides straight for a number of one-second fixes, the compass reading
	 * `error` degrees off the true course. */
	function rideStraight(course: number, error: number, fixes: number) {
		for (let i = 0; i < fixes; i++) {
			holdCompass((course + error + 360) % 360, 1000, 1);
			estimator.observeCourse(course, now);
		}
	}

	it('corrects nothing before it has seen enough evidence', () => {
		rideStraight(90, 20, 2);
		expect(estimator.offset()).toBe(0);
		expect(estimator.correct(110)).toBe(110);
	});

	it('learns a steady offset and takes it out of the compass heading', () => {
		rideStraight(90, 20, 5);
		expect(estimator.offset()).toBeCloseTo(-20, 0);
		expect(estimator.correct(110)).toBeCloseTo(90, 0);
	});

	it('handles the offset straddling north', () => {
		rideStraight(10, -20, 5); // compass reads 350 while heading 10
		expect(estimator.correct(350)).toBeCloseTo(10, 0);
	});

	it('learns a reversed compass', () => {
		rideStraight(90, 180, 5);
		expect(estimator.correct(270)).toBeCloseTo(90, 0);
	});

	it('ignores courses while the compass is turning', () => {
		// a sweep across headings paired with a fixed course must not count
		for (let i = 0; i < 5; i++) {
			for (let t = 0; t < 10; t++) {
				estimator.observeCompass(100 + i * 20 + t * 2, now);
				now += 100;
			}
			estimator.observeCourse(90, now);
		}
		expect(estimator.offset()).toBe(0);
	});

	it('ignores courses when the compass reading is stale', () => {
		for (let i = 0; i < 5; i++) {
			holdCompass(110, 1500);
			now += 3000; // compass went quiet
			estimator.observeCourse(90, now);
		}
		expect(estimator.offset()).toBe(0);
	});

	it('does not trust an offset that keeps changing', () => {
		// the phone is held at a different angle between fixes
		const errors = [40, -40, 40, -40, 40, -40];
		for (const error of errors) {
			holdCompass(90 + error, 1500);
			estimator.observeCourse(90, now);
		}
		expect(estimator.offset()).toBe(0);
	});

	it('follows a changing error', () => {
		rideStraight(90, 10, 5);
		rideStraight(90, 30, 40);
		expect(estimator.offset()).toBeCloseTo(-30, 0);
	});

	it('can be reset', () => {
		rideStraight(90, 20, 5);
		estimator.reset();
		expect(estimator.offset()).toBe(0);
	});
});