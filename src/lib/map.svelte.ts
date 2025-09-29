import { get, writable } from 'svelte/store';
import { pulsingDot } from '$lib/pulsing-dot';
import type { GeoJSON } from 'geojson';
import { getCssVariable } from '$lib/utils';
import { theme } from '$lib/theme';
import maplibregl from 'maplibre-gl';
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

export function addLayers(map: maplibregl.Map) {
	if (map.getLayer('points') != undefined) return;
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
			'line-width': 10,
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
			'line-color': getCssVariable('--color-primary'),
			'line-width': 6,
		},
	}, 'building');
	map.addLayer({
		'id': 'points',
		'type': 'symbol',
		'source': 'points',
		'layout': {
			// bike if selected, bike_selected otherwise
			// 'icon-image': ['case', ['get', 'selected'], ['concat', 'bike_selected-', ['get', 'bikes']], ['concat', 'bike-', ['get', 'bikes']]],
			// Add case for inService and selected
			visibility: 'visible',
			'icon-image': ['case',
				['get', 'selected'],
				['case',
					['get', 'inService'],
					['concat', 'bike_selected-', ['get', 'bikes']],
					'bike_inactive_selected'],
				['case',
					['get', 'inService'],
					['concat', 'bike-', ['get', 'bikes']],
					'bike_inactive']],

			'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.3, 13, 0.5],
			'icon-anchor': 'bottom',
			'icon-allow-overlap': true,
			'icon-padding': 0,
		},
	});
	map.addLayer({
		'id': 'docks',
		'type': 'symbol',
		'source': 'points',
		'layout': {
			// bike if selected, bike_selected otherwise
			// 'icon-image': ['case', ['get', 'selected'], ['concat', 'bike_selected-', ['get', 'bikes']], ['concat', 'bike-', ['get', 'bikes']]],
			// Add case for inService and selected
			visibility: 'none',
			'icon-image': ['case',
				['get', 'selected'],
				['case',
					['get', 'inService'],
					['concat', 'dock_selected-', ['get', 'freeDocks']],
					'dock_inactive_selected'],
				['case',
					['get', 'inService'],
					['concat', 'dock-', ['get', 'freeDocks']],
					'dock_inactive']],

			'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.3, 13, 0.5],
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
			'icon-image': 'pulsing-dot',
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