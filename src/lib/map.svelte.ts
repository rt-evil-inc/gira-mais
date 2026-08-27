import { get, writable } from 'svelte/store';
import { navigationMarker, pulsingDot } from '$lib/pulsing-dot';
import type { GeoJSON } from 'geojson';
import { getCssVariable } from '$lib/utils';
import { theme } from '$lib/theme';
import maplibregl, { type ExpressionSpecification } from 'maplibre-gl';
import { currentPos } from '$lib/location';

export type StationInfo ={
	code: string;
	name: string;
	description: string|null;
	latitude: number;
	longitude: number;
	bikes: number;
	docks: number;
	serialNumber: string;
	assetStatus: string;
}

export const stations = $state<{value:StationInfo[]}>({ value: [] });
export const selectedStation = writable<string|null>(null);
export const following = writable<boolean>(false);
/** While following: 'north' is the classic top-down view, 'heading' the tilted
 * navigation view that rotates with the traveling direction (trips only). */
export const viewMode = writable<'north'|'heading'>('north');

export function setSourceData(map: maplibregl.Map) {
	const src = map.getSource('points');

	const data: GeoJSON = {
		'type': 'FeatureCollection',
		'features': stations.value.map(station => ({
			type: 'Feature',
			properties: {
				code: station.code,
				serialNumber: station.serialNumber,
				name: station.name,
				bikes: station.bikes,
				selected: station.serialNumber == get(selectedStation),
				inService: station.assetStatus === 'active',
				docks: station.docks,
				freeDocks: station.docks - station.bikes,
			},
			geometry: {
				type: 'Point',
				coordinates: [station.longitude, station.latitude],
			},
		})),
	};
	if (src instanceof maplibregl.GeoJSONSource) {
		src.setData(data);
	} else {
		map.addSource('points', {
			'type': 'geojson',
			'data': data,
		});
	}
	const userSrc = map.getSource('user-location');

	const pos = get(currentPos);
	const userLocationData:GeoJSON.GeoJSON = pos ? {
		'type': 'FeatureCollection',
		'features': [{
			type: 'Feature',
			properties: {},
			geometry: {
				type: 'Point',
				coordinates: [pos.coords.longitude, pos.coords.latitude],
			},
		}],
	} : { type: 'FeatureCollection', features: [] };
	if (!(userSrc instanceof maplibregl.GeoJSONSource)) {
		map.addSource('user-location', {
			'type': 'geojson',
			'data': userLocationData,
		});
	}

	const tripSrc = map.getSource('trip-path');
	if (!(tripSrc instanceof maplibregl.GeoJSONSource)) {
		map.addSource('trip-path', {
			'type': 'geojson',
			'data': {
				type: 'Feature',
				properties: {},
				geometry: {
					type: 'LineString',
					coordinates: [],
				},
			},
		});
	}

	const routeSrc = map.getSource('route');
	if (!(routeSrc instanceof maplibregl.GeoJSONSource)) {
		map.addSource('route', {
			'type': 'geojson',
			'data': { type: 'FeatureCollection', features: [] },
		});
	}
	const routeDestSrc = map.getSource('route-destination');
	if (!(routeDestSrc instanceof maplibregl.GeoJSONSource)) {
		map.addSource('route-destination', {
			'type': 'geojson',
			'data': { type: 'FeatureCollection', features: [] },
		});
	}
}

export async function loadSvg(url: string, replaces?:Record<string, string>): Promise<HTMLImageElement> {
	let svgData = await (await fetch(url)).text();
	return new Promise((resolve, reject) => {
		if (replaces) {
			for (const [key, value] of Object.entries(replaces)) {
				svgData = svgData.replace(new RegExp('{' + key + '}', 'g'), value);
			}
		}
		const img = new Image;
		img.onload = _ => resolve(img);
		img.onerror = reject;
		img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
	});
}

/** At low zoom stations are drawn as small dots instead of full markers, so a
 * zoomed-out map (e.g. framing a computed route) isn't buried under pins.
 * Over this zoom range the dots fade out while the pins grow in from dot size. */
export const STATION_MARKER_FADE_START = 13.5;
export const STATION_MARKER_FADE_END = 14;

/** Dot for a station at low zoom: filled accent when it has something to
 * offer (bikes or free docks, depending on the trip state), hollow when in
 * service but empty, muted when out of service — matching the pins, which are
 * only gray when out of service. */
export function stationDotColor(countProp: 'bikes'|'freeDocks'): ExpressionSpecification {
	return ['case',
		['!', ['get', 'inService']], getCssVariable('--color-label'),
		['>', ['get', countProp], 0], getCssVariable('--color-primary'),
		getCssVariable('--color-background')];
}

export function stationDotStrokeColor(countProp: 'bikes'|'freeDocks'): ExpressionSpecification {
	return ['case',
		['all', ['get', 'inService'], ['<=', ['get', countProp], 0]],
		getCssVariable('--color-primary'),
		getCssVariable('--color-background')];
}

/** Marker for a station: a pin with the count of bikes or free docks baked in,
 * with selected/inactive variants. */
export function stationIcon(kind: 'bike'|'dock', countProp: 'bikes'|'freeDocks'): ExpressionSpecification {
	return ['case',
		['get', 'selected'],
		['case',
			['get', 'inService'],
			['concat', kind + '_selected-', ['get', countProp]],
			kind + '_inactive_selected'],
		['case',
			['get', 'inService'],
			['concat', kind + '-', ['get', countProp]],
			kind + '_inactive']];
}

export function addLayers(map: maplibregl.Map) {
	if (map.getLayer('points') != undefined) return;
	// Added first so every later insertion before 'building' (trip path, route,
	// destination pin) lands above it — at low zoom the route must cover the
	// dots, not the other way around
	map.addLayer({
		'id': 'station-dots',
		'type': 'circle',
		'source': 'points',
		'maxzoom': STATION_MARKER_FADE_END,
		'paint': {
			'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, STATION_MARKER_FADE_START, 5],
			'circle-color': stationDotColor('bikes'),
			'circle-opacity': ['interpolate', ['linear'], ['zoom'], STATION_MARKER_FADE_START, 1, STATION_MARKER_FADE_END, 0],
			'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], STATION_MARKER_FADE_START, 1, STATION_MARKER_FADE_END, 0],
			'circle-stroke-width': 1.5,
			'circle-stroke-color': stationDotStrokeColor('bikes'),
		},
	}, 'building');
	map.addLayer({
		'id': 'trip-path-outline',
		'type': 'line',
		'source': 'trip-path',
		'layout': {
			'line-cap': 'round',
			'line-join': 'round',
		},
		'paint': {
			'line-color': getCssVariable('--color-background'),
			'line-width': 8,
			'line-opacity': 0.75,
		},
	}, 'building');
	map.addLayer({
		'id': 'trip-path',
		'type': 'line',
		'source': 'trip-path',
		'layout': {
			'line-cap': 'round',
			'line-join': 'round',
		},
		'paint': {
			'line-color': getCssVariable('--color-label'),
			'line-width': 4,
			'line-opacity': 0.75,
		},
	}, 'building');
	map.addLayer({
		'id': 'route-outline',
		'type': 'line',
		'source': 'route',
		'layout': {
			'line-cap': 'round',
			'line-join': 'round',
		},
		'paint': {
			'line-color': getCssVariable('--color-background'),
			'line-width': 9,
		},
	}, 'building');
	map.addLayer({
		'id': 'route-bike',
		'type': 'line',
		'source': 'route',
		'filter': ['==', ['get', 'mode'], 'bike'],
		'layout': {
			'line-cap': 'round',
			'line-join': 'round',
		},
		'paint': {
			'line-color': getCssVariable('--color-primary'),
			'line-width': 5,
		},
	}, 'building');
	map.addLayer({
		'id': 'route-foot',
		'type': 'line',
		'source': 'route',
		'filter': ['==', ['get', 'mode'], 'foot'],
		'layout': {
			'line-cap': 'round',
		},
		'paint': {
			'line-color': getCssVariable('--color-primary'),
			'line-width': 5,
			// round caps + short gaps render walking segments as a dotted line
			'line-dasharray': [0.1, 1.8],
		},
	}, 'building');
	map.addLayer({
		'id': 'route-destination-outer',
		'type': 'circle',
		'source': 'route-destination',
		'paint': {
			'circle-radius': 9,
			'circle-color': getCssVariable('--color-background'),
		},
	}, 'building');
	map.addLayer({
		'id': 'route-destination-inner',
		'type': 'circle',
		'source': 'route-destination',
		'paint': {
			'circle-radius': 5.5,
			'circle-color': getCssVariable('--color-primary'),
		},
	}, 'building');
	map.addLayer({
		'id': 'points',
		'type': 'symbol',
		'source': 'points',
		'minzoom': STATION_MARKER_FADE_START,
		'layout': {
			visibility: 'visible',
			'icon-image': stationIcon('bike', 'bikes'),
			'icon-size': ['interpolate', ['linear'], ['zoom'], STATION_MARKER_FADE_START, 0.1, STATION_MARKER_FADE_END, 0.5],
			'icon-anchor': 'bottom',
			'icon-allow-overlap': true,
			'icon-padding': 0,
		},
	});
	map.addLayer({
		'id': 'docks',
		'type': 'symbol',
		'source': 'points',
		'minzoom': STATION_MARKER_FADE_START,
		'layout': {
			visibility: 'none',
			'icon-image': stationIcon('dock', 'freeDocks'),
			'icon-size': ['interpolate', ['linear'], ['zoom'], STATION_MARKER_FADE_START, 0.1, STATION_MARKER_FADE_END, 0.5],
			'icon-anchor': 'bottom',
			'icon-allow-overlap': true,
			'icon-padding': 0,
		},
	});
	// The stations that matter right now (the route's pickup/dropoff/
	// destination and the selected one) keep a full-size marker at every
	// zoom, drawn above the route line — this layer covers them alone, and
	// Map.svelte hides them from the growing regular layers. Starts matching
	// nothing; Map.svelte sets the filter as the route and selection change
	map.addLayer({
		'id': 'route-stations',
		'type': 'symbol',
		'source': 'points',
		'filter': ['in', ['get', 'serialNumber'], ['literal', []]],
		'layout': {
			'icon-image': stationIcon('bike', 'bikes'),
			'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.35, STATION_MARKER_FADE_END, 0.5],
			'icon-anchor': 'bottom',
			'icon-allow-overlap': true,
			'icon-padding': 0,
		},
	});
	map.addLayer({
		'id': 'user-location',
		'type': 'symbol',
		'source': 'user-location',
		'layout': {
			'icon-image': ['case', ['to-boolean', ['get', 'nav']], 'nav-marker', 'pulsing-dot'],
			'icon-rotate': ['case', ['to-boolean', ['get', 'nav']], ['coalesce', ['get', 'heading'], 0], 0],
			// rotate with the map and lie flat on it when tilted, like the route line
			'icon-rotation-alignment': 'map',
			'icon-pitch-alignment': 'map',
			'icon-allow-overlap': true,
			'icon-ignore-placement': true,
		},
	});
}

export async function loadImages(map: maplibregl.Map) {
	const accent = getCssVariable('--color-primary');
	const replaces = {
		accent,
		background: getCssVariable('--color-background'),
		inactive: getCssVariable('--color-label'),
		shadow_strength: get(theme) === 'light' ? '0.25' : '1',
	};

	function addOrReplace(id:string, img: Parameters<typeof map.addImage>[1], options: Parameters<typeof map.addImage>[2] = {}) {
		if (map.hasImage(id)) {
			map.updateImage(id, img);
		} else {
			map.addImage(id, img, options);
		}
	}

	addOrReplace('pulsing-dot', pulsingDot(map), { pixelRatio: 2 });
	addOrReplace('nav-marker', navigationMarker(165), { pixelRatio: 2 });
	addOrReplace('bike_inactive', await loadSvg('./assets/bike_marker_inactive.svg', replaces));
	addOrReplace('bike_inactive_selected', await loadSvg('./assets/bike_marker_inactive_selected.svg', replaces));
	addOrReplace('dock_inactive', await loadSvg('./assets/dock_marker_inactive.svg', replaces));
	addOrReplace('dock_inactive_selected', await loadSvg('./assets/dock_marker_inactive_selected.svg', replaces));

	const imgs = [['bike', './assets/bike_marker.svg', accent], ['bike_selected', './assets/bike_marker_selected.svg', replaces.background], ['dock', './assets/dock_marker.svg', accent], ['dock_selected', './assets/dock_marker_selected.svg', replaces.background]];
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d', { willReadFrequently: true })!;
	const start = performance.now();
	await Promise.all(imgs.map(([name, url, color]) => loadSvg(url, replaces).then(img => {
		context.clearRect(0, 0, img.width, img.height);
		context.drawImage(img, 0, 0);
		const imageWithoutNumber = context.getImageData(0, 0, img.width, img.height);
		canvas.width = img.width;
		canvas.height = img.height;
		context.font = 'bold 44px Inter';
		context.textAlign = 'center';
		context.fillStyle = color;
		for (let i = 0; i < 50; i++) {
			context.putImageData(imageWithoutNumber, 0, 0);
			context.fillText(i.toString(), img.width / 2, img.height / 1.65);
			const newImg = context.getImageData(0, 0, img.width, img.height);
			addOrReplace(`${name}-${i}`, newImg);
		}
	})));
	console.debug(`Loaded images in ${performance.now() - start}ms`);
}