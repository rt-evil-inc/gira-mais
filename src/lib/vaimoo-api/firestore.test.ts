import { beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@capacitor/core', () => ({ CapacitorHttp: { post } }));

import { findFirestoreBike, getFirestoreBikes, getFirestoreStations } from './firestore';

const value = (fields: Record<string, unknown>) => ({
	document: {
		fields: Object.fromEntries(Object.entries(fields).map(([key, entry]) => {
			if (entry === null) return [key, { nullValue: null }];
			if (typeof entry === 'boolean') return [key, { booleanValue: entry }];
			if (typeof entry === 'number') return [key, { integerValue: String(entry) }];
			if (typeof entry === 'object') return [key, { geoPointValue: entry }];
			return [key, { stringValue: entry }];
		})),
	},
});

describe('VAIMOO Firestore adapter', () => {
	beforeEach(() => post.mockReset());

	it('decodes station documents and filters them to the GIRA tenant', async () => {
		post.mockResolvedValue({
			status: 200,
			data: [value({
				DockingStationId: 4551,
				AvailableBikes: 2,
				FreeDocks: 0,
				DockLimit: 2,
				Name: '777 - Emel Station',
				Location: { latitude: 38.77, longitude: -9.15 },
				IsActive: true,
				ServiceStatus: 'AVAILABLE',
				Tenant: 'P1/EML/EML/',
			})],
		});

		const stations = await getFirestoreStations();
		expect(stations[0]).toMatchObject({ DockingStationId: 4551, AvailableBikes: 2 });
		expect(post.mock.calls[0][0].data.structuredQuery.where).toEqual({
			fieldFilter: {
				field: { fieldPath: 'Tenant' },
				op: 'EQUAL',
				value: { stringValue: 'P1/EML/EML/' },
			},
		});
	});

	it('queries bikes by station or visual ID', async () => {
		post.mockResolvedValue({ status: 200, data: [] });
		await getFirestoreBikes(4551);
		await findFirestoreBike('E0980');

		const stationFilters = post.mock.calls[0][0].data.structuredQuery.where.compositeFilter.filters;
		expect(stationFilters[1].fieldFilter.value).toEqual({ integerValue: '4551' });
		const bikeFilters = post.mock.calls[1][0].data.structuredQuery.where.compositeFilter.filters;
		expect(bikeFilters[1].fieldFilter.value).toEqual({ stringValue: 'E0980' });
	});
});