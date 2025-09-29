<script lang="ts">
	import { token } from '$lib/account';
	import { bearing, bearingNorth, currentPos } from '$lib/location';
	import { getMapStyle } from '$lib/map-style';
	import { addLayers, following, loadImages, selectedStation, setSourceData, stations } from '$lib/map.svelte';
    import { theme } from '$lib/theme';
	import { currentTrip, type ActiveTrip } from '$lib/trip';
	import type { Position } from '@capacitor/geolocation';
	import type { GeoJSON } from 'geojson';
	import maplibregl from 'maplibre-gl';
	import { onMount, tick } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';

	interface Props {
		loading?: boolean;
		bottomPadding?: number;
		topPadding?: number;
		leftPadding?: number;
	}

	let {
		loading = true,
		bottomPadding = $bindable(0),
		topPadding = $bindable(0),
		leftPadding = $bindable(0),
	}: Props = $props();

	let mapElem: HTMLDivElement;
	let map : maplibregl.Map;
	let mapLoaded = $state(false);
	let ready = $derived(mapLoaded && !loading && stations.value.length != 0);
	let blurred = $state(true);

	$effect(() => {
		if (ready) setTimeout(() => blurred = false, 500);
	});

	$effect(() => {
		if ($bearingNorth) map.flyTo({ bearing: 0 });
	});

	function addEventListeners(map: maplibregl.Map) {
		map.on('click', 'points', async function (e) {
			if (e.features === undefined) return;
			following.set(false);
			const feature = e.features[0] as GeoJSON.Feature<GeoJSON.Point>;
			const props = feature.properties as { serialNumber: string, name: string, bikes: number };
			selectedStation.set(props.serialNumber);
			await tick();
			await tick();
			map.flyTo({
				center: feature.geometry.coordinates as [number, number],
				padding: { top: topPadding, bottom: Math.min(bottomPadding, window.innerHeight / 2), left: leftPadding },
				curve: 0,
			});
		});
		// on dragging map, remove user tracking
		map.on('dragstart', () => {
			following.set(false);
		});
		map.on('click', e => {
			const features = map.queryRenderedFeatures(e.point, { layers: ['points'] });
			if (features.length == 0) {
				selectedStation.set(null);
			}
		});
		map.on('rotate', () => {
			bearing.set(map.getBearing());
			bearingNorth.set(false);
		});
	}

	function centerMap(pos: Position) {
		map.flyTo({
			center: [pos.coords.longitude, pos.coords.latitude],
			padding: { top: topPadding, bottom: Math.min(bottomPadding, window.innerHeight / 2), left: leftPadding },
			zoom: 16,
		});
	}

	currentPos.subscribe((pos: Position|null) => {
		if (!mapLoaded) return;
		if (pos && pos.coords) {
			if ($following && !blurred) centerMap(pos);
			const src = map.getSource<maplibregl.GeoJSONSource>('user-location');
			const data:GeoJSON = {
				'type': 'FeatureCollection',
				'features': [{
					type: 'Feature',
					properties: {},
					geometry: {
						type: 'Point',
						coordinates: [pos.coords.longitude, pos.coords.latitude],
					},
				}],
			};
			if (src != null) {
				src.setData(data);
			} else {
				map.addSource('user-location', {
					'type': 'geojson',
					'data': data,
				});
			}
		}
	});

	currentTrip.subscribe((trip: ActiveTrip | null) => {
		if (!mapLoaded) return;
		const src = map.getSource<maplibregl.GeoJSONSource>('trip-path');
		const data:GeoJSON = {
			type: 'Feature',
			properties: {},
			geometry: {
				type: 'LineString',
				coordinates: trip?.pathTaken?.map(p => [p.lng, p.lat]) ?? [],
			},
		};
		if (src != null) {
			src.setData(data);
		} else {
			map.addSource('trip-path', {
				'type': 'geojson',
				'data': data,
			});
		}
	});

	onMount(() => {
		map = new maplibregl.Map({
			container: mapElem,
			style: getMapStyle(get(theme)),
			center: [-9.15, 38.744],
			zoom: 11,
			attributionControl: false,
		});
		map.addControl(new maplibregl.AttributionControl, 'bottom-left');
		map.once('load', async () => {
			console.debug('Map loaded');
			await loadImages(map);
			mapLoaded = true;
			setSourceData(map);
			addLayers(map);
			addEventListeners(map);
		});
		return () => {
			map.remove();
		};
	});

	theme.subscribe(currentTheme => {
		if (map && currentTheme) {
			map.once('styledata', () => {
				console.debug('style.load fired');
				loadImages(map);
				setSourceData(map);
				addLayers(map);
				console.debug(map, map.getStyle(), map.getSource('points'));
			});
			map.setStyle(getMapStyle(currentTheme), { diff: true });
		}
	});

	currentTrip.subscribe(trip => {
		if (mapLoaded) {
			map.setLayoutProperty('points', 'visibility', trip ? 'none' : 'visible');
			map.setLayoutProperty('docks', 'visibility', trip ? 'visible' : 'none');
		}
	});

	$effect(() => {
		if (stations.value && map) {
			$selectedStation = $selectedStation;
			if (mapLoaded) {
				setSourceData(map);
			}
		}
	});

	$effect(() => {
		if ($following && !blurred && $currentPos && topPadding !== null && bottomPadding !== null && leftPadding !== null) centerMap($currentPos);
	});

	$effect(() => {
		if ($selectedStation == null) bottomPadding = 0;
	});
</script>

{#if !ready}
	<div out:fade={{ duration: 500 }} class="blur fixed bg-cover top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[2000px] h-[2000px] z-10 bg-[url(/assets/map-preview-light.jpg)] dark:bg-[url(/assets/map-preview-dark.jpg)]"></div>
	<svg out:fade={{ duration: 500 }} class="absolute w-20 h-12 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 transition-opacity {$token === null ? 'opacity-0' : 'opacity-100'}" width="62" height="38" viewBox="0 0 62 38" fill="none" xmlns="http://www.w3.org/2000/svg">
		<path d="M11.0862 26.6841L18.6347 20.9505C15.871 17.2807 10.0799 18.3456 7.56726 18.814C13.1653 19.8331 11.0862 26.6841 11.0862 26.6841Z" class="fill-primary"/>
		<path d="M11.0862 26.6848L20.8612 26.8514C20.5211 24.2944 19.7072 22.3752 18.6347 20.9512L11.0862 26.6848Z" class="fill-primary"/>
		<path d="M28.1018 26.9753L23.685 17.1157M28.1018 26.9753L42.185 10.4097M28.1018 26.9753L20.8612 26.8519M23.685 17.1157L19.7388 8.41601M23.685 17.1157L18.6347 20.9517M42.185 10.4097L46.638 22.118L50.2583 26.6853M42.185 10.4097L40.411 5.11738L44.7192 2L37.4785 2.39874M42.185 10.4097H46.245M20.8612 26.8519L11.0862 26.6853M20.8612 26.8519C20.5211 24.2949 19.7072 22.3757 18.6347 20.9517M19.7388 8.41601H16.6254M19.7388 8.41601H24.0833M11.0862 26.6853C11.0862 26.6853 13.1653 19.8343 7.56725 18.8152M11.0862 26.6853L18.6347 20.9517M7.56725 18.8152C10.0798 18.3468 15.871 17.282 18.6347 20.9517M7.56725 18.8152H2.987" class="stroke-primary" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
		<g class="animate-spin origin-[11.5026px_26.4977px]">
			<circle cx="11.5026" cy="26.4977" r="9.50259" class="stroke-primary" stroke-width="4"/>
			<path d="M2.10678 26.582H21.0676" class="stroke-primary"/>
			<path d="M6.84695 34.793L16.3274 18.3724" class="stroke-primary"/>
			<path d="M16.3274 34.793L6.84696 18.3724" class="stroke-primary"/>
		</g>
		<g class="animate-spin origin-[50.1864px_26.4903px]">
			<circle cx="50.1864" cy="26.4903" r="9.49523" class="stroke-primary" stroke-width="4"/>
			<path d="M40.7966 26.5762H59.7452" class="stroke-primary"/>
			<path d="M45.5337 34.7793L55.0081 18.3693" class="stroke-primary"/>
			<path d="M55.0081 34.7793L45.5337 18.3693" class="stroke-primary"/>
		</g>
	</svg>
{/if}
<div bind:this={mapElem} class="h-full w-full"></div>