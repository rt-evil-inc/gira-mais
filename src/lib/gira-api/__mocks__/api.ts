import type { M, Q } from '$lib/gira-api/api-types';

export async function reserveBike(serialNumber: string): Promise<M<['reserveBike']>> {
	return {
		reserveBike: true,
	};
}

export async function getStationInfo(stationId: string): Promise<Q<['getBikes', 'getDocks']>> {
	// TODO
	return { getBikes: [], getDocks: [] };
}

export async function cancelBikeReserve(): Promise<M<['cancelBikeReserve']>> {
	return { cancelBikeReserve: true };
}

export async function startTrip(): Promise<M<['startTrip']>> {
	return {
		startTrip: true,
	};
}

export async function rateTrip(tripCode: string, tripRating: number, tripComment?: string, tripAttachment?: File): Promise<M<['rateTrip']>> {
	return {
		rateTrip: true,
	};
}

export async function tripPayWithNoPoints(tripCode: string): Promise<M<['tripPayWithNoPoints']>> {
	// TODO check what this actually returns?
	return {
		tripPayWithNoPoints: 123,
	};
}

export async function tripPayWithPoints(tripCode: string): Promise<M<['tripPayWithPoints']>> {
	// TODO check what this actually returns?
	return {
		tripPayWithPoints: 123,
	};
}

export async function fullOnetimeInfo(): Promise<Q<['getStations', 'client', 'activeUserSubscriptions', 'activeTrip', 'unratedTrips', 'tripHistory']>> {
	return {
		activeTrip: null,
		client: [{ balance: 4, bonus: 12345 }],
		getStations: [{
			'code': '0000000003',
			'description': 'Alameda dos Oceanos',
			'latitude': 38.756161,
			'longitude': -9.096804,
			'name': '101 - Alameda dos Oceanos / Rua dos Argonautas',
			'bikes': 5,
			'docks': 14,
			'serialNumber': '1000101',
			'assetStatus': 'active',
		},
		{
			'code': '0000000005',
			'description': 'Rua do Fogo de Santelmo',
			'latitude': 38.761218,
			'longitude': -9.095019,
			'name': '103 - Jardim da Água',
			'bikes': 2,
			'docks': 17,
			'serialNumber': '1000103',
			'assetStatus': 'active',
		}],
		activeUserSubscriptions: [
			{
				'expirationDate': '2024-10-01T00:00:18Z',
				'subscriptionStatus': 'paid',
				'name': 'Passe Anual',
				'type': 'anual',
				'active': true,
			},
		],
		unratedTrips: [
			{
				'code': 'JWA8FQ1PFL',
				'startDate': '2024-01-01T13:45:50Z',
				'endDate': '2024-01-01T14:01:56Z',
				'rating': null,
				'startLocation': '0000009904',
				'endLocation': '0000009905',
				'cost': 0,
				'costBonus': 0,
				'asset': '0000013066',
			},
		],
		tripHistory: (await getTripHistory(0, 10)).tripHistory,
	};
}

export async function getTripHistory(pageNum: number, pageSize: number): Promise<Q<['tripHistory']>> {
	return {
		tripHistory: [
			{
				'code': '6JWFVI9O8N',
				'startDate': '2024-01-18T20:32:38Z',
				'endDate': '2024-01-18T20:51:52Z',
				'rating': 5,
				'bikeName': 'E0593',
				'startLocation': '419 - Av. António José de Almeida / Instituto Superior Técnico',
				'endLocation': '484 - Rua Professor Vieira de Almeida',
				'bonus': 10,
				'usedPoints': 0,
				'cost': 0,
				'bikeType': 'electric',
			},
			{
				'code': 'JWA8FQ1PFL',
				'startDate': '2024-01-18T13:45:50Z',
				'endDate': '2024-01-18T14:01:56Z',
				'rating': 0,
				'bikeName': 'E0967',
				'startLocation': '484 - Rua Professor Vieira de Almeida',
				'endLocation': '420 - Av. Rovisco Pais / Av. Manuel da Maia',
				'bonus': 110,
				'usedPoints': 0,
				'cost': 0,
				'bikeType': 'electric',
			},
			{
				'code': '5BRNS2SR5A',
				'startDate': '2024-01-17T23:23:02Z',
				'endDate': '2024-01-17T23:32:21Z',
				'rating': 5,
				'bikeName': 'E0154',
				'startLocation': '476 - Av. Professor Gama Pinto / Reitoria',
				'endLocation': '484 - Rua Professor Vieira de Almeida',
				'bonus': 10,
				'usedPoints': 0,
				'cost': 0,
				'bikeType': 'electric',
			},
			{
				'code': 'DIIOWVFVSL',
				'startDate': '2024-01-17T19:28:10Z',
				'endDate': '2024-01-17T19:35:16Z',
				'rating': 5,
				'bikeName': 'E1953',
				'startLocation': '483 - Rua Professor Francisco Lucas Pires ',
				'endLocation': '475 - Av. Professor Gama Pinto / Cantina Velha',
				'bonus': 110,
				'usedPoints': 0,
				'cost': 0,
				'bikeType': 'electric',
			},
		],
	};
}

export async function getActiveTripInfo(): Promise<Q<['activeTrip']>> {
	return {
		activeTrip: null,
	};
}