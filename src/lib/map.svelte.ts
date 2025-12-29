import { pulsingDot } from '$lib/pulsing-dot';
import { getCssVariable } from '$lib/utils';
import type maplibregl from 'maplibre-gl';
import { writable } from 'svelte/store';

export type StationInfo = {
	code: string;
	name: string;
	description: string | null;
	latitude: number;
	longitude: number;
	bikes: number;
	docks: number;
	serialNumber: string;
	assetStatus: string;
}

export const stations = $state<{ value: StationInfo[] }>({ value: [] });
export const selectedStation = writable<string | null>(null);
export const following = writable<boolean>(false);


// Load all custom images for the map
export async function loadAllImages(mapInstance: maplibregl.Map, theme: 'light' | 'dark') {
	const accent = getCssVariable('--color-primary');
	const replaces = {
		accent,
		background: getCssVariable('--color-background'),
		inactive: getCssVariable('--color-label'),
		shadow_strength: theme === 'light' ? '0.25' : '1',
	};

	const loadSvg = async (url: string, svgReplaces?: Record<string, string>): Promise<HTMLImageElement> => {
		let svgData = await (await fetch(url)).text();
		return new Promise((resolve, reject) => {
			if (svgReplaces) {
				for (const [key, value] of Object.entries(svgReplaces)) {
					svgData = svgData.replace(new RegExp('{' + key + '}', 'g'), value);
				}
			}
			const img = new Image;
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
		});
	};

	const addOrReplace = (id: string, img: Parameters<typeof mapInstance.addImage>[1], options: Parameters<typeof mapInstance.addImage>[2] = {}) => {
		if (mapInstance.hasImage(id)) {
			mapInstance.updateImage(id, img);
		} else {
			mapInstance.addImage(id, img, options);
		}
	};

	// Add pulsing dot
	addOrReplace('pulsing-dot', pulsingDot(mapInstance), { pixelRatio: 2 });

	// Add inactive markers
	addOrReplace('bike_inactive', await loadSvg('./assets/bike_marker_inactive.svg', replaces));
	addOrReplace('bike_inactive_selected', await loadSvg('./assets/bike_marker_inactive_selected.svg', replaces));
	addOrReplace('dock_inactive', await loadSvg('./assets/dock_marker_inactive.svg', replaces));
	addOrReplace('dock_inactive_selected', await loadSvg('./assets/dock_marker_inactive_selected.svg', replaces));

	// Load numbered markers
	const imgs = [
		['bike', './assets/bike_marker.svg', accent],
		['bike_selected', './assets/bike_marker_selected.svg', replaces.background],
		['dock', './assets/dock_marker.svg', accent],
		['dock_selected', './assets/dock_marker_selected.svg', replaces.background],
	];

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

	// Force re-render to show updated images immediately
	mapInstance.triggerRepaint();

	console.debug(`Loaded images in ${performance.now() - start}ms`);
}