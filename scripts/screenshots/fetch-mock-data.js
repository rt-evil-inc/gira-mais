// Bakes mock-data.json, the fixture the screenshot script serves to the app in
// place of the real APIs.
//
// Only the station data (locations, capacities and the bike list of the station
// the screenshots open) is real, and fetching it needs a GIRA account:
//
//   GIRA_EMAIL=... GIRA_PASSWORD=... node scripts/screenshots/fetch-mock-data.js
//
// Everything about the account — the user, the balance, the subscription and the
// trip history — is made up here, so the screenshots never show anyone's data.
// Run this only when the fixture goes stale; screenshots themselves need no
// credentials.
import { writeFileSync } from 'fs';
import { SCENES } from './config.js';

const AUTH_URL = 'https://c2g091p01.emel.pt/auth';
const GRAPHQL_URL = 'https://c2g091p01.emel.pt/ws/graphql';
const GIRA_MAIS_API_URL = 'https://gira-mais.app/api';
const ROUTING_API_URL = 'https://routing.gira-mais.app';
/** Same area the app limits its searches to (see src/lib/constants.ts). */
const ROUTING_BBOX = '-9.55,38.55,-8.85,38.95';
const USER_AGENT = 'Gira/3.4.3 (Android 34)';

const OUTPUT = new URL('./mock-data.json', import.meta.url);

/** Bikes kept from the station's real bike list — enough to fill the sheet. */
const BIKES_SHOWN = 4;

const MOCK_USER = {
	name: 'João Silva',
	email: 'joao.silva@example.com',
};

const MOCK_ACCOUNT = {
	balance: 0,
	bonus: 3390,
};

const MOCK_SUBSCRIPTION = {
	name: 'Passe Anual',
	type: 'anual',
	subscriptionStatus: 'paid',
	active: true,
	expiresInDays: 214,
};

/** Made-up trips, filled in with the names of real stations. */
const MOCK_TRIPS = [
	{ daysAgo: 1, startTime: '18:32', minutes: 19, bike: 'E0593', bikeType: 'electric', from: '1000307', to: '1000421', bonus: 10, rating: 5 },
	{ daysAgo: 1, startTime: '08:47', minutes: 13, bike: 'E1108', bikeType: 'electric', from: '1000421', to: '1000307', bonus: 110, rating: 5 },
	{ daysAgo: 2, startTime: '19:05', minutes: 24, bike: 'C0217', bikeType: 'classic', from: '1000305', to: '1000219', bonus: 10, rating: 4 },
	{ daysAgo: 2, startTime: '08:52', minutes: 16, bike: 'E0771', bikeType: 'electric', from: '1000219', to: '1000305', bonus: 110, rating: 5 },
	{ daysAgo: 4, startTime: '13:41', minutes: 9, bike: 'E1873', bikeType: 'electric', from: '1000403', to: '1000407', bonus: 10, rating: 5 },
	{ daysAgo: 5, startTime: '17:26', minutes: 31, bike: 'E0264', bikeType: 'electric', from: '1000261', to: '1000211', bonus: 10, rating: 3 },
];

const MOCK_TRIP_CODES = ['6JWFVI9O8N', 'JWA8FQ1PFL', '5BRNS2SR5A', 'DIIOWVFVSL', 'K2QM7XZ4T1', 'P9LDR3VHB6'];

/** The active trip of the trip scene. */
const MOCK_ACTIVE_TRIP = {
	code: 'H7TQ2NMD4V',
	bike: 'E1108',
};

async function main() {
	const email = process.env.GIRA_EMAIL;
	const password = process.env.GIRA_PASSWORD;
	if (!email || !password) throw new Error('Set GIRA_EMAIL and GIRA_PASSWORD to fetch the station data');

	const accessToken = await login(email, password);
	console.log('Logged in');

	const stations = await graphql(accessToken, {
		operationName: 'getStations',
		variables: {},
		query: 'query getStations {getStations {code, description, latitude, longitude, name, bikes, docks, serialNumber, assetStatus }}',
	}).then(data => data.getStations);
	console.log(`Fetched ${stations.length} stations`);

	const station = stations.find(s => s.serialNumber === SCENES.station.stationSerial);
	if (!station) throw new Error(`Station ${SCENES.station.stationSerial} is gone — pick another one in config.js`);
	if (station.assetStatus !== 'active') throw new Error(`${station.name} is ${station.assetStatus} — pick another one in config.js`);
	// The app asks for a station's bikes by serial number, so the fixture is
	// keyed by it too
	const stationInfo = await graphql(accessToken, {
		variables: { input: station.serialNumber },
		query: `query {
			getBikes(input: "${station.serialNumber}") { battery, code, name, kms, serialNumber, type, parent }
			getDocks(input: "${station.serialNumber}") { ledStatus, lockStatus, serialNumber, code, name }
		}`,
	});
	const bikes = (stationInfo.getBikes ?? []).slice(0, BIKES_SHOWN);
	if (bikes.length < 2) throw new Error(`${station.name} only has ${bikes.length} bike(s) — pick a busier station in config.js`);
	// The sheet counts the bikes it lists, so keep the marker's count in step
	station.bikes = bikes.length;
	console.log(`Kept ${bikes.length} of ${stationInfo.getBikes.length} bikes at ${station.name}`);

	const bikeRatings = await fetchBikeRatings(bikes.map(b => b.name));
	const destinations = {
		route: await searchDestination(SCENES.route.destinationQuery),
		trip: await searchDestination(SCENES.trip.destinationQuery),
	};
	const tripPath = await fetchTripPath(destinations.trip.features[0].geometry.coordinates);

	const data = {
		generatedAt: (new Date).toISOString(),
		user: MOCK_USER,
		account: MOCK_ACCOUNT,
		subscription: MOCK_SUBSCRIPTION,
		stations,
		stationInfo: { [station.serialNumber]: { getBikes: bikes, getDocks: stationInfo.getDocks ?? [] } },
		bikeRatings,
		tripHistory: MOCK_TRIPS.map((trip, i) => ({
			...trip,
			code: MOCK_TRIP_CODES[i % MOCK_TRIP_CODES.length],
			from: stationName(stations, trip.from),
			to: stationName(stations, trip.to),
		})),
		activeTrip: { ...MOCK_ACTIVE_TRIP, ...tripPath },
		destinations,
	};

	writeFileSync(OUTPUT, `${JSON.stringify(data, null, '\t')}\n`);
	console.log(`Wrote ${OUTPUT.pathname}`);
}

async function login(email, password) {
	const res = await fetch(`${AUTH_URL}/login`, {
		method: 'POST',
		headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json' },
		body: JSON.stringify({ Provider: 'EmailPassword', CredentialsEmailPassword: { email, password } }),
	});
	const body = await res.json();
	if (body.error?.code !== 0) throw new Error(`Login failed: ${body.error?.message ?? res.status}`);
	return body.data.accessToken;
}

async function graphql(accessToken, body) {
	const res = await fetch(GRAPHQL_URL, {
		method: 'POST',
		headers: {
			'User-Agent': USER_AGENT,
			'content-type': 'application/json',
			'authorization': `Bearer ${accessToken}`,
		},
		body: JSON.stringify(body),
	});
	const json = await res.json();
	if (json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
	return json.data;
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

function stationName(stations, serialNumber) {
	const station = stations.find(s => s.serialNumber === serialNumber);
	if (!station) throw new Error(`Station ${serialNumber} used by the trip history is gone`);
	return station.name;
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