<script lang="ts">
	import { token } from '$lib/account';
	import { bearing, bearingNorth, currentPos } from '$lib/location';
	import { getMapStyle } from '$lib/map-style';
	import { following, loadAllImages, selectedStation, stations } from '$lib/map.svelte';
	import { theme } from '$lib/theme';
	import { currentTrip } from '$lib/trip';
	import { getCssVariable } from '$lib/utils';
	import type { Position } from '@capacitor/geolocation';
	import type GeoJSON from 'geojson';
	import type maplibregl from 'maplibre-gl';
	import type { MapLayerMouseEvent, Map as MaplibreMap } from 'maplibre-gl';
	import { tick } from 'svelte';
	import { AttributionControl, GeoJSONSource, LineLayer, MapLibre, SymbolLayer } from 'svelte-maplibre-gl';
	import { fade } from 'svelte/transition';

	let {
		loading = true,
		bottomPadding = $bindable(0),
		topPadding = $bindable(0),
		leftPadding = $bindable(0),
	} = $props();

	let map: MaplibreMap | undefined = $state();
	let mapLoaded = $state(false);
	let imagesLoaded = $state(false);
	let ready = $derived(mapLoaded && imagesLoaded && !loading && stations.value.length !== 0);
	let blurred = $state(true);

	$effect(() => {
		if (ready) setTimeout(() => blurred = false, 500);
	});

	$effect(() => {
		if ($bearingNorth && map) map.flyTo({ bearing: 0 });
	});

	// Build station GeoJSON data
	let stationsGeoJSON = $derived<GeoJSON.FeatureCollection>({
		type: 'FeatureCollection',
		features: stations.value.map(station => ({
			type: 'Feature',
			properties: {
				code: station.code,
				serialNumber: station.serialNumber,
				name: station.name,
				bikes: station.bikes,
				selected: station.serialNumber === $selectedStation,
				inService: station.assetStatus === 'active',
				docks: station.docks,
				freeDocks: station.docks - station.bikes,
			},
			geometry: {
				type: 'Point',
				coordinates: [station.longitude, station.latitude],
			},
		})),
	});

	// Build user location GeoJSON
	let userLocationGeoJSON = $derived<GeoJSON.FeatureCollection>({
		type: 'FeatureCollection',
		features: $currentPos ? [{
			type: 'Feature',
			properties: {},
			geometry: {
				type: 'Point',
				coordinates: [$currentPos.coords.longitude, $currentPos.coords.latitude],
			},
		}] : [],
	});

	// Build trip path GeoJSON
	let tripPathGeoJSON = $derived<GeoJSON.Feature>({
		type: 'Feature',
		properties: {},
		geometry: {
			type: 'LineString',
			coordinates: $currentTrip?.pathTaken?.map(p => [p.lng, p.lat]) ?? [],
		},
	});

	// Map style based on theme
	let mapStyle = $derived(getMapStyle($theme));

	// Layer visibility based on trip status
	let showBikeLayer = $derived($currentTrip === null);
	let showDockLayer = $derived($currentTrip !== null);

	// Handle station click
	async function handleStationClick(e: MapLayerMouseEvent) {
		if (!e.features || e.features.length === 0 || !map) return;
		following.set(false);
		const feature = e.features[0] as GeoJSON.Feature<GeoJSON.Point>;
		const props = feature.properties as { serialNumber: string };
		selectedStation.set(props.serialNumber);
		await tick();
		await tick();
		map.flyTo({ center: feature.geometry.coordinates as [number, number] });
	}

	// Handle map click (deselect station)
	function handleMapClick(e: maplibregl.MapMouseEvent) {
		if (!map) return;
		const features = map.queryRenderedFeatures(e.point, { layers: ['points', 'docks'] });
		if (features.length === 0) {
			selectedStation.set(null);
		}
	}

	// Handle map drag
	function handleDragStart() {
		following.set(false);
	}

	// Handle map rotate
	function handleRotate() {
		if (!map) return;
		bearing.set(map.getBearing());
		bearingNorth.set(false);
	}

	// Center map on user position
	function centerMap(pos: Position) {
		if (!map) return;
		map.flyTo({
			center: [pos.coords.longitude, pos.coords.latitude],
			zoom: 16,
		});
	}

	// Follow user position effect
	$effect(() => {
		if ($following && !blurred && $currentPos && topPadding !== null && bottomPadding !== null && leftPadding !== null) {
			centerMap($currentPos);
		}
	});

	// Reset bottom padding when station is deselected
	$effect(() => {
		if ($selectedStation == null) bottomPadding = 0;
	});

	// Load images when map is ready
	async function handleMapLoad(e: maplibregl.MapLibreEvent) {
		console.debug('Map loaded');
		mapLoaded = true;
	}

	// Reload images when theme changes
	$effect(() => {
		if (map && mapLoaded) {
			// Wait for the new style to fully load before reloading images
			console.debug('Theme changed, reloading images');
			loadAllImages(map, $theme).then(() => {
				imagesLoaded = true;
			});
		}
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

<MapLibre
	bind:map
	class="h-full w-full"
	style={mapStyle}
	center={{ lng: -9.15, lat: 38.744 }}
	zoom={11}
	padding={{ top: topPadding, bottom: Math.min(bottomPadding, window.innerHeight / 2), left: leftPadding, right: 0 }}
	attributionControl={false}
	autoloadGlobalCss={false}
	onload={handleMapLoad}
	onclick={handleMapClick}
	ondragstart={handleDragStart}
	onrotate={handleRotate}
>
	<AttributionControl position="bottom-left" />

	<!-- Trip path layer -->
	<GeoJSONSource id="trip-path" data={tripPathGeoJSON}>
		<LineLayer
			id="trip-path-outline"
			beforeId="building"
			layout={{
				'line-cap': 'round',
				'line-join': 'round',
			}}
			paint={{
				'line-color': getCssVariable('--color-background'),
				'line-width': 10,
			}}
		/>
		<LineLayer
			id="trip-path"
			beforeId="building"
			layout={{
				'line-cap': 'round',
				'line-join': 'round',
			}}
			paint={{
				'line-color': getCssVariable('--color-primary'),
				'line-width': 6,
			}}
		/>
	</GeoJSONSource>

	<!-- Station markers layer -->
	{#if imagesLoaded}
		<GeoJSONSource id="points" data={stationsGeoJSON}>
			<!-- Bike markers (visible when no trip) -->
			<SymbolLayer
				id="points"
				layout={{
					'visibility': showBikeLayer ? 'visible' : 'none',
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
				}}
				onclick={handleStationClick}
			/>

			<!-- Dock markers (visible during trip) -->
			<SymbolLayer
				id="docks"
				layout={{
					'visibility': showDockLayer ? 'visible' : 'none',
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
				}}
				onclick={handleStationClick}
			/>
		</GeoJSONSource>

		<!-- User location layer -->
		<GeoJSONSource id="user-location" data={userLocationGeoJSON}>
			<SymbolLayer
				id="user-location"
				layout={{
					'icon-image': 'pulsing-dot',
				}}
			/>
		</GeoJSONSource>
	{/if}
</MapLibre>