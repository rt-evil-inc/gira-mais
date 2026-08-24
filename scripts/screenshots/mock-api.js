// Serves mock-data.json to the app in place of the GIRA, Gira+ and geocoding
// APIs, so the screenshots don't need an account and always show the same city.
// The routing server (OSRM) is left alone: routes and map tiles are fetched for
// real.
//
// Everything goes through @capacitor/core's HTTP plugin, which on the web is a
// plain cross-origin fetch — hence the CORS headers and the preflight replies.

const EMEL_URL = /^https:\/\/c2g091p01\.emel\.pt\//;
const GIRA_MAIS_URL = /^https:\/\/gira-mais\.app\/api\//;
const GEOCODE_URL = /^https:\/\/routing\.gira-mais\.app\/geocode\//;
const GITHUB_RELEASES_URL = /^https:\/\/api\.github\.com\//;
const TRIP_WEBSOCKET_URL = 'wss://c2g091p01.emel.pt/ws/graphql';

const TOKEN_LIFETIME_ms = 60 * 60 * 1000;

/**
 * @param page          the page to intercept requests from, before it navigates
 * @param data          the parsed mock-data.json
 * @param trip          an active trip as `{ startedAt }`, or null for none
 * @param destination   the geocoder answer to replay, or null to find nothing
 */
export async function installMockApi(page, { data, trip = null, destination = null }) {
	await page.route(EMEL_URL, route => {
		const request = route.request();
		if (request.method() === 'OPTIONS') return preflight(route);
		const url = new URL(request.url());
		if (url.pathname === '/auth/login' || url.pathname === '/auth/token/refresh') {
			return json(route, { error: success(), data: tokens() });
		}
		if (url.pathname === '/auth/user') {
			return json(route, { error: success(), data: data.user });
		}
		if (url.pathname.endsWith('/graphql')) {
			const body = request.postDataJSON();
			return json(route, { data: resolveGraphql(body, { data, trip }) });
		}
		return route.fulfill({ status: 404, headers: corsHeaders(request), body: '{}' });
	});

	await page.route(GIRA_MAIS_URL, route => {
		const request = route.request();
		if (request.method() === 'OPTIONS') return preflight(route);
		const url = new URL(request.url());
		if (url.pathname.endsWith('/message')) {
			// Dated before the app's own "last seen" marker, so no notice is shown
			return json(route, { message: '', timestamp: '1970-01-01T00:00:00Z', showAlways: false });
		}
		if (url.pathname.endsWith('/ratings/station')) {
			const bikes = (url.searchParams.get('bikes') ?? '').split(',');
			return json(route, Object.fromEntries(bikes.map(bike => [bike, data.bikeRatings[bike] ?? null])));
		}
		// Usage, error and rating reports: accept and drop
		return route.fulfill({ status: 204, headers: corsHeaders(request) });
	});

	await page.route(GEOCODE_URL, route => {
		const request = route.request();
		if (request.method() === 'OPTIONS') return preflight(route);
		return json(route, { features: destination?.features ?? [] });
	});

	// The app compares the latest release with its own version to offer an
	// update; the screenshots are of the current version
	await page.route(GITHUB_RELEASES_URL, route => json(route, { tag_name: 'v0.0.0' }));

	await page.routeWebSocket(TRIP_WEBSOCKET_URL, ws => {
		ws.onMessage(raw => {
			const message = JSON.parse(String(raw));
			if (message.type === 'connection_init') {
				ws.send(JSON.stringify({ type: 'connection_ack' }));
			} else if (message.type === 'start' && message.payload?.operationName === 'activeTripSubscription' && trip) {
				// Like the real server, which replays the current trip on subscribe.
				// This is where the bike's plate comes from — the REST trip has none
				ws.send(JSON.stringify({
					id: message.id,
					type: 'data',
					payload: { data: { activeTripSubscription: tripSubscription(data, trip) } },
				}));
			}
		});
	});
}

function resolveGraphql(body, { data, trip }) {
	const query = String(body?.query ?? '');
	const variables = body?.variables ?? {};
	const result = {};

	if (query.includes('getStations')) result.getStations = data.stations;
	if (query.includes('client {')) result.client = [data.account];
	if (query.includes('activeUserSubscriptions')) result.activeUserSubscriptions = [subscription(data)];
	if (query.includes('activeTrip {')) result.activeTrip = activeTrip(data, trip);
	// Nothing waiting to be rated, so the rating sheet stays out of the way
	if (query.includes('unratedTrips')) result.unratedTrips = [];
	if (query.includes('tripHistory')) result.tripHistory = tripHistory(data, pageOf(query, variables));
	if (query.includes('getBikes')) result.getBikes = stationInfo(data, query).getBikes;
	if (query.includes('getDocks')) result.getDocks = stationInfo(data, query).getDocks;

	if (query.includes('reserveBike')) result.reserveBike = true;
	if (query.includes('cancelBikeReserve')) result.cancelBikeReserve = true;
	if (query.includes('startTrip')) result.startTrip = true;
	if (query.includes('rateTrip')) result.rateTrip = true;
	if (query.includes('tripPayWithPoints')) result.tripPayWithPoints = 0;
	if (query.includes('tripPayWithNoPoints')) result.tripPayWithNoPoints = 0;

	return result;
}

function stationInfo(data, query) {
	const serialNumber = query.match(/get(?:Bikes|Docks)\(input: "([^"]+)"\)/)?.[1];
	return data.stationInfo[serialNumber] ?? { getBikes: [], getDocks: [] };
}

/** Both the paged history and the one-line summary in the startup query. */
function pageOf(query, variables) {
	const inline = query.match(/_pageNum: (\d+), _pageSize: (\d+)/);
	const pageNum = Number(variables.input?._pageNum ?? inline?.[1] ?? 1);
	const pageSize = Number(variables.input?._pageSize ?? inline?.[2] ?? 15);
	return { offset: Math.max(0, pageNum - 1) * pageSize, pageSize };
}

function tripHistory(data, { offset, pageSize }) {
	return data.tripHistory.slice(offset, offset + pageSize).map(trip => {
		const startDate = daysAgoAt(trip.daysAgo, trip.startTime);
		const endDate = new Date(startDate.getTime() + trip.minutes * 60 * 1000);
		return {
			code: trip.code,
			startDate: startDate.toISOString(),
			endDate: endDate.toISOString(),
			rating: trip.rating,
			bikeName: trip.bike,
			bikeType: trip.bikeType,
			startLocation: trip.from,
			endLocation: trip.to,
			bonus: trip.bonus,
			usedPoints: 0,
			cost: 0,
		};
	});
}

/** Dates are built in UTC so the history is the same wherever this runs; the
  * app shows them in the timezone the browser is emulating. */
function daysAgoAt(daysAgo, time) {
	const [hours, minutes] = time.split(':').map(Number);
	const day = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
	return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours, minutes));
}

function subscription(data) {
	const { expiresInDays, ...rest } = data.subscription;
	return { ...rest, expirationDate: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() };
}

function activeTrip(data, trip) {
	if (!trip) return null;
	return {
		code: data.activeTrip.code,
		asset: data.activeTrip.bike,
		startDate: new Date(trip.startedAt).toISOString(),
		endDate: null,
		startLocation: null,
		endLocation: null,
		distance: 0,
		rating: null,
		cost: 0,
		costBonus: 0,
		tripStatus: 'started',
	};
}

function tripSubscription(data, trip) {
	return {
		code: data.activeTrip.code,
		bike: data.activeTrip.bike,
		startDate: new Date(trip.startedAt).toISOString(),
		endDate: null,
		cost: 0,
		finished: false,
		canPayWithMoney: false,
		canUsePoints: false,
		clientPoints: data.account.bonus,
		tripPoints: 0,
		canceled: false,
		period: 'FREE',
		periodTime: '00:45:00',
		error: 0,
	};
}

/** The app only reads the expiry out of the access token, but it does read it
  * out of a real JWT's payload, so hand it something shaped like one. */
function tokens() {
	const payload = {
		jti: 'screenshots',
		sub: 'screenshots',
		loginProvider: 'EmailPassword',
		services: [],
		nbf: Math.floor(Date.now() / 1000),
		exp: Math.floor((Date.now() + TOKEN_LIFETIME_ms) / 1000),
		iat: Math.floor(Date.now() / 1000),
		iss: 'screenshots',
		aud: 'screenshots',
	};
	const accessToken = ['e30', Buffer.from(JSON.stringify(payload)).toString('base64'), 'signature'].join('.');
	return { accessToken, refreshToken: accessToken, expiration: payload.exp };
}

function success() {
	return { code: 0, message: 'Success' };
}

function corsHeaders(request) {
	return {
		'access-control-allow-origin': '*',
		'access-control-allow-methods': '*',
		'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '*',
	};
}

function preflight(route) {
	return route.fulfill({ status: 204, headers: corsHeaders(route.request()) });
}

function json(route, body) {
	return route.fulfill({ headers: corsHeaders(route.request()), json: body });
}