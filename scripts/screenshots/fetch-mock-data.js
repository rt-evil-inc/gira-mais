// Bakes mock-data.json, the fixture the screenshot script puts underneath the
// app in place of the real backends.
//
//   node scripts/screenshots/fetch-mock-data.js
//
// Only the station data (locations, capacities and the bike list of the station
// the screenshots open) is real. It comes out of the same Firestore collections
// the app reads, which are readable with the VAIMOO app's public credentials,
// so no GIRA account is needed. Everything about the account — the user, the
// balance, the subscription and the trip history — is made up here, so the
// screenshots never show anyone's data.
import { writeFileSync } from 'fs';
import { SCENES } from './config.js';

// Public client credentials of the official VAIMOO app, and the tenant that
// scopes GIRA's data in it (see src/lib/vaimoo-api/firestore.ts)
const FIRESTORE_URL = 'https://firestore.googleapis.com/v1/projects/vaimoorotterdam/databases/(default)/documents:runQuery';
const FIRESTORE_API_KEY = 'AIzaSyAmKfHdjYUhzYmg7qSZtRwwYE92HQQlmJ4';
const GIRA_TENANT = 'P1/EML/EML/';

const GIRA_MAIS_API_URL = 'https://gira-mais.app/api';
const ROUTING_API_URL = 'https://routing.gira-mais.app';
/** Same area the app limits its searches to (see src/lib/constants.ts). */
const ROUTING_BBOX = '-9.55,38.55,-8.85,38.95';

const OUTPUT = new URL('./mock-data.json', import.meta.url);

/** Bikes kept from the station's real bike list — enough to fill the sheet. */
const BIKES_SHOWN = 4;

const MOCK_USER = {
	userId: 700001,
	firstName: 'João',
	lastName: 'Silva',
	userName: 'joao.silva',
	email: 'joao.silva@example.com',
	tenantId: GIRA_TENANT,
};

const MOCK_WALLET = { remainingCredit: 0 };

const MOCK_SUBSCRIPTION = {
	name: 'Passe Anual',
	membershipType: 'anual',
	expiresInDays: 214,
};

/** Made-up trips, filled in with the names of real stations. Stations are named
  * by the number they carry in the app, which is the head of their name. */
const MOCK_TRIPS = [
	{ daysAgo: 1, startTime: '18:32', minutes: 19, bike: 'E0593', from: '307', to: '421', distanceMeters: 3980 },
	{ daysAgo: 1, startTime: '08:47', minutes: 13, bike: 'E1108', from: '421', to: '307', distanceMeters: 3870 },
	{ daysAgo: 2, startTime: '19:05', minutes: 24, bike: 'C0217', from: '305', to: '219', distanceMeters: 2640 },
	{ daysAgo: 2, startTime: '08:52', minutes: 16, bike: 'E0771', from: '219', to: '305', distanceMeters: 2710 },
	{ daysAgo: 4, startTime: '13:41', minutes: 9, bike: 'E1873', from: '403', to: '407', distanceMeters: 1120 },
	{ daysAgo: 5, startTime: '17:26', minutes: 31, bike: 'E0264', from: '261', to: '211', distanceMeters: 4530 },
];

const MOCK_TRIP_IDS = [2058311, 2057964, 2055102, 2054778, 2049213, 2046840];

/** The active trip of the trip scene. */
const MOCK_ACTIVE_TRIP = {
	tripId: 2059724,
	bikeId: 25837,
	bike: 'E1108',
	communicationId: '7F2E0D14AC',
	category: 'E-Bike',
	battery: 78,
};

async function main() {
	const stations = await firestore('docking-stations');
	console.log(`Fetched ${stations.length} stations`);

	const station = stations.find(s => s.DockingStationId === SCENES.station.stationId);
	if (!station) throw new Error(`Station ${SCENES.station.stationId} is gone — pick another one in config.js`);
	if (!station.IsActive || station.ServiceStatus !== 'AVAILABLE') {
		throw new Error(`${station.Name} is ${station.ServiceStatus} — pick another one in config.js`);
	}

	const parked = await firestore('bikes', { field: 'DockingStationId', value: { integerValue: String(station.DockingStationId) } });
	// The same bikes the app would list: the sheet leaves out anything booked,
	// out of service or without a lock to talk to
	const bikes = parked
		.filter(bike => bike.IsAvaliable && !bike.IsBooked && bike.CommunicationId)
		.sort((a, b) => dockOrder(a.DockingPointVisualId) - dockOrder(b.DockingPointVisualId))
		.slice(0, BIKES_SHOWN);
	if (bikes.length < 2) throw new Error(`${station.Name} only has ${bikes.length} bike(s) — pick a busier station in config.js`);
	// The sheet counts the bikes it lists, so keep the marker's count in step
	station.AvailableBikes = bikes.length;
	console.log(`Kept ${bikes.length} of ${parked.length} bikes at ${station.Name}`);

	const bikeRatings = await fetchBikeRatings(bikes.map(b => b.VisualId));
	const destinations = {
		route: await searchDestination(SCENES.route.destinationQuery),
		trip: await searchDestination(SCENES.trip.destinationQuery),
	};
	const tripPath = await fetchTripPath(destinations.trip.features[0].geometry.coordinates);

	const data = {
		generatedAt: (new Date).toISOString(),
		user: MOCK_USER,
		wallet: MOCK_WALLET,
		subscription: MOCK_SUBSCRIPTION,
		stations,
		stationBikes: { [station.DockingStationId]: bikes },
		bikeRatings,
		tripHistory: MOCK_TRIPS.map((trip, i) => {
			const from = namedStation(stations, trip.from);
			const to = namedStation(stations, trip.to);
			return {
				...trip,
				tripId: MOCK_TRIP_IDS[i % MOCK_TRIP_IDS.length],
				category: trip.bike.startsWith('E') ? 'E-Bike' : 'Bike',
				from: from.Name,
				fromId: from.DockingStationId,
				to: to.Name,
				toId: to.DockingStationId,
			};
		}),
		activeTrip: { ...MOCK_ACTIVE_TRIP, ...tripPath },
		destinations,
	};

	writeFileSync(OUTPUT, `${JSON.stringify(data, null, '\t')}\n`);
	console.log(`Wrote ${OUTPUT.pathname}`);
}

/** Every document of a tenant's collection, optionally narrowed by one field.
  * Firestore's REST API answers the same queries the app's listeners run. */
async function firestore(collectionId, extraFilter = null) {
	const filters = [{ fieldFilter: { field: { fieldPath: 'Tenant' }, op: 'EQUAL', value: { stringValue: GIRA_TENANT } } }];
	if (extraFilter) {
		filters.push({ fieldFilter: { field: { fieldPath: extraFilter.field }, op: 'EQUAL', value: extraFilter.value } });
	}
	const res = await fetch(`${FIRESTORE_URL}?key=${FIRESTORE_API_KEY}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			structuredQuery: {
				from: [{ collectionId }],
				where: { compositeFilter: { op: 'AND', filters } },
			},
		}),
	});
	const body = await res.json();
	if (!Array.isArray(body)) throw new Error(`Firestore refused the query: ${JSON.stringify(body)}`);
	return body.filter(entry => entry.document).map(entry => decodeFields(entry.document.fields));
}

/** Firestore's REST API tags every value with its type; the SDK the app uses
  * hands the documents over as plain objects, so unwrap them the same way. */
function decodeFields(fields) {
	return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function decodeValue(value) {
	const [type, raw] = Object.entries(value)[0];
	switch (type) {
	case 'integerValue': case 'doubleValue': return Number(raw);
	case 'nullValue': return null;
	case 'geoPointValue': return { latitude: raw.latitude ?? 0, longitude: raw.longitude ?? 0 };
	case 'arrayValue': return (raw.values ?? []).map(decodeValue);
	case 'mapValue': return decodeFields(raw.fields ?? {});
	default: return raw;
	}
}

function dockOrder(dock) {
	const number = dock == null ? NaN : parseInt(dock, 10);
	return Number.isNaN(number) ? Number.POSITIVE_INFINITY : number;
}

/** Real community ratings for the bikes on show, with the unrated ones filled
  * in from their id so the sheet consistently shows what the feature looks
  * like. */
async function fetchBikeRatings(bikeIds) {
	const url = `${GIRA_MAIS_API_URL}/statistics/ratings/station?bikes=${bikeIds.map(encodeURIComponent).join(',')}`;
	const res = await fetch(url, { headers: { 'User-Agent': 'Gira+/screenshots' } });
	const fetched = res.ok ? await res.json() : {};
	const ratings = {};
	for (const id of bikeIds) {
		const rating = fetched[id] ?? null;
		// 3 to 5, from the digits of the plate
		ratings[id] = rating ?? 3 + Number(id.replace(/\D/g, '')) % 3;
	}
	console.log('Bike ratings', ratings);
	return ratings;
}

/** The part of the trip the rider has already covered: the beginning of the
  * bike route to their destination. The rest is computed by the app. */
async function fetchTripPath([destinationLng, destinationLat]) {
	const { start, traveledFraction } = SCENES.trip;
	const url = `${ROUTING_API_URL}/bike/route/v1/-/${start.lng},${start.lat};${destinationLng},${destinationLat}` +
		'?overview=full&geometries=geojson&steps=false&alternatives=false';
	const res = await fetch(url);
	const body = await res.json();
	if (body.code !== 'Ok' || !body.routes?.length) throw new Error(`Routing failed: ${body.code}`);

	const coordinates = body.routes[0].geometry.coordinates;
	const total = pathLength(coordinates);
	const traveled = [coordinates[0]];
	let distance = 0;
	for (let i = 1; i < coordinates.length && distance < total * traveledFraction; i++) {
		distance += metersBetween(coordinates[i - 1], coordinates[i]);
		traveled.push(coordinates[i]);
	}
	console.log(`Traveled path: ${traveled.length} points, ${Math.round(distance)}m of ${Math.round(total)}m`);
	return { path: traveled, distanceMeters: Math.round(distance) };
}

/** The geocoder's answer for a destination, replayed later so the search box
  * always finds the same place. Its first result is where the scene's route
  * ends. */
async function searchDestination(query) {
	const params = new URLSearchParams({ q: query, limit: '3', bbox: ROUTING_BBOX });
	const res = await fetch(`${ROUTING_API_URL}/geocode/api?${params}`);
	const body = await res.json();
	const features = body.features ?? [];
	if (features.length === 0) throw new Error(`The geocoder found nothing for "${query}"`);
	const [lng, lat] = features[0].geometry.coordinates;
	console.log(`"${query}" is ${features[0].properties.name} at ${lat},${lng}`);
	return { query, features };
}

function namedStation(stations, number) {
	const station = stations.find(s => s.Name.startsWith(`${number} -`));
	if (!station) throw new Error(`Station ${number} used by the trip history is gone`);
	return station;
}

function pathLength(coordinates) {
	let total = 0;
	for (let i = 1; i < coordinates.length; i++) total += metersBetween(coordinates[i - 1], coordinates[i]);
	return total;
}

function metersBetween([lng1, lat1], [lng2, lat2]) {
	const latitudeMeters = (lat2 - lat1) * 111320;
	const longitudeMeters = (lng2 - lng1) * 111320 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
	return Math.hypot(latitudeMeters, longitudeMeters);
}

main().catch(error => {
	console.error(error.message);
	process.exit(1);
});