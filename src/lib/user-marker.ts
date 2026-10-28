import maplibregl from 'maplibre-gl';
import { headingCone, navigationMarker } from '$lib/pulsing-dot';
import type { BeamHalfAngle } from '$lib/heading-beam';

export type UserMarkerState = {
	lng: number,
	lat: number,
	heading: number,
	/** Riding: the chevron instead of the dot. */
	nav: boolean,
	/** The compass beam's half-angle, or null without a compass. */
	beam: BeamHalfAngle|null,
};

// The images are drawn at twice their CSS size, like the map's own icons
const PIXEL_RATIO = 2;
const BEAM_SIZE_px = 100;
const CHEVRON_SIZE_px = 82.5;
// The dot: a primary disc with a white rim that thins as the ring spreads out
const DOT_RADIUS_px = 7.5;
const RING_RADIUS_px = 25;
// the rim is 3 px wide as a pulse starts, and thins to this
const RIM_REST_px = 2;
const PULSE_ms = 1500;
// While any animation runs, the WebView redraws at the display rate — back to
// back, the pulse cost ~230 mW on a Pixel 6a, for as long as the app was open.
// Resting between pulses keeps the dot alive for about half that (#131)
const PULSE_PERIOD_ms = 3000;

function layer<K extends 'div'|'canvas'>(tag: K, size: number) {
	const element = document.createElement(tag);
	element.style.position = 'absolute';
	element.style.left = element.style.top = `${(BEAM_SIZE_px - size) / 2}px`;
	element.style.width = element.style.height = `${size}px`;
	return element;
}

function disc(radius: number, color: string) {
	const element = layer('div', radius * 2);
	element.style.borderRadius = '50%';
	element.style.background = color;
	return element;
}

function paint(canvas: HTMLCanvasElement, image: ImageData) {
	canvas.width = image.width;
	canvas.height = image.height;
	canvas.getContext('2d')!.putImageData(image, 0, 0);
}

/**
 * The user's location on the map, as a DOM marker rather than a map layer:
 * the marker glides between fixes on every animation frame, and moving a map
 * feature means re-tiling its source on a worker and re-rendering the whole
 * map each frame, which kept the CPU busy throughout trips (#131). A DOM
 * marker only moves with a CSS transform, and its pulse is a compositor
 * animation that needs no map frames at all.
 */
export function createUserMarker() {
	const element = document.createElement('div');
	element.style.width = element.style.height = `${BEAM_SIZE_px}px`;
	element.style.pointerEvents = 'none';

	const beam = layer('canvas', BEAM_SIZE_px);
	const dot = layer('div', BEAM_SIZE_px);
	const ring = disc(RING_RADIUS_px, 'var(--color-primary)');
	// the rim is centered on the dot's edge
	const rim = disc(DOT_RADIUS_px + 1.5, 'white');
	const core = disc(DOT_RADIUS_px - 0.5, 'var(--color-primary)');
	dot.append(ring, rim, core);
	const chevron = layer('canvas', CHEVRON_SIZE_px);
	element.append(beam, dot, chevron);

	// between pulses the dot rests as a pulse leaves it: no ring, a thinner rim
	const rimRest = `scale(${(DOT_RADIUS_px - 0.5 + RIM_REST_px) / (DOT_RADIUS_px + 1.5)})`;
	ring.style.opacity = '0';
	rim.style.transform = rimRest;
	function pulse() {
		// hidden elements don't run their animations either
		if (dot.style.display === 'none') return;
		const timing = { duration: PULSE_ms };
		ring.animate([
			{ transform: `scale(${DOT_RADIUS_px / RING_RADIUS_px})`, opacity: 0.5 },
			{ transform: 'scale(1)', opacity: 0 },
		], timing);
		rim.animate([{ transform: 'scale(1)' }, { transform: rimRest }], timing);
		core.animate([
			{ transform: `scale(${(DOT_RADIUS_px - 1.5) / (DOT_RADIUS_px - 0.5)})` },
			{ transform: 'scale(1)' },
		], timing);
	}
	pulse();
	const pulseTimer = setInterval(pulse, PULSE_PERIOD_ms);

	// rotate with the map and lie flat on it when tilted, like the route line
	const marker = new maplibregl.Marker({ element, rotationAlignment: 'map', pitchAlignment: 'map', subpixelPositioning: true });
	let beamAngle: BeamHalfAngle|null = null;
	let last: UserMarkerState|null = null;

	function drawBeam(halfAngle: BeamHalfAngle) {
		paint(beam, headingCone(halfAngle, BEAM_SIZE_px * PIXEL_RATIO));
		beamAngle = halfAngle;
	}

	/** Redraws the canvas images, e.g. after the theme changed the primary color. */
	function redraw() {
		paint(chevron, navigationMarker(CHEVRON_SIZE_px * PIXEL_RATIO));
		if (beamAngle !== null) drawBeam(beamAngle);
	}
	redraw();

	function update(map: maplibregl.Map, state: UserMarkerState) {
		if (last === null || state.nav !== last.nav) {
			dot.style.display = state.nav ? 'none' : '';
			chevron.style.display = state.nav ? '' : 'none';
		}
		const showBeam = !state.nav && state.beam !== null;
		if (showBeam && state.beam !== beamAngle) drawBeam(state.beam!);
		beam.style.display = showBeam ? '' : 'none';
		// the dot is round, so only the beam and the chevron need turning
		if (last === null || state.heading !== last.heading) marker.setRotation(state.heading);
		if (last === null || state.lng !== last.lng || state.lat !== last.lat) marker.setLngLat([state.lng, state.lat]);
		if (last === null) marker.addTo(map);
		last = state;
	}

	/** The chevron is drawn big enough for the tilted view; scaled down as the map flattens out. */
	function setChevronScale(scale: number) {
		chevron.style.transform = `scale(${scale})`;
	}

	function remove() {
		clearInterval(pulseTimer);
		marker.remove();
	}

	return { update, redraw, setChevronScale, remove };
}