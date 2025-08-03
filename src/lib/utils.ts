import { get } from 'svelte/store';
import { CapacitorHttp, type HttpOptions, type HttpResponse } from '@capacitor/core';
import type { ThrownError } from './gira-api/api-types';
import { knownErrors } from './gira-api/api';
import { errorMessages } from './ui';
import { GIRA_API_URL, GIRA_AUTH_URL, GIRA_WS_URL } from './constants';
import { reportErrorEvent } from './gira-mais-api/gira-mais-api';
import { t } from './translations';

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
			const error = { ...(e as HttpResponse).data, status: (e as HttpResponse).status } as ThrownError;
			if (e instanceof Error && e.message === 'Request timed out') {
				console.error(`Attempt ${attempt}: Request timed out`);
			} else if (error?.errors && error.errors.some(err => knownErrors[err.message as keyof typeof knownErrors]?.retry === false)) {
				console.error('Known error occurred:', error);
				throw error;
			} else {
				console.error(`Attempt ${attempt}:`, error);
			}
			const isAuthUrl = options.url.startsWith(GIRA_AUTH_URL);
			const isGiraApiUrl = options.url.startsWith(GIRA_API_URL) || options.url.includes(GIRA_WS_URL.split('://')[1]);
			if (attempt < maxAttempts) {
				if (error.status === undefined && attempt === 1) {
					if (isAuthUrl) {
						errorMessages.add(get(t)('auth_api_communication_error_retry'), 5000);
					} else if (isGiraApiUrl) {
						errorMessages.add(get(t)('gira_api_communication_error_retry'), 5000);
					}
				}
				await new Promise(resolve => setTimeout(resolve, retryDelay * attempt)); // Linear backoff
			} else {
				console.error('Max attempts reached. Throwing error.');
				if (error.status === undefined) {
					if (isAuthUrl) {
						errorMessages.add(get(t)('auth_api_communication_error'), 5000);
						reportErrorEvent('auth_api_communication_error', JSON.stringify(e));
						console.error('Auth API communication error:', e);
					} else if (isGiraApiUrl) {
						errorMessages.add(get(t)('gira_api_communication_error'), 5000);
						reportErrorEvent('gira_api_communication_error', JSON.stringify(e));
						console.error('Gira API communication error:', e);
					}
				}
				throw error;
			}
		}
	}
}