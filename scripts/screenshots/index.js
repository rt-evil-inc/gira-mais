// Takes the app's mobile screenshots.
//
//   node scripts/screenshots/index.js [--locales pt,en] [--themes light,dark]
//                                     [--only station,route] [--out DIR]
//                                     [--url http://localhost:5173] [--headed]
//
// Starts `vite dev`, drives it in a phone-sized Chromium and saves a PNG per
// scene, language and theme. The GIRA APIs are replayed from mock-data.json
// (see fetch-mock-data.js), so no account is needed; map tiles and routes are
// fetched for real.
import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import { mkdirSync, readFileSync } from 'fs';
import { createServer } from 'net';
import { DEVICE, SCENES } from './config.js';
import { installMockApi } from './mock-api.js';

const ROOT = new URL('../../', import.meta.url);
const DEFAULT_OUT_DIR = 'assets/screenshots';
const DEFAULT_LOCALES = ['pt'];
const DEFAULT_THEMES = ['light', 'dark'];
/** Svelte's transitions are driven from JavaScript, so they have to be waited
  * out rather than disabled at screenshot time. */
const UI_SETTLE_ms = 600;
/** Dates and times are shown in the city's timezone, whoever runs this. */
const TIMEZONE = 'Europe/Lisbon';
const BROWSER_LOCALES = { pt: 'pt-PT', en: 'en-GB' };

const data = JSON.parse(readFileSync(new URL('./mock-data.json', import.meta.url), 'utf8'));
const translations = readFileSync(new URL('./src/lib/translations.ts', ROOT), 'utf8');

const scenes = {
	profile: profileScene,
	history: historyScene,
	station: stationScene,
	route: routeScene,
	trip: tripScene,
};

async function main() {
	const options = parseOptions(process.argv.slice(2));
	mkdirSync(options.outDir, { recursive: true });

	const server = options.url ? null : await startDevServer();
	const url = options.url ?? server.url;
	const browser = await chromium.launch({ headless: !options.headed });
	try {
		for (const locale of options.locales) {
			for (const theme of options.themes) {
				const context = await browser.newContext({
					...DEVICE,
					locale: BROWSER_LOCALES[locale],
					timezoneId: TIMEZONE,
					permissions: ['geolocation'],
					colorScheme: theme,
				});
				await context.addInitScript(seedPreferences, { theme, locale });
				for (const name of options.scenes) {
					const start = Date.now();
					const file = `${options.outDir}/${name}-${locale}-${theme}.png`;
					await scenes[name]({ context, url, locale, file });
					console.log(`${file} (${Date.now() - start}ms)`);
				}
				await context.close();
			}
		}
	} finally {
		await browser.close();
		server?.stop();
	}
}

// Scenes

async function profileScene({ context, url, file }) {
	const page = await openApp({ context, url, position: SCENES.station.position, waitForMap: false });
	await openProfile(page);
	await page.waitForTimeout(UI_SETTLE_ms);
	await screenshot(page, file);
	await page.close();
}

async function historyScene({ context, url, locale, file }) {
	const page = await openApp({ context, url, position: SCENES.station.position, waitForMap: false });
	await openProfile(page);
	await page.getByRole('button').filter({ hasText: translate('history_label', locale) }).click();
	// The oldest trip on the list, so none of them is still sliding in
	await page.getByText(data.tripHistory.at(-1).bike).waitFor();
	await page.waitForTimeout(UI_SETTLE_ms);
	await screenshot(page, file);
	await page.close();
}

async function stationScene({ context, url, file }) {
	const scene = SCENES.station;
	const page = await openApp({ context, url, position: scene.position });
	const station = data.stations.find(s => s.serialNumber === scene.stationSerial);
	if (!station) throw new Error(`Station ${scene.stationSerial} is not in mock-data.json`);

	await tapStation(page, station);
	const bikes = data.stationInfo[scene.stationSerial].getBikes;
	for (const bike of bikes) await page.getByText(bike.name).waitFor();
	// The second bike, a quarter of the way towards unlocking, held there for
	// the screenshot
	await holdUnlockSlider(page, 1, 0.25);
	await settleMap(page);
	await page.waitForTimeout(UI_SETTLE_ms);
	await screenshot(page, file);
	await page.mouse.up();
	await page.close();
}

async function routeScene({ context, url, file }) {
	const scene = SCENES.route;
	const page = await openApp({ context, url, position: scene.position, destination: data.destinations.route });
	await searchDestination(page, data.destinations.route);
	await waitForRoute(page);
	await settleMap(page);
	await page.waitForTimeout(UI_SETTLE_ms);
	await screenshot(page, file);
	await page.close();
}

async function tripScene({ context, url, file }) {
	const scene = SCENES.trip;
	const { path, distanceMeters } = data.activeTrip;
	const elapsedSeconds = distanceMeters / 1000 / scene.averageSpeedKmh * 3600;
	const startedAt = Date.now() - elapsedSeconds * 1000;

	const page = await openApp({
		context,
		url,
		position: coord(path[0]),
		trip: { startedAt },
		destination: data.destinations.trip,
	});
	// The plate only comes over the websocket, so it doubles as proof the trip
	// is fully ingested
	await page.getByText(data.activeTrip.bike).waitFor();

	await ride(page, path, startedAt, elapsedSeconds);
	await searchDestination(page, data.destinations.trip);
	await waitForRoute(page);
	await settleMap(page);
	await page.waitForTimeout(UI_SETTLE_ms);
	await screenshot(page, file);
	await page.close();
}

// Driving the app

async function openApp({ context, url, position = null, trip = null, destination = null, waitForMap = true }) {
	const page = await context.newPage();
	page.setDefaultTimeout(30000);
	await installMockApi(page, { data, trip, destination });
	await page.addInitScript(fakeGeolocation, position);
	await page.goto(url);
	// The map handle shows up as soon as the app mounts, before any of its data
	await page.waitForFunction(() => window.map !== undefined, null, { timeout: 60000 });
	if (waitForMap) {
		// The launch screen covers the map until the stations and the style are in
		await page.waitForSelector('.blur', { state: 'detached', timeout: 60000 });
		await collapseAttribution(page);
		await settleMap(page);
	}
	await page.evaluate(() => document.fonts.ready.then(() => undefined));
	return page;
}

/** The round button with the user's initial, top right of the map. */
function openProfile(page) {
	return page.locator('button:has(> svg[viewBox="0 0 192 192"])').click();
}

/** Taps a station's marker. The marker hangs above the station's spot and
  * neighbouring ones can cover it, so this looks for a spot where the app would
  * see this station on top — the same query its own tap handler uses. */
async function tapStation(page, station) {
	const point = await page.evaluate(({ serialNumber, longitude, latitude }) => {
		const { x, y } = window.map.project([longitude, latitude]);
		for (const dy of [45, 35, 55, 25, 65, 15, 5]) {
			for (const dx of [0, -15, 15, -25, 25]) {
				const at = [x + dx, y - dy];
				if (window.map.queryRenderedFeatures(at, { layers: ['points'] })[0]?.properties.serialNumber === serialNumber) {
					return { x: at[0], y: at[1] };
				}
			}
		}
		return null;
	}, station);
	if (!point) throw new Error(`No tappable marker on screen for ${station.name}`);
	await page.mouse.click(point.x, point.y);
}

/** Drags a bike's slider partway and leaves the pointer down: letting go would
  * either snap it back or unlock the bike. */
async function holdUnlockSlider(page, index, fraction) {
	// The only element in the app that pans vertically only — the bike's slider
	const slider = page.locator('.touch-pan-y').nth(index);
	const box = await slider.boundingBox();
	const y = box.y + box.height / 2;
	await page.mouse.move(box.x + box.width / 2, y);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + box.width * fraction, y, { steps: 12 });
}

/** Sets the destination the way a rider would: type it and pick the place out
  * of the results. Stations whose name contains the query are listed above the
  * places, so the row to press is the one named exactly like the geocoder's
  * answer — a station's name always carries its number too. */
async function searchDestination(page, destination) {
	const name = destination.features[0].properties.name;
	const input = page.locator('input[type="text"]');
	await input.click();
	await input.fill(destination.query);
	await page.getByText(name, { exact: true }).first().click();
}

function waitForRoute(page) {
	return page.waitForFunction(() => window.map.queryRenderedFeatures(
		[[0, 0], [window.innerWidth, window.innerHeight]],
		{ layers: ['route-bike', 'route-foot'] },
	).length > 0, null, { timeout: 30000 });
}

/** Replays the fixes of the ride so far. They are dated back to the start of
  * the trip, so the HUD adds up to the distance and pace of a real ride. */
async function ride(page, path, startedAt, elapsedSeconds) {
	for (let i = 1; i < path.length; i++) {
		const progress = i / (path.length - 1);
		await page.evaluate(fix => window.__setPosition(fix), {
			...coord(path[i]),
			heading: bearing(path[i - 1], path[i]),
			speed: 3.9,
			timestamp: startedAt + progress * elapsedSeconds * 1000,
		});
		await page.waitForTimeout(40);
	}
}

async function collapseAttribution(page) {
	const attribution = page.locator('.maplibregl-ctrl-attrib');
	if (await attribution.evaluate(el => el.classList.contains('maplibregl-compact-show'))) {
		await page.locator('.maplibregl-ctrl-attrib-button').click();
	}
	if (await attribution.evaluate(el => el.classList.contains('maplibregl-compact-show'))) {
		throw new Error('The map attribution would not collapse');
	}
}

/** Waits for the camera to stop and every tile to be in, so no screenshot
  * catches the map mid-flight or half drawn. */
async function settleMap(page, { quietMs = 700, timeoutMs = 30000 } = {}) {
	const deadline = Date.now() + timeoutMs;
	let quietSince = null;
	while (Date.now() < deadline) {
		const still = await page.evaluate(() => !window.map.isMoving() && window.map.loaded() && window.map.areTilesLoaded());
		if (!still) quietSince = null;
		else if (quietSince === null) quietSince = Date.now();
		else if (Date.now() - quietSince >= quietMs) return;
		await page.waitForTimeout(100);
	}
	throw new Error('The map never settled');
}

function screenshot(page, file) {
	return page.screenshot({ path: file, animations: 'disabled', caret: 'hide' });
}

// Injected into the page

/** The app reads its settings through @capacitor/preferences, which on the web
  * is localStorage under this prefix. Credentials are only there to get the app
  * past its login screen; the mocked API accepts anything. */
function seedPreferences({ theme, locale }) {
	const preferences = {
		'email': 'screenshots@example.com',
		'password': 'screenshots',
		'settings/theme': theme,
		'settings/locale': locale,
		// Foreground location only: the background watcher is a native plugin
		'settings/backgroundLocation': 'false',
		'settings/analytics': 'false',
		'settings/reportRatings': 'false',
		// Neither the update notice nor the service message may cover the app
		'settings/updateWarning': 'false',
		'lastMessageTimestamp': '2100-01-01T00:00:00Z',
	};
	for (const [key, value] of Object.entries(preferences)) {
		localStorage.setItem(`CapacitorStorage.${key}`, value);
	}
}

/** Stands in for the browser's geolocation, which can only report a spot —
  * the app also needs a heading and a speed to travel with, and the fixes have
  * to be free of the jitter that would blur the screenshots. */
function fakeGeolocation(start) {
	let fix = start;
	const watchers = new Map;
	let nextWatcher = 1;
	const position = () => ({
		coords: {
			latitude: fix.lat,
			longitude: fix.lng,
			accuracy: fix.accuracy ?? 6,
			altitude: null,
			altitudeAccuracy: null,
			heading: fix.heading ?? null,
			speed: fix.speed ?? 0,
		},
		timestamp: fix.timestamp ?? Date.now(),
	});
	window.__setPosition = next => {
		fix = next;
		if (fix) for (const watcher of watchers.values()) watcher(position());
	};
	Object.defineProperty(navigator, 'geolocation', {
		configurable: true,
		value: {
			getCurrentPosition: success => fix && success(position()),
			watchPosition: success => {
				const id = nextWatcher++;
				watchers.set(id, success);
				if (fix) setTimeout(() => success(position()), 0);
				return id;
			},
			clearWatch: id => watchers.delete(id),
		},
	});
}

// Plumbing

/** The screenshots run against `vite dev`: they need the development-only map
  * handle it exposes (see Map.svelte). */
async function startDevServer() {
	const port = await freePort();
	const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'dev', '--port', String(port), '--strictPort'], {
		cwd: ROOT,
		stdio: ['ignore', 'pipe', 'inherit'],
	});
	server.stdout.resume();
	const url = `http://localhost:${port}`;
	const deadline = Date.now() + 60000;
	while (Date.now() < deadline) {
		if (server.exitCode !== null) throw new Error(`vite dev exited with code ${server.exitCode}`);
		try {
			if ((await fetch(url)).ok) {
				console.log(`Serving ${url}`);
				return { url, stop: () => server.kill() };
			}
		} catch {
			// not up yet
		}
		await new Promise(resolve => setTimeout(resolve, 200));
	}
	server.kill();
	throw new Error('vite dev never came up');
}

function freePort() {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.on('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address();
			probe.close(() => resolve(port));
		});
	});
}

/** Reads a label straight out of the app's translations, so the buttons the
  * script presses are found by the same text the app shows. */
function translate(key, locale) {
	const entry = translations.match(new RegExp(`\\n\\t${key}: \\{[^}]*\\n\\t\\t${locale}: '((?:[^'\\\\]|\\\\.)*)'`));
	if (!entry) throw new Error(`No ${locale} translation for ${key}`);
	return entry[1];
}

function coord([lng, lat]) {
	return { lat, lng };
}

function bearing([lng1, lat1], [lng2, lat2]) {
	const east = (lng2 - lng1) * Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
	return (Math.atan2(east, lat2 - lat1) * 180 / Math.PI + 360) % 360;
}

function parseOptions(argv) {
	const options = {
		locales: DEFAULT_LOCALES,
		themes: DEFAULT_THEMES,
		scenes: Object.keys(scenes),
		outDir: DEFAULT_OUT_DIR,
		url: null,
		headed: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const value = argv[i + 1];
		switch (argv[i]) {
		case '--locales': options.locales = list(value, Object.keys(BROWSER_LOCALES), 'locale'); i++; break;
		case '--themes': options.themes = list(value, DEFAULT_THEMES, 'theme'); i++; break;
		case '--only': options.scenes = list(value, Object.keys(scenes), 'scene'); i++; break;
		case '--out': options.outDir = value; i++; break;
		case '--url': options.url = value; i++; break;
		case '--headed': options.headed = true; break;
		default: throw new Error(`Unknown option ${argv[i]}`);
		}
	}
	return options;
}

function list(value, allowed, what) {
	const values = (value ?? '').split(',').filter(Boolean);
	if (values.length === 0) throw new Error(`Name at least one ${what}`);
	for (const entry of values) {
		if (!allowed.includes(entry)) throw new Error(`Unknown ${what} "${entry}" (try ${allowed.join(', ')})`);
	}
	return values;
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});