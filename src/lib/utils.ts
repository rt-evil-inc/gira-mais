import { CapacitorHttp, type HttpOptions, type HttpResponse } from '@capacitor/core';

type HttpRequestError = {
	status?: number;
	errors?: { message: string }[];
};

export const deg2rad = (deg:number) => deg * (Math.PI / 180);

export function distanceBetweenCoords(lat1:number, lon1:number, lat2:number, lon2:number) {
	const R = 6371;
	const dLat = deg2rad(lat2 - lat1);
	const dLon = deg2rad(lon2 - lon1);
	const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	const d = R * c;
	return d;
}

/** Initial bearing in degrees (0-360, clockwise from north) from point 1 to point 2. */
export function bearingBetweenCoords(lat1:number, lon1:number, lat2:number, lon2:number) {
	const y = Math.sin(deg2rad(lon2 - lon1)) * Math.cos(deg2rad(lat2));
	const x = Math.cos(deg2rad(lat1)) * Math.sin(deg2rad(lat2)) -
		Math.sin(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.cos(deg2rad(lon2 - lon1));
	return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function formatDistance(distance:number) {
	if (distance < 1) return `${(distance * 1000).toFixed(0)}m`;
	return `${distance.toLocaleString(undefined, { maximumFractionDigits: 2, useGrouping: false })}km`;
}

export function randomUUID() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
		const r = Math.random() * 16 | 0, v = c == 'x' ? r : r & 0x3 | 0x8;
		return v.toString(16);
	});
}

export function getCssVariable(name:string) {
	return getComputedStyle(document.documentElement).getPropertyValue(name);
}

const maxAttempts = 5;
const retryDelay = 1000;

export async function httpRequestWithRetry(options: HttpOptions, retryOnStatus = false) {
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out')), 5000));
			const response = await Promise.race([
				CapacitorHttp.request({ ...options, readTimeout: 5000, connectTimeout: 5000 }),
				timeoutPromise,
			]);
			if (retryOnStatus && (response.status < 200 || response.status >= 300)) {
				throw response;
			}
			return response;
		} catch (e) {
			const error = { ...(e as HttpResponse).data, status: (e as HttpResponse).status } as HttpRequestError;
			if (e instanceof Error && e.message === 'Request timed out') {
				console.error(`Attempt ${attempt}: Request timed out`);
			} else {
				console.error(`Attempt ${attempt}:`, error);
			}
			if (attempt < maxAttempts) {
				await new Promise(resolve => setTimeout(resolve, retryDelay * attempt)); // Linear backoff
			} else {
				console.error('Max attempts reached. Throwing error.');
				throw error;
			}
		}
	}
}