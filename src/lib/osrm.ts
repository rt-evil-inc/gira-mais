import { CapacitorHttp } from '@capacitor/core';
import { ROUTING_API_URL } from '$lib/constants';

export type Coord = { lat: number, lng: number };
export type OsrmProfile = 'foot'|'bike';
export type OsrmDurationMatrix = (number|null)[][];

type OsrmWaypoint = {
	hint: string,
	location: [number, number],
	name: string,
	distance: number,
};

export type OsrmRoute = {
	distance: number,
	duration: number,
	geometry: { type: 'LineString', coordinates: [number, number][] },
	weight: number,
	weight_name: string,
	legs: unknown[],
};

type OsrmErrorResponse = {
	code:
		| 'InvalidUrl'
		| 'InvalidService'
		| 'InvalidVersion'
		| 'InvalidOptions'
		| 'InvalidQuery'
		| 'InvalidValue'
		| 'NoSegment'
		| 'TooBig'
		| 'DisabledDataset'
		| 'NoRoute'
		| 'NoTable'
		| 'NotImplemented',
	message?: string,
	data_version?: string,
};

type OsrmRouteResponse = {
	code: 'Ok',
	routes: OsrmRoute[],
	waypoints: OsrmWaypoint[],
	data_version?: string,
};

type OsrmTableResponse = {
	code: 'Ok',
	durations: OsrmDurationMatrix,
	sources: OsrmWaypoint[],
	destinations: OsrmWaypoint[],
	data_version?: string,
};

const OSRM_ATTEMPTS = 3;

/** GET an OSRM endpoint, retrying transient failures: network errors, timeouts
  * and 5xx responses (e.g. a 502 while the routing server restarts). Throws if
  * they persist, so a failed request is never mistaken for "no route exists".
  * Legitimate routing errors (4xx, code !== 'Ok') are returned, not retried. */
async function osrmGet<T extends OsrmRouteResponse|OsrmTableResponse>(url: string): Promise<T|OsrmErrorResponse> {
	for (let attempt = 1; ; attempt++) {
		try {
			const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out')), 5000));
			const res = await Promise.race([
				CapacitorHttp.get({ url, readTimeout: 5000, connectTimeout: 5000 }),
				timeoutPromise,
			]);
			if (res.status >= 500) throw new Error(`Routing server error ${res.status}`);
			return res.data as T|OsrmErrorResponse;
		} catch (e) {
			if (attempt >= OSRM_ATTEMPTS) throw e;
			console.warn(`Routing request failed (attempt ${attempt}/${OSRM_ATTEMPTS})`, e);
			await new Promise(resolve => setTimeout(resolve, 300 * attempt));
		}
	}
}

export async function osrmRoute(profile: OsrmProfile, from: Coord, to: Coord): Promise<OsrmRoute|null> {
	const url = `${ROUTING_API_URL}/${profile}/route/v1/-/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false&alternatives=false`;
	const data = await osrmGet<OsrmRouteResponse>(url);
	if (data.code !== 'Ok' || data.routes.length === 0) return null;
	return data.routes[0];
}

/** Returns travel durations in seconds, indexed by source and destination. */
export async function osrmTable(profile: OsrmProfile, sources: Coord[], destinations: Coord[]): Promise<OsrmDurationMatrix|null> {
	const coords = [...sources, ...destinations].map(c => `${c.lng},${c.lat}`).join(';');
	const sourceIdxs = sources.map((_, i) => i).join(';');
	const destinationIdxs = destinations.map((_, i) => i + sources.length).join(';');
	const url = `${ROUTING_API_URL}/${profile}/table/v1/-/${coords}?sources=${sourceIdxs}&destinations=${destinationIdxs}`;
	const data = await osrmGet<OsrmTableResponse>(url);
	if (data.code !== 'Ok') return null;
	return data.durations;
}