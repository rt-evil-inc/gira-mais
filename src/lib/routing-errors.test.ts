import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CapacitorHttp } from '@capacitor/core';
import { computeRoute } from '$lib/routing';
import { stations } from '$lib/map.svelte';

vi.mock('$lib/gira-api/api');
vi.mock('@capacitor/core', async importOriginal => {
	const mod = await importOriginal<typeof import('@capacitor/core')>();
	return { ...mod, CapacitorHttp: { ...mod.CapacitorHttp, get: vi.fn() } };
});

const httpGet = vi.mocked(CapacitorHttp.get);

function okResponse(url: string) {
	if (url.includes('/table/')) {
		const sources = new URL(url).searchParams.get('sources')!.split(';').length;
		const destinations = new URL(url).searchParams.get('destinations')!.split(';').length;
		return { code: 'Ok', durations: Array.from({ length: sources }, () => Array.from({ length: destinations }, () => 300)) };
	}
	return { code: 'Ok', routes: [{ distance: 5000, duration: 1200, geometry: { coordinates: [[-9.14, 38.71], [-9.10, 38.77]] } }] };
}

const origin = { lat: 38.7075, lng: -9.1440 };
const dest = { lat: 38.7700, lng: -9.0950 };

describe('computeRoute against a failing routing server', () => {
	beforeAll(() => {
		stations.value = [
			{ code: '1', name: '481 - Cais do Sodré', description: null, latitude: 38.7063, longitude: -9.1449, bikes: 10, docks: 20, serialNumber: 'sodre', assetStatus: 'active' },
			{ code: '4', name: '450 - Parque das Nações', description: null, latitude: 38.7687, longitude: -9.0977, bikes: 8, docks: 20, serialNumber: 'nacoes', assetStatus: 'active' },
		];
	});

	beforeEach(() => {
		httpGet.mockReset();
	});

	it('throws instead of returning a bike route when foot requests keep failing', async () => {
		// The direct-walk comparison cannot be made, so no route must be shown
		httpGet.mockImplementation(async ({ url }) => url.includes('/foot/') ?
			{ status: 502, data: 'Bad Gateway', headers: {}, url } :
			{ status: 200, data: okResponse(url), headers: {}, url });
		await expect(computeRoute(origin, dest, false)).rejects.toThrow();

		// and each failing request was retried (the computation rejects as soon as
		// the first request gives up, so let the in-flight retries settle)
		await new Promise(resolve => setTimeout(resolve, 1500));
		const footCalls = httpGet.mock.calls.filter(([options]) => options.url.includes('/foot/'));
		const perUrl = new Map<string, number>;
		for (const [options] of footCalls) perUrl.set(options.url, (perUrl.get(options.url) ?? 0) + 1);
		for (const attempts of perUrl.values()) expect(attempts).toBe(3);
	});

	it('recovers when a 502 is transient', async () => {
		const failedOnce = new Set<string>;
		httpGet.mockImplementation(async ({ url }) => {
			if (!failedOnce.has(url)) {
				failedOnce.add(url);
				return { status: 502, data: 'Bad Gateway', headers: {}, url };
			}
			return { status: 200, data: okResponse(url), headers: {}, url };
		});
		const route = await computeRoute(origin, dest, false);
		expect(route).not.toBeNull();
		expect(route!.legs.length).toBeGreaterThan(0);
	});

	it('does not retry legitimate no-route responses', async () => {
		httpGet.mockImplementation(async ({ url }) => ({ status: 400, data: { code: 'NoRoute' }, headers: {}, url }));
		const route = await computeRoute(origin, dest, false);
		expect(route).toBeNull();
		const perUrl = new Map<string, number>;
		for (const [options] of httpGet.mock.calls) perUrl.set(options.url, (perUrl.get(options.url) ?? 0) + 1);
		for (const attempts of perUrl.values()) expect(attempts).toBe(1);
	});
});