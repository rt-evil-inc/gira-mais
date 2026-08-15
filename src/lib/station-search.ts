import type { StationInfo } from '$lib/map.svelte';
import type { Coord } from '$lib/routing';
import { distanceBetweenCoords } from '$lib/utils';

const MAX_STATION_RESULTS = 3;

function normalize(text: string) {
	return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Case- and accent-insensitive search over the in-memory stations by name
  * (which includes the station number), ranked by how early the match occurs
  * and then by proximity to the bias location. */
export function searchStations(stations: StationInfo[], query: string, bias?: Coord|null): StationInfo[] {
	const normalizedQuery = normalize(query.trim());
	if (normalizedQuery.length === 0) return [];
	return stations
		.filter(station => station.assetStatus === 'active')
		.map(station => ({ station, index: normalize(station.name).indexOf(normalizedQuery) }))
		.filter(({ index }) => index !== -1)
		.sort((a, b) => a.index - b.index || (bias ?
			distanceBetweenCoords(bias.lat, bias.lng, a.station.latitude, a.station.longitude) -
			distanceBetweenCoords(bias.lat, bias.lng, b.station.latitude, b.station.longitude) : 0))
		.slice(0, MAX_STATION_RESULTS)
		.map(({ station }) => station);
}