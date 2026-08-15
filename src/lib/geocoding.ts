import { CapacitorHttp } from '@capacitor/core';
import { ROUTING_API_URL, ROUTING_BBOX } from '$lib/constants';
import type { Coord } from '$lib/routing';

export type GeocodingResult = {
	name: string,
	detail: string,
	lat: number,
	lng: number,
};

type PhotonFeature = {
	geometry: { coordinates: [number, number] },
	properties: {
		name?: string,
		street?: string,
		housenumber?: string,
		locality?: string,
		district?: string,
		city?: string,
	},
};

function featureName(props: PhotonFeature['properties']): string|null {
	if (props.name) return props.name;
	if (props.street) return props.housenumber ? `${props.street} ${props.housenumber}` : props.street;
	return null;
}

function featureDetail(props: PhotonFeature['properties']): string {
	const name = featureName(props);
	return [props.street !== name ? props.street : null, props.locality, props.district, props.city]
		.filter((part, i, parts) => part && part !== name && parts.indexOf(part) === i)
		.join(', ');
}

export async function searchLocations(query: string, bias?: Coord|null): Promise<GeocodingResult[]> {
	const params: Record<string, string> = {
		q: query,
		limit: '6',
		bbox: ROUTING_BBOX.join(','),
	};
	if (bias) {
		params.lat = bias.lat.toString();
		params.lon = bias.lng.toString();
	}
	const res = await CapacitorHttp.get({
		url: `${ROUTING_API_URL}/geocode/api`,
		params,
		readTimeout: 5000,
		connectTimeout: 5000,
	});
	const features = (res.data?.features ?? []) as PhotonFeature[];
	return features
		.map(f => {
			const name = featureName(f.properties);
			return name ? {
				name,
				detail: featureDetail(f.properties),
				lat: f.geometry.coordinates[1],
				lng: f.geometry.coordinates[0],
			} : null;
		})
		.filter((r): r is GeocodingResult => r !== null);
}

export async function reverseGeocode(coord: Coord): Promise<string|null> {
	try {
		const res = await CapacitorHttp.get({
			url: `${ROUTING_API_URL}/geocode/reverse`,
			params: { lat: coord.lat.toString(), lon: coord.lng.toString(), limit: '1' },
			readTimeout: 5000,
			connectTimeout: 5000,
		});
		const feature = (res.data?.features ?? [])[0] as PhotonFeature|undefined;
		return feature ? featureName(feature.properties) : null;
	} catch (e) {
		console.error('Reverse geocoding failed', e);
		return null;
	}
}