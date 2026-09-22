import { dev } from '$app/environment';
import { CapacitorHttp, type HttpOptions } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { get } from 'svelte/store';
import { t } from '$lib/translations';
import { errorMessages } from '$lib/ui.svelte';
import { reportErrorEvent } from '$lib/gira-mais-api/gira-mais-api';
import type {
	VaimooCurrentTrip,
	VaimooLoginResponse,
	VaimooPagedResponse,
	VaimooSession,
	VaimooSubscriptionUsage,
	VaimooTripDetails,
	VaimooTripFeedback,
	VaimooUser,
} from './types';

export const VAIMOO_BASE_URL = 'https://emel-consumerapp.vaimoo.com/';
export const VAIMOO_APP_ID = '8d75593b-83a1-4cce-862f-1671b59c5b0f';
export const VAIMOO_APP_VERSION = 'A1.0.0';
export const EMEL_LOGIN_URL = 'https://login.emel.pt/';
export const EMEL_REDIRECT_URI = 'vaimoo://auth/callback';

type Service = 'emel' | 'vaimoo';

function serviceUrl(service: Service, path: string) {
	const normalizedPath = path.replace(/^\/+/, '');
	// CapacitorHttp is a native client, so unlike fetch it cannot resolve a relative URL.
	// Development builds load from the Vite server through adb reverse; preserve that
	// origin while routing the request through Vite's proxy.
	if (dev) return new URL(`/__dev-proxy/${service}/${normalizedPath}`, globalThis.location.origin).toString();
	return new URL(normalizedPath, service === 'emel' ? EMEL_LOGIN_URL : VAIMOO_BASE_URL).toString();
}

export class VaimooApiError extends Error {
	readonly errors: { message: string }[];

	/** VAIMOO's numeric `responseStatus.errorCode`, which is what the official app switches on. */
	readonly code: number | null;

	constructor(
		message: string,
		readonly status: number,
		readonly body: unknown,
	) {
		super(message);
		this.name = 'VaimooApiError';
		this.code = errorCode(body);
		this.errors = apiErrorMessages(body, message).map(message => ({ message }));
	}
}

/** The EMEL account rejected the email/password; the only failure that should discard saved credentials. */
export class InvalidCredentialsError extends VaimooApiError {
	constructor(message: string, body: unknown) {
		super(message, 401, body);
		this.name = 'InvalidCredentialsError';
	}
}

type VaimooErrorBody = {
	message?: unknown;
	error?: unknown;
	errors?: unknown;
	responseStatus?: { errorCode?: unknown; message?: unknown; errors?: unknown };
};

function errorCode(body: unknown): number | null {
	if (!body || typeof body !== 'object') return null;
	const code = (body as VaimooErrorBody).responseStatus?.errorCode;
	return typeof code === 'number' ? code : null;
}

function messagesFrom(errors: unknown): string[] {
	if (!Array.isArray(errors)) return [];
	return errors.flatMap(error => {
		if (typeof error === 'string') return [error];
		if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
			return [(error as { message: string }).message];
		}
		return [];
	});
}

function apiErrorMessages(body: unknown, fallback: string): string[] {
	if (typeof body === 'string' && body) return [body];
	if (!body || typeof body !== 'object') return [fallback];
	const data = body as VaimooErrorBody;
	// VAIMOO wraps failures as { responseStatus: { errorCode, message, errors: [{ errorCode, message }] } }.
	const nested = messagesFrom(data.responseStatus?.errors);
	if (nested.length) return nested;
	if (typeof data.responseStatus?.message === 'string' && data.responseStatus.message) return [data.responseStatus.message];
	const flat = messagesFrom(data.errors);
	if (flat.length) return flat;
	if (typeof data.message === 'string') return [data.message];
	if (typeof data.error === 'string') return [data.error];
	return [fallback];
}

/** The request never got an HTTP response (offline, DNS, timeout); the server may or may not have processed it. */
export class VaimooNetworkError extends Error {
	constructor(message: string, readonly cause: unknown) {
		super(message);
		this.name = 'VaimooNetworkError';
	}
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_000;
const COMMUNICATION_ERROR_KEYS = {
	emel: { retry: 'auth_api_communication_error_retry', final: 'auth_api_communication_error' },
	vaimoo: { retry: 'gira_api_communication_error_retry', final: 'gira_api_communication_error' },
} as const;

async function isOnline() {
	return Network.getStatus().then(status => status.connected, () => true);
}

/**
 * Perform a request, retrying network-level failures with linear backoff and telling the user when the
 * service is unreachable. HTTP error responses are never retried: the server has answered.
 * `retry: false` is for non-idempotent calls (the unlock), where a timed-out request may already have
 * taken effect and repeating it would fail even though it succeeded.
 */
async function http<T>(service: Service, options: HttpOptions, { retry = true } = {}): Promise<T> {
	const maxAttempts = retry ? MAX_ATTEMPTS : 1;
	for (let attempt = 1; ; attempt++) {
		let response;
		try {
			response = await CapacitorHttp.request({
				connectTimeout: 10_000,
				readTimeout: 10_000,
				...options,
			});
		} catch (error) {
			console.error(`${service} request to ${options.url} failed (attempt ${attempt}/${maxAttempts})`, error);
			// Offline is reported by the network banner already; only warn when the service itself is unreachable.
			const online = await isOnline();
			const notify = retry && online;
			if (attempt < maxAttempts) {
				if (notify && attempt === 1) errorMessages.add(get(t)(COMMUNICATION_ERROR_KEYS[service].retry), 5000);
				await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
				continue;
			}
			if (notify) errorMessages.add(get(t)(COMMUNICATION_ERROR_KEYS[service].final), 5000);
			const message = error instanceof Error ? error.message : String(error);
			// Only the path: the query string carries the user id and the headers the access token.
			if (online) void reportErrorEvent(COMMUNICATION_ERROR_KEYS[service].final, JSON.stringify({ method: options.method ?? 'GET', path: new URL(options.url).pathname, attempts: maxAttempts, error: message }));
			throw new VaimooNetworkError(`${service} request failed: ${message}`, error);
		}
		if (response.status < 200 || response.status >= 300) {
			throw new VaimooApiError(`VAIMOO request failed with HTTP ${response.status}`, response.status, response.data);
		}
		return response.data as T;
	}
}

function jwtExpiration(token: string): number | null {
	try {
		const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
		return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
	} catch {
		return null;
	}
}

// VAIMOO access tokens are short-lived (5 minutes at the time of writing) and the login
// response does not include expireSeconds, so read the expiry from the JWT itself.
function expiresAt(response: VaimooLoginResponse) {
	const fromJwt = jwtExpiration(response.accessToken.token);
	if (fromJwt) return fromJwt;
	const seconds = Number(response.accessToken.expireSeconds);
	return Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5 * 60 * 1000);
}

function toSession(response: VaimooLoginResponse): VaimooSession {
	// The login response uses `userId`, the refresh-token response uses `id`.
	const userId = response.user.userId ?? response.user.id;
	// Not the response itself: it holds the tokens and the account details, and error bodies get reported.
	if (userId == null) throw new VaimooApiError('VAIMOO session has no user id', 500, { userKeys: Object.keys(response.user ?? {}) });
	return {
		accessToken: response.accessToken.token,
		refreshToken: response.accessToken.refreshToken,
		userId,
		expiresAt: expiresAt(response),
		user: { ...response.user, userId },
	};
}

export async function loginWithEmel(email: string, password: string): Promise<VaimooSession> {
	const auth = await http<{
		data: { accessToken: string; refreshToken: string; expiration: string | number };
		error: { code: number; message?: string };
	}>('emel', {
		url: serviceUrl('emel', 'emel-api/auth'),
		method: 'POST',
		headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		data: { provider: 'EmailPassword', credentialsEmailPassword: { email, password } },
	}).catch(error => {
		if (error instanceof VaimooApiError && error.status === 401) throw new InvalidCredentialsError(error.message, error.body);
		throw error;
	});
	if (auth.error.code !== 0) throw new InvalidCredentialsError(auth.error.message ?? 'EMEL login failed', auth.error);

	const emelUser = await http<{ data: { id: string | number }; error: { code: number; message?: string } }>('emel', {
		url: serviceUrl('emel', 'emel-api/user'),
		method: 'GET',
		headers: { Accept: 'application/json', Authorization: `Bearer ${auth.data.accessToken}` },
	});
	if (emelUser.error.code !== 0) {
		throw new VaimooApiError(emelUser.error.message ?? 'EMEL user lookup failed', 502, emelUser.error);
	}

	const secureCode = await http<{ code: string }>('emel', {
		url: serviceUrl('emel', 'api/auth/code'),
		method: 'POST',
		headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		data: {
			payload: { ...auth.data, userId: emelUser.data.id },
			redirectUri: EMEL_REDIRECT_URI,
		},
	});

	const response = await vaimooRequest<VaimooLoginResponse>('auth/v2/oauth/', {
		method: 'POST',
		data: { code: secureCode.code },
	});
	return toSession(response);
}

export async function refreshVaimooSession(refreshToken: string): Promise<VaimooSession> {
	const response = await vaimooRequest<VaimooLoginResponse>('auth/refresh-token', {
		method: 'POST',
		headers: { RefreshToken: refreshToken, 'no-refresh': 'true' },
	});
	return toSession(response);
}

export async function vaimooRequest<T>(
	path: string,
	options: { method?: string; token?: string; userId?: number; params?: Record<string, string | number | boolean>; data?: unknown; headers?: Record<string, string>; retry?: boolean } = {},
): Promise<T> {
	const params: Record<string, string> = {
		userId: String(options.userId ?? null),
		mainAppVersion: VAIMOO_APP_VERSION,
		t: String(Date.now()),
	};
	for (const [key, value] of Object.entries(options.params ?? {})) params[key] = String(value);
	return http<T>('vaimoo', {
		url: serviceUrl('vaimoo', path),
		method: options.method ?? (options.data === undefined ? 'GET' : 'POST'),
		params,
		headers: {
			Accept: 'application/json',
			'Accept-Language': 'en',
			AppId: VAIMOO_APP_ID,
			Authorization: options.token ?? '',
			...options.data === undefined ? {} : { 'Content-Type': 'application/json' },
			...options.headers,
		},
		...options.data === undefined ? {} : { data: options.data },
	}, { retry: options.retry });
}

// Newest first, like the official app; without an explicit sort the server order is undefined.
export const defaultQuery = (pageIndex = 1, pageSize = 20) => JSON.stringify({ pageIndex, pageSize, sort: [{ field: 'startDate', dir: 'desc' }], filter: { filters: [] } });

export const getVaimooUser = (session: VaimooSession) => vaimooRequest<VaimooUser>('user', { token: session.accessToken, userId: session.userId, params: { IncludeUserAppSettings: true } });

export const getCurrentVaimooTrip = (session: VaimooSession) => vaimooRequest<VaimooCurrentTrip>('user/trip', { token: session.accessToken, userId: session.userId });

export const getVaimooTrips = (session: VaimooSession, pageIndex: number, pageSize: number) => vaimooRequest<VaimooPagedResponse<VaimooTripDetails>>('trip/trips', {
	token: session.accessToken,
	userId: session.userId,
	params: { query: defaultQuery(pageIndex, pageSize) },
});

export const getVaimooTripDetails = (session: VaimooSession, tripId: number) => vaimooRequest<VaimooTripDetails>(`trip/trip-details/${tripId}`, {
	token: session.accessToken,
	userId: session.userId,
});

export const submitVaimooTripFeedback = (session: VaimooSession, feedback: VaimooTripFeedback) => vaimooRequest<unknown>('user-feedback', {
	method: 'POST',
	token: session.accessToken,
	userId: session.userId,
	data: feedback,
});

export const getVaimooSubscriptionUsage = (session: VaimooSession) => vaimooRequest<VaimooSubscriptionUsage[]>('subscription/v2/usage', { token: session.accessToken, userId: session.userId });

export const getVaimooRemainingCredit = (session: VaimooSession) => vaimooRequest<{ remainingCredit: number }>('wallet/remaining-credit', { token: session.accessToken, userId: session.userId });

// Not retried: if the request times out after the server unlocked the bike, a repeat would be rejected
// as "already in a trip"; tryStartTrip checks the active trip instead.
export const quickStartVaimooTrip = (session: VaimooSession, communicationId: string) => vaimooRequest<void>(`trip/v2/quick-start/${encodeURIComponent(communicationId)}`, {
	method: 'POST', token: session.accessToken, userId: session.userId, retry: false,
});