import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMarkerAnimator, shortestAngleDelta, type MarkerState } from '$lib/marker-animation';

describe('shortestAngleDelta', () => {
	it('rotates through the wrap-around when that is shorter', () => {
		expect(shortestAngleDelta(350, 10)).toBe(20);
		expect(shortestAngleDelta(10, 350)).toBe(-20);
	});

	it('handles plain rotations', () => {
		expect(shortestAngleDelta(0, 90)).toBe(90);
		expect(shortestAngleDelta(90, 45)).toBe(-45);
		expect(shortestAngleDelta(0, 180)).toBe(-180);
	});
});

describe('createMarkerAnimator', () => {
	let now: number;
	let frames: FrameRequestCallback[];

	beforeEach(() => {
		now = 1000;
		frames = [];
		vi.stubGlobal('performance', { now: () => now });
		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
			frames.push(cb);
			return frames.length;
		});
		vi.stubGlobal('cancelAnimationFrame', () => {});
	});

	afterEach(() => vi.unstubAllGlobals());

	function runFrame(advanceMs: number) {
		now += advanceMs;
		const pending = frames.splice(0, frames.length);
		pending.forEach(cb => cb(now));
	}

	it('snaps to the first position immediately', () => {
		const applied: MarkerState[] = [];
		const animator = createMarkerAnimator(state => applied.push(state));
		animator.setTarget({ lng: -9.15, lat: 38.744, heading: 45 });
		expect(applied).toEqual([{ lng: -9.15, lat: 38.744, heading: 45 }]);
	});

	it('glides towards subsequent positions over the update interval', () => {
		const applied: MarkerState[] = [];
		const animator = createMarkerAnimator(state => applied.push(state));
		animator.setTarget({ lng: 0, lat: 0, heading: 0 });
		now += 1000;
		animator.setTarget({ lng: 0.001, lat: 0.002, heading: 90 });
		runFrame(500);
		expect(applied.at(-1)).toEqual({ lng: 0.0005, lat: 0.001, heading: 45 });
		runFrame(500);
		expect(applied.at(-1)).toEqual({ lng: 0.001, lat: 0.002, heading: 90 });
		expect(frames).toHaveLength(0); // animation finished
	});

	it('interpolates the heading along the shortest arc', () => {
		const applied: MarkerState[] = [];
		const animator = createMarkerAnimator(state => applied.push(state));
		animator.setTarget({ lng: 0, lat: 0, heading: 350 });
		now += 1000;
		animator.setTarget({ lng: 0.001, lat: 0, heading: 10 });
		runFrame(500);
		expect(applied.at(-1)?.heading).toBe(0);
	});

	it('keeps the previous heading while it is unknown', () => {
		const applied: MarkerState[] = [];
		const animator = createMarkerAnimator(state => applied.push(state));
		animator.setTarget({ lng: 0, lat: 0, heading: 120 });
		now += 1000;
		animator.setTarget({ lng: 0.001, lat: 0, heading: null });
		runFrame(1000);
		expect(applied.at(-1)?.heading).toBe(120);
	});

	it('retargets the heading without disturbing the position glide', () => {
		const applied: MarkerState[] = [];
		const animator = createMarkerAnimator(state => applied.push(state));
		animator.setTarget({ lng: 0, lat: 0, heading: 0 });
		now += 1000;
		animator.setTarget({ lng: 0.001, lat: 0, heading: 0 });
		runFrame(500); // halfway through the position glide
		animator.setHeading(90);
		runFrame(300);
		expect(applied.at(-1)?.heading).toBe(90);
		expect(applied.at(-1)?.lng).toBe(0.001); // the glide still reaches its target
	});

	it('snaps instead of gliding across large jumps', () => {
		const applied: MarkerState[] = [];
		const animator = createMarkerAnimator(state => applied.push(state));
		animator.setTarget({ lng: -9.15, lat: 38.744, heading: 0 });
		now += 1000;
		animator.setTarget({ lng: -9.15, lat: 38.9, heading: null });
		expect(applied.at(-1)).toEqual({ lng: -9.15, lat: 38.9, heading: 0 });
		expect(frames).toHaveLength(0);
	});
});