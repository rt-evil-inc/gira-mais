import type { ActiveTripSubscription } from '$lib/gira-api/ws-types';
import { get } from 'svelte/store';
import { updateWithTripMessage } from '$lib/injest-api-data';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { currentTrip } from '$lib/trip';
import { tripPayWithNoPoints, tripPayWithPoints } from '$lib/gira-api/__mocks__/api';
import * as api from '$lib/gira-api/__mocks__/api';

beforeAll(() => {
	vi.mock('$lib/gira-api/api');
});

describe('updateWithTripMessage', () => {
	it('should pay for the trip', () => {
		const currentDate = new Date;
		const activeTrip:ActiveTripSubscription = {
			'code': 'ABC123',
			'bike': 'E0041',
			'startDate': new Date(currentDate.getTime() - 2000),
			'endDate': null,
			'cost': 0,
			'finished': false,
			'canPayWithMoney': false,
			'canUsePoints': false,
			'clientPoints': 49170,
			'tripPoints': null,
			'canceled': false,
			'period': 'other',
			'periodTime': '116',
			'error': 0,
		};
		global.Date.now = vi.fn(() => activeTrip.startDate.getTime() + 35000);

		const randomOldTrip:ActiveTripSubscription = {
			'code': '8PBL9FVCPH',
			'bike': 'E0040',
			'startDate': new Date(activeTrip.startDate.getTime() - 36000),
			'endDate': new Date(activeTrip.startDate.getTime() - 30000),
			'cost': 0,
			'finished': true,
			'canPayWithMoney': true,
			'canUsePoints': false,
			'clientPoints': 49170,
			'tripPoints': 110,
			'canceled': false,
			'period': 'other',
			'periodTime': '116',
			'error': 0,
		};

		const currentTripEnd:ActiveTripSubscription = {
			'code': 'ABC123',
			'bike': 'E0041',
			'startDate': new Date(currentDate.getTime() - 2000),
			'endDate': new Date,
			'cost': 0,
			'finished': true,
			'canPayWithMoney': true,
			'canUsePoints': false,
			'clientPoints': 49170,
			'tripPoints': 110,
			'canceled': false,
			'period': 'other',
			'periodTime': '116',
			'error': 0,
		};

		// set mock

		console.log(api);
		vi.spyOn(api, 'tripPayWithNoPoints');
		vi.spyOn(api, 'tripPayWithPoints');
		updateWithTripMessage(activeTrip);
		expect(tripPayWithPoints).toHaveBeenCalledTimes(0);
		expect(tripPayWithNoPoints).toHaveBeenCalledTimes(0);
		expect(get(currentTrip)?.code).toBe(activeTrip.code);

		updateWithTripMessage(randomOldTrip);
		expect(tripPayWithPoints).toHaveBeenCalledTimes(0);
		expect(tripPayWithNoPoints).toHaveBeenCalledTimes(1);
		expect(get(currentTrip)?.code).toBe(activeTrip.code);

		updateWithTripMessage(currentTripEnd);
		expect(tripPayWithPoints).toHaveBeenCalledTimes(0);
		expect(tripPayWithNoPoints).toHaveBeenCalledTimes(2);
		expect(get(currentTrip)).toBe(null);
	});
});