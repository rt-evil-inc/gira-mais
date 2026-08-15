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