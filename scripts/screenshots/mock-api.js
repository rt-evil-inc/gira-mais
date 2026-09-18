// Puts the app on the fixture instead of the real backends, so the screenshots
// need no account and always show the same city, the same bikes and the same
// trips. The routing server (OSRM) is left alone: routes and map tiles are
// fetched for real.
//
// Since the VAIMOO migration the app gets its stations and bikes from Firestore
// listeners rather than HTTP calls, so there is no request to answer. What is
// replaced instead are the two modules that talk to VAIMOO — the API client and
// the Firestore queries: `vite dev` serves every source file to the browser on
// its own, so serving those two from scripts/screenshots/page/ puts the fixture
// underneath the whole app. What is still HTTP — the geocoder and the Gira+ API
// — is answered request by request.

import { readFileSync } from 'fs';

/** Where `vite dev` serves the modules that are replaced, and with what. */
const PAGE_MODULES = {
	'/src/lib/vaimoo-api/client.ts': new URL('./page/vaimoo-client.js', import.meta.url),
	'/src/lib/vaimoo-api/firestore.ts': new URL('./page/vaimoo-firestore.js', import.meta.url),
};

// In development the Gira+ API is reached through Vite's proxy, so it is
// same-origin rather than the address it has in a release build
const GIRA_MAIS_URL = /(^https:\/\/gira-mais\.app|\/__dev-proxy\/gira-mais)\/api\//;
const GEOCODE_URL = /^https:\/\/routing\.gira-mais\.app\/geocode\//;
const GITHUB_RELEASES_URL = /^https:\/\/api\.github\.com\//;

/**
 * @param page          the page to intercept requests from, before it navigates
 * @param data          the parsed mock-data.json
 * @param trip          an active trip as `{ startedAt }`, or null for none
 * @param destination   the geocoder answer to replay, or null to find nothing
 */
export async function installMockApi(page, { data, trip = null, destination = null }) {
	// The replaced modules read this, so it has to be in place before the app
	// is served, let alone runs
	await page.addInitScript(mocks => window.__giraMocks = mocks, { data, trip });

	for (const [path, source] of Object.entries(PAGE_MODULES)) {
		const body = readFileSync(source, 'utf8');
		await page.route(url => url.pathname === path, route => route.fulfill({ contentType: 'text/javascript', body }));
	}

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
}

// Everything the app sends goes through @capacitor/core's HTTP plugin, which on
// the web is a plain cross-origin fetch — hence the CORS headers and the
// preflight replies.

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