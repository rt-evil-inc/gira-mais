import { beforeAll, describe, expect, it, vi } from 'vitest';
import { computeRoute, currentRoute, routeDestination } from '$lib/routing';
import { currentPos } from '$lib/location';
import { stations } from '$lib/map.svelte';
import { ROUTING_API_URL } from '$lib/constants';
import { get } from 'svelte/store';

beforeAll(() => {
	vi.mock('$lib/gira-api/api');
});

// Real GIRA station locations in Lisbon
const testStations = [
	{ code: '1', name: '481 - Cais do Sodré', description: null, latitude: 38.7063, longitude: -9.1449, bikes: 10, docks: 20, serialNumber: 'sodre', assetStatus: 'active' },
	{ code: '2', name: '407 - Marquês de Pombal', description: null, latitude: 38.7256, longitude: -9.1503, bikes: 5, docks: 20, serialNumber: 'marques', assetStatus: 'active' },
	{ code: '3', name: '417 - Saldanha', description: null, latitude: 38.7336, longitude: -9.1451, bikes: 0, docks: 20, serialNumber: 'saldanha-empty', assetStatus: 'active' },
	{ code: '4', name: '450 - Parque das Nações', description: null, latitude: 38.7687, longitude: -9.0977, bikes: 8, docks: 20, serialNumber: 'nacoes', assetStatus: 'active' },
];

const serverReachable = await fetch(`${ROUTING_API_URL}/foot/route/v1/-/-9.1449,38.7063;-9.1503,38.7256?overview=false`)
	.then(r => r.ok).catch(() => false);

describe.skipIf(!serverReachable)('computeRoute', () => {
	beforeAll(() => {
		stations.value = testStations;
	});

	it('should combine walking and cycling legs for a long trip', async () => {
		// Near Cais do Sodré → near Parque das Nações (~8km)
		const route = await computeRoute({ lat: 38.7075, lng: -9.1440 }, { type: 'location', lat: 38.7700, lng: -9.0950 }, false);
		expect(route).not.toBeNull();
		expect(route!.legs.map(l => l.mode)).toEqual(['foot', 'bike', 'foot']);
		expect(route!.startStationSerial).toBe('sodre');
		expect(route!.endStationSerial).toBe('nacoes');
		expect(route!.totalDuration).toBeGreaterThan(0);
		expect(route!.totalDistance).toBeGreaterThan(5000);
		for (const leg of route!.legs) expect(leg.coordinates.length).toBeGreaterThan(1);
	});

	it('should not pick up a bike at a station without bikes', async () => {
		// Origin next to the empty Saldanha station
		const route = await computeRoute({ lat: 38.7338, lng: -9.1453 }, { type: 'location', lat: 38.7700, lng: -9.0950 }, false);
		expect(route).not.toBeNull();
		const bikeLeg = route!.legs.find(l => l.mode === 'bike');
		expect(bikeLeg).toBeDefined();
		expect(route!.startStationSerial).not.toBe('saldanha-empty');
	});

	it('should walk directly for very short trips', async () => {
		// ~200m away
		const route = await computeRoute({ lat: 38.7075, lng: -9.1440 }, { type: 'location', lat: 38.7085, lng: -9.1460 }, false);
		expect(route).not.toBeNull();
		expect(route!.legs.map(l => l.mode)).toEqual(['foot']);
		expect(route!.startStationSerial).toBeNull();
	});

	it('should route to a dock and walk when already riding', async () => {
		const route = await computeRoute({ lat: 38.7075, lng: -9.1440 }, { type: 'location', lat: 38.7700, lng: -9.0950 }, true);
		expect(route).not.toBeNull();
		expect(route!.legs[0].mode).toBe('bike');
		expect(route!.legs.map(l => l.mode)).toEqual(['bike', 'foot']);
		expect(route!.endStationSerial).toBe('nacoes');
	});

	it('should keep the route when the destination is renamed mid-computation (dropped pin)', async () => {
		currentPos.set({ coords: { latitude: 38.7075, longitude: -9.1440, accuracy: 5, altitude: null, altitudeAccuracy: null, speed: null, heading: null }, timestamp: Date.now() });
		const pin = { type: 'location' as const, lat: 38.7700, lng: -9.0950 };
		routeDestination.set(pin);
		// Reverse geocoding fills in the name while the route is still being computed
		await new Promise(resolve => setTimeout(resolve, 50));
		routeDestination.set({ ...pin, name: 'Oceanário de Lisboa' });
		await vi.waitFor(() => expect(get(currentRoute)).not.toBeNull(), { timeout: 15000 });
		const route = get(currentRoute)!;
		expect(route.legs.some(l => l.mode === 'bike')).toBe(true);
		expect(route.destination.name).toBe('Oceanário de Lisboa');
		routeDestination.set(null);
	});

	it('should end the route at the station when the destination is a station', async () => {
		const route = await computeRoute({ lat: 38.7075, lng: -9.1440 }, { type: 'station', lat: 38.7256, lng: -9.1503, name: 'Marquês de Pombal', stationSerial: 'marques' }, false);
		expect(route).not.toBeNull();
		expect(route!.legs[route!.legs.length - 1].mode).toBe('bike');
		expect(route!.endStationSerial).toBe('marques');
	});
});
