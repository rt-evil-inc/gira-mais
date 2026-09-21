import type { StyleImageInterface } from 'maplibre-gl';
import { getCssVariable } from '$lib/utils';

/**
 * The trip heading indicator: a navigation chevron in the same visual language
 * as the pulsing dot (primary fill, white outline, soft shadow). Drawn pointing
 * north; the map layer rotates it to the traveling direction.
 */
export function navigationMarker(size = 100): ImageData {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const context = canvas.getContext('2d')!;
	const s = size / 100;
	// Each corner is filleted with arcTo, entering and leaving through the edge
	// midpoints; the tip is kept a touch sharper so the arrow stays directional
	const corners = [
		{ x: 50, y: 14, r: 4 }, // tip
		{ x: 80, y: 84, r: 5 }, // right wing
		{ x: 50, y: 66, r: 5 }, // tail notch
		{ x: 20, y: 84, r: 5 }, // left wing
	];
	const arrow = new Path2D;
	arrow.moveTo((corners[3].x + corners[0].x) / 2 * s, (corners[3].y + corners[0].y) / 2 * s);
	corners.forEach((corner, i) => {
		const next = corners[(i + 1) % corners.length];
		arrow.arcTo(corner.x * s, corner.y * s, (corner.x + next.x) / 2 * s, (corner.y + next.y) / 2 * s, corner.r * s);
	});
	arrow.closePath();
	context.lineJoin = 'round';
	context.strokeStyle = 'white';
	context.lineWidth = 6 * s;
	context.shadowColor = 'rgba(0, 0, 0, 0.35)';
	context.shadowBlur = 6 * s;
	context.stroke(arrow);
	context.shadowBlur = 0;
	context.fillStyle = getCssVariable('--color-primary');
	context.fill(arrow);
	return context.getImageData(0, 0, size, size);
}

/**
 * The heading beam shown behind the dot outside of trips, like Google Maps'
 * flashlight: a fan of the primary colour spreading from the dot in the
 * direction the device points and fading with distance. Its sides run tangent
 * to the dot rather than meeting at its centre, so the beam appears to leave
 * the dot's rim. Drawn pointing north at the given half-angle; the map layer
 * rotates it to the heading. Scaled for the same pixel ratio as the dot.
 */
export function headingCone(halfAngleDeg: number, size = 200): ImageData {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const context = canvas.getContext('2d')!;
	const s = size / 200;
	const cx = size / 2;
	const cy = size / 2;
	// the dot's outer rim (its fill plus the white stroke) and the beam's reach
	const dotRadius = 17 * s;
	const reach = 98 * s;
	const halfAngle = halfAngleDeg * Math.PI / 180;
	// The sides are tangent to the dot, meeting behind its centre; the tangent
	// points sit just behind the centre line, at the half-angle below it
	const apex = dotRadius / Math.sin(halfAngle);
	const tangentRight = { x: cx + dotRadius * Math.cos(halfAngle), y: cy + dotRadius * Math.sin(halfAngle) };
	const tangentLeft = { x: cx - dotRadius * Math.cos(halfAngle), y: tangentRight.y };
	// where each side meets the arc that closes the beam, `reach` from the centre
	const side = apex * Math.cos(halfAngle) + Math.sqrt(reach ** 2 - dotRadius ** 2);
	const farRight = { x: cx + side * Math.sin(halfAngle), y: cy + apex - side * Math.cos(halfAngle) };
	const farAngle = Math.atan2(farRight.y - cy, farRight.x - cx);
	const gradient = context.createRadialGradient(cx, cy, dotRadius, cx, cy, reach);
	const color = getCssVariable('--color-primary');
	gradient.addColorStop(0, `${color}99`);
	gradient.addColorStop(0.3, `${color}59`);
	gradient.addColorStop(1, `${color}00`);
	context.beginPath();
	context.moveTo(tangentRight.x, tangentRight.y);
	context.lineTo(farRight.x, farRight.y);
	// over the top from the right side to the left
	context.arc(cx, cy, reach, farAngle, Math.PI - farAngle, true);
	context.lineTo(tangentLeft.x, tangentLeft.y);
	// the chord between the tangent points lies under the dot
	context.closePath();
	context.fillStyle = gradient;
	context.fill();
	return context.getImageData(0, 0, size, size);
}

// This implements `StyleImageInterface`
// to draw a pulsing dot icon on the map.
export function pulsingDot(map: maplibregl.Map, size = 100, animationDuration = 1500) : StyleImageInterface {
	const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;

	return {
		width: size,
		height: size,
		data: new Uint8Array(size * size * 4),

		// When the layer is added to the map,
		// get the rendering context for the map canvas.
		onAdd: function () {
			const canvas = document.createElement('canvas');
			canvas.width = this.width;
			canvas.height = this.height;
		},

		// Call once before every frame where the icon will be used.
		render: function () {
			const t = (performance.now() % animationDuration) / animationDuration;

			const radius = (size / 2) * 0.3;
			const outerRadius = (size / 2) * 0.7 * t + radius;

			// Draw the outer circle.
			context.clearRect(0, 0, this.width, this.height);
			context.beginPath();
			context.arc(
				this.width / 2,
				this.height / 2,
				outerRadius,
				0,
				Math.PI * 2,
			);
			context.fillStyle = `${getCssVariable('--color-primary')}${Math.round((1 - t) / 2 * 255).toString(16).padStart(2, '0')}`;
			context.fill();

			// Draw the inner circle.
			context.beginPath();
			context.arc(
				this.width / 2,
				this.height / 2,
				radius,
				0,
				Math.PI * 2,
			);
			context.fillStyle = getCssVariable('--color-primary');
			context.strokeStyle = 'white';
			context.lineWidth = 2 + 4 * (1 - t);
			context.fill();
			context.stroke();

			// Update this image's data with data from the canvas.
			this.data = context.getImageData(
				0,
				0,
				this.width,
				this.height,
			).data;

			// Continuously repaint the map, resulting
			// in the smooth animation of the dot.
			map.triggerRepaint();

			// Return `true` to let the map know that the image was updated.
			return true;
		},
	};
}