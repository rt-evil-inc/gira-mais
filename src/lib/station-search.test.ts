import { describe, expect, it } from 'vitest';
import { searchStations } from '$lib/station-search';
import type { StationInfo } from '$lib/map.svelte';

function station(overrides: Partial<StationInfo>): StationInfo {
	return {
		code: '1',
		name: '100 - Estação',
		description: null,
		latitude: 38.7,
		longitude: -9.14,
		bikes: 5,
		docks: 20,
		serialNumber: 'serial',
		assetStatus: 'active',
		...overrides,
	};
}

const testStations = [
	station({ name: '481 - Cais do Sodré', serialNumber: 'sodre', latitude: 38.7063, longitude: -9.1449 }),
	station({ name: '407 - Marquês de Pombal', serialNumber: 'marques', latitude: 38.7256, longitude: -9.1503 }),
	station({ name: '417 - Saldanha', serialNumber: 'saldanha', latitude: 38.7336, longitude: -9.1451 }),
	station({ name: '408 - Inactive', serialNumber: 'inactive', assetStatus: 'repair' }),
];

describe('searchStations', () => {
	it('matches names ignoring case and accents', () => {
		expect(searchStations(testStations, 'marques de pombal').map(s => s.serialNumber)).toEqual(['marques']);
		expect(searchStations(testStations, 'SODRÉ').map(s => s.serialNumber)).toEqual(['sodre']);
	});

	it('matches by station number', () => {
		expect(searchStations(testStations, '417').map(s => s.serialNumber)).toEqual(['saldanha']);
	});

	it('ignores inactive stations and empty queries', () => {
		expect(searchStations(testStations, '408')).toEqual([]);
		expect(searchStations(testStations, '  ')).toEqual([]);
	});

	it('prefers earlier matches, breaking ties by proximity', () => {
		const bias = { lat: 38.7063, lng: -9.1449 }; // at Cais do Sodré
		const bySerial = searchStations(testStations, '4', bias).map(s => s.serialNumber);
		expect(bySerial[0]).toBe('sodre');
		expect(bySerial).toHaveLength(3);
	});
});