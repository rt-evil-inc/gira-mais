<script lang="ts">
	import { token } from '$lib/account';
	import { bearing, bearingNorth, currentHeading, currentPos } from '$lib/location';
	import { getMapStyle } from '$lib/map-style';
	import { addLayers, following, loadImages, selectedStation, setSourceData, stations, viewMode } from '$lib/map.svelte';
	import { appSettings } from '$lib/settings';
	import { createMarkerAnimator, type MarkerState } from '$lib/marker-animation';
	import { computeRoute, currentRoute, routeDestination, type PlannedRoute } from '$lib/routing';
	import { clipRouteAtProjection, emptyRouteClippingState, projectPositionOntoRoute, remainingRoute, type RouteClippingState } from '$lib/route-clipping';
	import { reverseGeocode } from '$lib/geocoding';
	import { theme } from '$lib/theme';
	import { t } from '$lib/translations';
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
	let routeClippingState: RouteClippingState = emptyRouteClippingState();

	$effect(() => {
		if (ready) setTimeout(() => blurred = false, 500);
	});

	$effect(() => {
		if ($bearingNorth) map.flyTo({ bearing: 0 });
	});

	const NAV_PITCH = 50;
	const NAV_ZOOM = 17;
	const NAV_TRANSITION_ms = 1400;

	// While the camera eases into or out of the navigation view, the per-fix
	// re-centering (and the per-frame follow) would cancel the animation
	// half-way, leaving the pitch stuck in between — hold them off until it ends
	let cameraTransition = false;
	let cameraTransitionTimeout: ReturnType<typeof setTimeout>;
	// Each transition gets an id so a stale release (the moveend of a
	// transition that was superseded mid-flight) can't cut a newer one short
	let cameraTransitionId = 0;
	function beginCameraTransition(duration?: number) {
		cameraTransition = true;
		clearTimeout(cameraTransitionTimeout);
		const id = ++cameraTransitionId;
		const release = () => {
			if (id === cameraTransitionId) cameraTransition = false;
		};
		if (duration !== undefined) cameraTransitionTimeout = setTimeout(release, duration + 100);
		return release;
	}

	// jumpTo stops the camera, and stopping the camera resets every gesture
	// handler — a pan that has just touched down is wiped before its first
	// move (the one that fires dragstart and breaks the follow), leaving the
	// map immovable while the marker glides. Hold the per-frame follow off
	// while a pointer is on the map or a gesture-driven animation (pinch,
	// wheel zoom, double-tap) is still running
	const pointersDown = new Set<number>;
	function gestureInProgress() {
		return pointersDown.size > 0 || map.isMoving();
	}

	// Glides the location marker between GPS fixes instead of teleporting it;
	// while following, the camera is pinned to the gliding marker rather than
	// re-centered on each raw fix, so the map travels as smoothly as the marker
	const marker = createMarkerAnimator(state => {
		renderUserMarker(state);
		if (!mapLoaded || blurred || cameraTransition || !get(following) || gestureInProgress()) return;
		if (get(viewMode) === 'heading') {
			map.jumpTo({ center: [state.lng, state.lat], bearing: state.heading });
		} else {
			map.jumpTo({ center: [state.lng, state.lat] });
		}
	});

	// The animator only starts tracking once the map has loaded, so fall back to
	// the raw position for anything that needs a location before then
	function markerState(): MarkerState|null {
		const state = marker.displayed();
		if (state) return state;
		const pos = get(currentPos);
		if (!pos) return null;
		return { lng: pos.coords.longitude, lat: pos.coords.latitude, heading: get(currentHeading) ?? 0 };
	}

	function renderUserMarker(state: MarkerState|null = markerState()) {
		if (!mapLoaded || !state) return;
		const src = map.getSource<maplibregl.GeoJSONSource>('user-location');
		if (src == null) return;
		src.setData({
			type: 'FeatureCollection',
			features: [{
				type: 'Feature',
				properties: { nav: get(currentTrip) !== null, heading: state.heading },
				geometry: {
					type: 'Point',
					coordinates: [state.lng, state.lat],
				},
			}],
		});
	}

	// Extra top padding keeps the marker in the lower part of the view, showing
	// the road ahead rather than what's behind
	function navPadding() {
		return {
			top: topPadding + window.innerHeight * 0.35,
			bottom: 0,
			left: leftPadding,
		};
	}

	function standardPadding() {
		return { top: topPadding, bottom: Math.min(bottomPadding, window.innerHeight / 2), left: leftPadding };
	}

	function enterNavView() {
		const state = markerState();
		if (!state) return;
		beginCameraTransition(NAV_TRANSITION_ms);
		map.easeTo({
			center: [state.lng, state.lat],
			bearing: state.heading,
			pitch: NAV_PITCH,
			zoom: NAV_ZOOM,
			padding: navPadding(),
			duration: NAV_TRANSITION_ms,
		});
	}

	function exitNavView() {
		const state = markerState();
		beginCameraTransition(1000);
		if (get(following) && state) {
			map.easeTo({
				center: [state.lng, state.lat],
				bearing: 0,
				pitch: 0,
				zoom: 16,
				padding: standardPadding(),
				duration: 1000,
			});
		} else {
			map.easeTo({ bearing: 0, pitch: 0, duration: 1000 });
		}
	}

	// The chevron lies flat on the map, so tilting foreshortens it — it's drawn
	// big enough for the tilted view and scaled down as the map flattens out,
	// where the full size would look oversized. The dot is unaffected
	function updateMarkerScale() {
		if (!mapLoaded || map.getLayer('user-location') == null) return;
		const t = Math.min(map.getPitch() / NAV_PITCH, 1);
		map.setLayoutProperty('user-location', 'icon-size', ['case', ['to-boolean', ['get', 'nav']], 0.8 + 0.2 * t, 1]);
	}

	// The per-frame follow reuses the padding left behind by enterNavView, so
	// when the viewport or the HUD layout changes (e.g. rotating the device)
	// the padded center silently moves — re-apply it with the fresh layout
	function realignNavCamera() {
		if (!mapLoaded || blurred || !get(following) || get(viewMode) !== 'heading') return;
		if (cameraTransition) {
			// still easing into the view — restart the transition with the new layout
			enterNavView();
			return;
		}
		const state = markerState();
		if (!state) return;
		beginCameraTransition(600);
		map.easeTo({
			center: [state.lng, state.lat],
			bearing: state.heading,
			padding: navPadding(),
			duration: 600,
		});
	}

	// Both follows reuse the padding left behind by their last camera move, so a
	// layout change silently shifts the padded center — re-apply it. Only the
	// top-down view is padded at the bottom (the station menu)
	$effect(() => {
		void topPadding;
		void leftPadding;
		realignNavCamera();
	});

	$effect(() => {
		void topPadding;
		void bottomPadding;
		void leftPadding;
		recenterNorthView();
	});

	// Ease into the navigation view whenever it becomes active (trip start,
	// re-following during a trip, toggling back from the north view)
	let navWasActive = false;
	$effect(() => {
		const active = mapLoaded && !blurred && $following && $viewMode === 'heading' && $currentPos !== null;
		if (active && !navWasActive) enterNavView();
		navWasActive = active;
	});

	let lastViewMode = get(viewMode);
	viewMode.subscribe(mode => {
		if (mode === lastViewMode) return;
		lastViewMode = mode;
		if (mode === 'north' && mapLoaded) exitNavView();
	});

	// MapLibre recognizes the taps of one-finger zoom gestures (double-tap and
	// double-tap-drag) up to 500ms apart, and 'click' fires on their first tap
	// too. Deferring the pin drop for most of that window keeps those gestures
	// from setting destinations, without making deliberate pin drops sluggish —
	// at worst an unusually slow double-tap still drops a pin. The route is
	// computed during the wait; only showing it is deferred
	const PIN_DROP_DELAY_ms = 200;
	let pendingPinDrop: ReturnType<typeof setTimeout>|null = null;
	function cancelPendingPinDrop() {
		if (pendingPinDrop != null) {
			clearTimeout(pendingPinDrop);
			pendingPinDrop = null;
		}
	}

	// Sets a spot as the routing destination, deferred past the double-tap
	// window and cancelled by zoom gestures
	function schedulePinDrop(lngLat: { lat: number, lng: number }) {
		cancelPendingPinDrop();
		const destination = { type: 'location' as const, lat: lngLat.lat, lng: lngLat.lng };
		// Compute the route and name right away so both are usually ready when
		// the wait ends
		const pos = get(currentPos);
		let prefetchedRoute: PlannedRoute|null = null;
		if (pos) {
			computeRoute({ lat: pos.coords.latitude, lng: pos.coords.longitude }, destination, get(currentTrip) !== null)
				.then(route => prefetchedRoute = route)
				.catch(() => {}); // if it failed, the recompute below will retry and report
		}
		const geocoded = reverseGeocode(destination);
		pendingPinDrop = setTimeout(() => {
			pendingPinDrop = null;
			// Publishing a route for this destination first makes the destination
			// subscription in routing.ts skip its recompute; if the prefetch isn't
			// done yet, the normal recompute takes over
			if (prefetchedRoute) currentRoute.set(prefetchedRoute);
			routeDestination.set(destination);
			geocoded.then(name => {
				const current = get(routeDestination);
				if (current && current.lat === destination.lat && current.lng === destination.lng) {
					// The generic fallback is only shown once the lookup concluded
					// without a name — not while it's still pending
					routeDestination.set({ ...destination, name: name ?? get(t)('selected_location') });
				}
			});
		}, PIN_DROP_DELAY_ms);
	}

	// While riding, a stray tap on the map must not re-route — changing the
	// destination takes a deliberate hold instead. Detected from the pointer
	// tracking rather than from clicks, because mobile webviews don't reliably
	// emit a click for a long press
	const TRIP_PIN_HOLD_ms = 400;
	const TRIP_PIN_HOLD_TOLERANCE_px = 10;
	let press: { id: number, x: number, y: number, time: number }|null = null;

	function tripHoldPinDrop(e: PointerEvent) {
		if (!mapLoaded || get(currentTrip) === null) return;
		if (get(selectedStation) != null) return; // the tap closes the menu instead
		const rect = map.getCanvasContainer().getBoundingClientRect();
		const point: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
		// releases over a dock open its menu through the regular click path
		if (map.queryRenderedFeatures(point, { layers: ['points', 'docks'] }).length > 0) return;
		schedulePinDrop(map.unproject(point));
	}

	function addEventListeners(map: maplibregl.Map) {
		async function onStationClick(e: maplibregl.MapLayerMouseEvent) {
			if (e.features === undefined) return;
			cancelPendingPinDrop();
			following.set(false);
			const feature = e.features[0] as GeoJSON.Feature<GeoJSON.Point>;
			const props = feature.properties as { serialNumber: string, name: string, bikes: number };
			selectedStation.set(props.serialNumber);
			// Tapping a station that's already part of the route (e.g. to unlock a
			// bike at the pickup station) only opens its menu — it must not replace
			// the route with a route to that station
			const route = get(currentRoute);
			const partOfRoute = route != null && (
				route.startStationSerial === props.serialNumber ||
				route.endStationSerial === props.serialNumber ||
				(route.destination.type === 'station' && route.destination.stationSerial === props.serialNumber)
			);
			if (!partOfRoute) {
				routeDestination.set({
					type: 'station',
					lat: feature.geometry.coordinates[1],
					lng: feature.geometry.coordinates[0],
					name: props.name,
					stationSerial: props.serialNumber,
				});
			}
			await tick();
			await tick();
			// With no active trip the camera moves once, when the computed route is
			// fit to the view; during a trip, without a location (when no route can
			// be computed) or when the route is kept, no fit happens, so center the
			// station instead
			if (get(currentTrip) !== null || get(currentPos) === null || partOfRoute) {
				map.flyTo({
					center: feature.geometry.coordinates as [number, number],
					padding: { top: topPadding, bottom: Math.min(bottomPadding, window.innerHeight / 2), left: leftPadding },
					curve: 0,
				});
			}
		}
		map.on('click', 'points', onStationClick);
		map.on('click', 'docks', onStationClick);
		// on dragging map, remove user tracking
		map.on('dragstart', () => {
			following.set(false);
		});
		map.on('click', e => {
			const features = map.queryRenderedFeatures(e.point, { layers: ['points', 'docks'] });
			if (features.length > 0) return;
			if (get(selectedStation) != null) {
				selectedStation.set(null);
				return;
			}
			// While riding, quick taps are too easy to land by accident —
			// re-routing takes the deliberate hold handled by the pointer tracking
			if (get(currentTrip) !== null) return;
			schedulePinDrop(e.lngLat);
		});
		map.on('dblclick', cancelPendingPinDrop);
		map.on('dragstart', cancelPendingPinDrop);
		// The navigation view moves the camera programmatically all the time, so
		// only user gestures (which carry the original DOM event) may cancel a
		// pending pin drop
		map.on('zoomstart', e => {
			if (e.originalEvent) cancelPendingPinDrop();
		});
		map.on('pitchstart', e => {
			if (e.originalEvent) cancelPendingPinDrop();
		});
		map.on('rotatestart', e => {
			if (!e.originalEvent) return;
			cancelPendingPinDrop();
			// Manually rotating the map takes over from the heading-aligned camera,
			// like dragging takes over from the centering
			if (get(viewMode) === 'heading') following.set(false);
		});
		map.on('rotate', () => {
			bearing.set(map.getBearing());
			bearingNorth.set(false);
		});
		map.on('pitch', updateMarkerScale);
		map.on('resize', realignNavCamera);
	}

	// Pulls the top-down view back onto the marker: the deliberate move made when
	// the follow starts or the padded center shifts, not a per-fix correction.
	// flyTo picks its duration from the distance (the first centering after
	// launch crosses the whole city, a padding shift barely moves), so the
	// hold-off is released by the movement ending rather than by a timer
	function recenterNorthView() {
		if (!mapLoaded || blurred || cameraTransition || !get(following) || get(viewMode) !== 'north') return;
		const state = markerState();
		if (!state) return;
		const release = beginCameraTransition();
		map.flyTo({
			center: [state.lng, state.lat],
			padding: standardPadding(),
			zoom: 16,
		});
		// registered only after the flyTo call: its stop() synchronously fires
		// the moveend of any ease it interrupts, which must not release this hold
		if (map.isMoving()) map.once('moveend', release);
		else release();
	}

	currentPos.subscribe((pos: Position|null) => {
		if (!mapLoaded) return;
		if (pos && pos.coords) {
			marker.setTarget({
				lng: pos.coords.longitude,
				lat: pos.coords.latitude,
				heading: get(currentHeading),
			});
		}
		applyRouteData(get(currentRoute), pos);
	});

	// Compass-driven heading changes arrive between GPS fixes (e.g. turning on
	// the spot) — rotate the marker without disturbing the position glide
	currentHeading.subscribe(heading => {
		if (heading !== null) marker.setHeading(heading);
	});

	// Smoothing can be turned off from the development settings to compare the
	// glide against the raw fix stream
	appSettings.subscribe(settings => marker.setSmoothing(settings?.markerSmoothing ?? true));

	function applyRouteData(route: PlannedRoute|null, pos = get(currentPos)) {
		const src = map.getSource<maplibregl.GeoJSONSource>('route');
		const destSrc = map.getSource<maplibregl.GeoJSONSource>('route-destination');
		if (src == null || destSrc == null) return;
		if (route && pos?.coords) {
			routeClippingState = projectPositionOntoRoute(route, {
				lat: pos.coords.latitude,
				lng: pos.coords.longitude,
			}, routeClippingState, get(currentTrip) !== null ? 'bike' : 'foot');
		}
		// Refine the trip HUD's distance-left and arrival time with the progress
		// along the route, which route recomputes alone would only track every ~30m
		if (route && routeClippingState.accepted && get(currentTrip) !== null) {
			const remaining = remainingRoute(route, routeClippingState.accepted);
			const arrivalTime = new Date(Date.now() + remaining.duration * 1000);
			currentTrip.update(trip => trip ? { ...trip, distanceLeft: remaining.distance / 1000, arrivalTime, predictedEndDate: arrivalTime } : trip);
		}
		const displayLegs = route ? clipRouteAtProjection(route, routeClippingState.accepted) : [];
		src.setData({
			type: 'FeatureCollection',
			features: displayLegs.map(leg => ({
				type: 'Feature' as const,
				properties: { mode: leg.mode },
				geometry: {
					type: 'LineString' as const,
					coordinates: leg.coordinates,
				},
			})) ?? [],
		});
		const destination = get(routeDestination);
		destSrc.setData({
			type: 'FeatureCollection',
			features: destination ? [{
				type: 'Feature' as const,
				properties: {},
				geometry: {
					type: 'Point' as const,
					coordinates: [destination.lng, destination.lat],
				},
			}] : [],
		});
	}

	// The station menu height passed as bottomPadding only measures the bike
	// list; the sheet header (drag handle + station info) adds roughly this much
	const SHEET_HEADER_px = 110;

	let pendingFit = false;
	let lastFitAt = 0;
	let refitTimeout: ReturnType<typeof setTimeout>;

	function fitRoute(route: PlannedRoute|null) {
		if (!route || !mapLoaded || get(currentTrip) !== null) return;
		lastFitAt = Date.now();
		following.set(false);
		const bounds = new maplibregl.LngLatBounds;
		bounds.extend([route.origin.lng, route.origin.lat]);
		route.legs.forEach(leg => leg.coordinates.forEach(c => bounds.extend(c)));
		// Clear the search bar + route summary chip at the top, and the bottom
		// sheet (bike list is CSS-capped at 50vh) plus its header at the bottom,
		// while always keeping a minimum strip of the map visible
		const top = topPadding + 130;
		const bottom = Math.min(
			Math.min(bottomPadding, window.innerHeight / 2) + SHEET_HEADER_px,
			window.innerHeight - top - 150,
		);
		// fitBounds adds the map's persistent padding (left behind by flyTo calls
		// with a padding option) on top of the requested one, so subtract it to
		// avoid zooming out much further than the route needs
		const persistent = map.getPadding();
		map.fitBounds(bounds, {
			padding: {
				top: Math.max(0, top - persistent.top),
				bottom: Math.max(0, bottom - persistent.bottom),
				left: Math.max(0, leftPadding + 40 - persistent.left),
				right: Math.max(0, 40 - persistent.right),
			},
			duration: 1000,
			maxZoom: 16.5,
		});
	}

	// Zoom to the full route whenever a destination is picked, unless riding
	// (keep following the user)
	currentRoute.subscribe(route => {
		routeClippingState = emptyRouteClippingState();
		if (!mapLoaded) return;
		applyRouteData(route);
		if (!route) {
			pendingFit = false;
			return;
		}
		if (pendingFit) {
			pendingFit = false;
			fitRoute(route);
		}
	});

	routeDestination.subscribe(destination => {
		if (!destination) routeClippingState = emptyRouteClippingState();
		if (!mapLoaded) {
			pendingFit = destination != null;
			return;
		}
		const route = get(currentRoute);
		applyRouteData(route);
		if (!destination) {
			pendingFit = false;
			return;
		}
		pendingFit = true;
		// The route for this destination may already be computed (e.g. a station
		// was re-selected, or reverse geocoding named a pin) — fit it right away
		if (route && route.destination.lat === destination.lat && route.destination.lng === destination.lng) {
			pendingFit = false;
			fitRoute(route);
		}
	});

	// Re-fit when the bottom sheet resizes shortly after a fit (e.g. the bike
	// list grows once up-to-date station info arrives), so the route stays visible
	$effect(() => {
		void bottomPadding;
		clearTimeout(refitTimeout);
		if (Date.now() - lastFitAt < 5000) {
			refitTimeout = setTimeout(() => fitRoute(get(currentRoute)), 200);
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
		// pointers can lift outside the map (or the app), so track the releases
		// window-wide to never leave the follow stuck paused
		const trackPointer = (e: PointerEvent) => {
			// a hold only counts while it's the lone pointer from start to finish
			press = pointersDown.size === 0 ? { id: e.pointerId, x: e.clientX, y: e.clientY, time: performance.now() } : null;
			pointersDown.add(e.pointerId);
		};
		const releasePointer = (e: PointerEvent) => {
			pointersDown.delete(e.pointerId);
			if (!press || press.id !== e.pointerId) return;
			const held = performance.now() - press.time;
			const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
			press = null;
			if (e.type === 'pointerup' && held >= TRIP_PIN_HOLD_ms && moved <= TRIP_PIN_HOLD_TOLERANCE_px) tripHoldPinDrop(e);
		};
		map.getCanvasContainer().addEventListener('pointerdown', trackPointer);
		window.addEventListener('pointerup', releasePointer);
		window.addEventListener('pointercancel', releasePointer);
		map.once('load', async () => {
			console.debug('Map loaded');
			await loadImages(map);
			mapLoaded = true;
			setSourceData(map);
			addLayers(map);
			renderUserMarker();
			updateMarkerScale();
			applyRouteData(get(currentRoute));
			addEventListeners(map);
		});
		return () => {
			window.removeEventListener('pointerup', releasePointer);
			window.removeEventListener('pointercancel', releasePointer);
			marker.stop();
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
				renderUserMarker();
				updateMarkerScale();
				applyRouteData(get(currentRoute));
				console.debug(map, map.getStyle(), map.getSource('points'));
			});
			map.setStyle(getMapStyle(currentTheme), { diff: true });
		}
	});

	let wasOnTrip = get(currentTrip) !== null;
	currentTrip.subscribe(trip => {
		const onTrip = trip !== null;
		if (onTrip !== wasOnTrip) {
			wasOnTrip = onTrip;
			if (onTrip) {
				// starting a trip pulls the camera into the navigation view
				viewMode.set('heading');
				following.set(true);
			} else {
				viewMode.set('north');
			}
			// swap the location marker between the dot and the heading arrow
			renderUserMarker();
		}
		if (mapLoaded) {
			map.setLayoutProperty('points', 'visibility', trip ? 'none' : 'visible');
			map.setLayoutProperty('docks', 'visibility', trip ? 'visible' : 'none');
			// while riding, the route has to stay legible at a glance, so thicken it
			map.setPaintProperty('route-outline', 'line-width', trip ? 12 : 9);
			map.setPaintProperty('route-bike', 'line-width', trip ? 8 : 5);
			map.setPaintProperty('route-foot', 'line-width', trip ? 8 : 5);
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

	// Like the navigation view, the top-down follow centers once when it becomes
	// active; in between, the per-frame follow keeps the camera on the marker
	let northWasActive = false;
	$effect(() => {
		const active = mapLoaded && !blurred && $following && $viewMode === 'north' && $currentPos !== null;
		if (active && !northWasActive) recenterNorthView();
		northWasActive = active;
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