import { dev } from '$app/environment';
import { CapacitorHttp, type HttpOptions } from '@capacitor/core';
import type {
	VaimooCurrentTrip,
	VaimooLoginResponse,
	VaimooPagedResponse,
	VaimooSession,
	VaimooSubscriptionUsage,
	VaimooTripDetails,
	VaimooUser,
} from './types';

export const VAIMOO_BASE_URL = 'https://emel-consumerapp.vaimoo.com/';
export const VAIMOO_APP_ID = '8d75593b-83a1-4cce-862f-1671b59c5b0f';
export const VAIMOO_APP_VERSION = 'A1.0.0';
export const EMEL_LOGIN_URL = 'https://login.emel.pt/';
export const EMEL_REDIRECT_URI = 'vaimoo://auth/callback';

function serviceUrl(service: 'emel' | 'vaimoo', path: string) {
	const normalizedPath = path.replace(/^\/+/, '');
	if (dev) return `/__dev-proxy/${service}/${normalizedPath}`;
	return new URL(normalizedPath, service === 'emel' ? EMEL_LOGIN_URL : VAIMOO_BASE_URL).toString();
}

export class VaimooApiError extends Error {
	readonly errors: { message: string }[];

	constructor(
		message: string,
		readonly status: number,
		readonly body: unknown,
	) {
		super(message);
		this.name = 'VaimooApiError';
		this.errors = errorMessages(body, message).map(message => ({ message }));
	}
}

function errorMessages(body: unknown, fallback: string): string[] {
	if (typeof body === 'string' && body) return [body];
	if (!body || typeof body !== 'object') return [fallback];
	const data = body as { message?: unknown; error?: unknown; errors?: unknown };
	if (Array.isArray(data.errors)) {
		const messages = data.errors.flatMap(error => {
			if (typeof error === 'string') return [error];
			if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
				return [(error as { message: string }).message];
			}
			return [];
		});
		if (messages.length) return messages;
	}
	if (typeof data.message === 'string') return [data.message];
	if (typeof data.error === 'string') return [data.error];
	return [fallback];
}

async function http<T>(options: HttpOptions): Promise<T> {
	const response = await CapacitorHttp.request({
		connectTimeout: 10_000,
		readTimeout: 10_000,
		...options,
	});
	if (response.status < 200 || response.status >= 300) {
		throw new VaimooApiError(`VAIMOO request failed with HTTP ${response.status}`, response.status, response.data);
	}
	return response.data as T;
}

function expiresAt(response: VaimooLoginResponse) {
	const seconds = Number(response.accessToken.expireSeconds);
	return Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60 * 60 * 1000);
}

function toSession(response: VaimooLoginResponse): VaimooSession {
	return {
		accessToken: response.accessToken.token,
		refreshToken: response.accessToken.refreshToken,
		userId: response.user.userId,
		expiresAt: expiresAt(response),
		user: response.user,
	};
}

export async function loginWithEmel(email: string, password: string): Promise<VaimooSession> {
	const auth = await http<{
		data: { accessToken: string; refreshToken: string; expiration: string | number };
		error: { code: number; message?: string };
	}>({
		url: serviceUrl('emel', 'emel-api/auth'),
		method: 'POST',
		headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		data: { provider: 'EmailPassword', credentialsEmailPassword: { email, password } },
	});
	if (auth.error.code !== 0) throw new VaimooApiError(auth.error.message ?? 'EMEL login failed', 401, auth.error);

	const emelUser = await http<{ data: { id: string | number }; error: { code: number; message?: string } }>({
		url: serviceUrl('emel', 'emel-api/user'),
		method: 'GET',
		headers: { Accept: 'application/json', Authorization: `Bearer ${auth.data.accessToken}` },
	});
	if (emelUser.error.code !== 0) {
		throw new VaimooApiError(emelUser.error.message ?? 'EMEL user lookup failed', 401, emelUser.error);
	}

	const secureCode = await http<{ code: string }>({
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
	options: { method?: string; token?: string; userId?: number; params?: Record<string, string | number | boolean>; data?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
	const params: Record<string, string> = {
		userId: String(options.userId ?? null),
		mainAppVersion: VAIMOO_APP_VERSION,
		t: String(Date.now()),
	};
	for (const [key, value] of Object.entries(options.params ?? {})) params[key] = String(value);
	return http<T>({
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
	});
}

export const defaultQuery = (pageIndex = 1, pageSize = 20) => JSON.stringify({ pageIndex, pageSize, filter: { filters: [] } });

export const getVaimooUser = (session: VaimooSession) => vaimooRequest<VaimooUser>('user', { token: session.accessToken, userId: session.userId, params: { IncludeUserAppSettings: true } });

export const getCurrentVaimooTrip = (session: VaimooSession) => vaimooRequest<VaimooCurrentTrip>('user/trip', { token: session.accessToken, userId: session.userId });

export const getVaimooTrips = (session: VaimooSession, pageIndex: number, pageSize: number) => vaimooRequest<VaimooPagedResponse<VaimooTripDetails>>('trip/trips', {
	token: session.accessToken,
	userId: session.userId,
	params: { query: defaultQuery(pageIndex, pageSize) },
});

export const getVaimooSubscriptionUsage = (session: VaimooSession) => vaimooRequest<VaimooSubscriptionUsage[]>('subscription/v2/usage', { token: session.accessToken, userId: session.userId });

export const getVaimooRemainingCredit = (session: VaimooSession) => vaimooRequest<{ remainingCredit: number }>('wallet/remaining-credit', { token: session.accessToken, userId: session.userId });

export const quickStartVaimooTrip = (session: VaimooSession, communicationId: string) => vaimooRequest<void>(`trip/v2/quick-start/${encodeURIComponent(communicationId)}`, {
	method: 'POST', token: session.accessToken, userId: session.userId,
});