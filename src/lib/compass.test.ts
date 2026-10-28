import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

type Listener = (e: Partial<DeviceOrientationEvent>) => void;

describe('compass sensors', () => {
	let listeners: Map<string, Listener>;

	beforeEach(() => {
		vi.resetModules();
		listeners = new Map;
		// a Chromium WebView: both events exist, no permission prompt
		vi.stubGlobal('ondeviceorientationabsolute', null);
		vi.stubGlobal('DeviceOrientationEvent', class {});
		vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, listener: Listener) => listeners.set(type, listener)) as typeof window.addEventListener);
		vi.spyOn(window, 'removeEventListener').mockImplementation(((type: string, listener: Listener) => {
			if (listeners.get(type) === listener) listeners.delete(type);
		}) as typeof window.removeEventListener);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	async function load() {
		const compass = await import('$lib/compass');
		await vi.waitFor(() => expect(get(compass.compassStatus)).toBe('listening'));
		return compass;
	}

	it('drops the plain event once the absolute one delivers headings', async () => {
		const { compassHeading } = await load();
		expect([...listeners.keys()].sort()).toEqual(['deviceorientation', 'deviceorientationabsolute']);
		listeners.get('deviceorientation')!({ type: 'deviceorientation', absolute: false, alpha: 10 });
		expect(listeners.has('deviceorientationabsolute')).toBe(true);
		listeners.get('deviceorientationabsolute')!({ type: 'deviceorientationabsolute', absolute: true, alpha: 90 });
		expect(get(compassHeading)).toBe(270);
		expect([...listeners.keys()]).toEqual(['deviceorientationabsolute']);
	});

	it('keeps the plain event where it is the one flagged absolute', async () => {
		const { compassHeading } = await load();
		listeners.get('deviceorientation')!({ type: 'deviceorientation', absolute: true, alpha: 45 });
		expect(get(compassHeading)).toBe(315);
		expect([...listeners.keys()]).toEqual(['deviceorientation']);
	});
});