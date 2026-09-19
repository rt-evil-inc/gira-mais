import { startBackendSync, stopBackendSync } from '$lib/gira-api/backend-sync';
import { getAccountSnapshot } from '$lib/gira-api/api';
import type { AccountSnapshot, SubscriptionInfo } from '$lib/gira-api/models';
import { selectedStation } from '$lib/map.svelte';
import { currentTrip, tripRating } from '$lib/trip';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { get, writable } from 'svelte/store';
import { getVaimooUser, InvalidCredentialsError, loginWithEmel, refreshVaimooSession, VaimooApiError } from '$lib/vaimoo-api/client';
import type { VaimooSession } from '$lib/vaimoo-api/types';

export type Token = {
	accessToken: string;
	refreshToken: string;
	expiration: number;
	userId: number;
	tenantId: string;
};
export type User = {
	email: string;
	name: string;
}
export type Subscription = SubscriptionInfo;
export type AccountInfo = AccountSnapshot;

export const token = writable<Token|null|undefined>(undefined);
export const userCredentials = writable<{email: string, password: string}|null>(null);
export const user = writable<User|null>(null);
export const accountInfo = writable<AccountInfo|null>(null);

const REFRESH_RETRY_DELAY_MS = 30_000;
let tokenRefreshTimeout: ReturnType<typeof setTimeout>|null = null;

function scheduleTokenRefresh(delayMs: number) {
	if (tokenRefreshTimeout) clearTimeout(tokenRefreshTimeout);
	tokenRefreshTimeout = setTimeout(async () => {
		let refreshed = false;
		try {
			refreshed = await refreshToken();
		} catch (error) {
			console.error('Scheduled token refresh failed', error);
		}
		// A successful refresh sets a new token, which re-arms the timer; otherwise keep trying.
		if (!refreshed && get(token)) scheduleTokenRefresh(REFRESH_RETRY_DELAY_MS);
	}, delayMs);
}

token.subscribe(v => {
	if (!v) {
		if (tokenRefreshTimeout) clearTimeout(tokenRefreshTimeout);
		tokenRefreshTimeout = null;
		return;
	}

	startBackendSync();
	scheduleTokenRefresh(Math.max(1_000, v.expiration - Date.now() - 30_000));
});

/** The VAIMOO session for the current token, or null when logged out. */
export function currentSession(): VaimooSession | null {
	const current = get(token);
	if (!current?.accessToken || !current.refreshToken || current.userId == null) return null;
	return {
		accessToken: current.accessToken,
		refreshToken: current.refreshToken,
		userId: current.userId,
		expiresAt: current.expiration,
		user: { userId: current.userId, tenantId: current.tenantId },
	};
}

export async function loadUserCreds() {
	const [email, password] = await Promise.all([
		Preferences.get({ key: 'email' }).then(r => r.value),
		Preferences.get({ key: 'password' }).then(r => r.value),
	]);
	if (email && password) {
		userCredentials.set({ email, password });
	} else {
		// This is here to show the login dialog if there are no credentials set
		token.set(null);
	}

	userCredentials.subscribe(async v => {
		if (!v) {
			Preferences.remove({ key: 'email' });
			Preferences.remove({ key: 'password' });
			return;
		}
		if (get(token)) {
			Preferences.set({ key: 'email', value: v.email });
			Preferences.set({ key: 'password', value: v.password });
			return;
		}
		let responseCode: number;
		try {
			responseCode = await login(v.email, v.password);
		} catch (error) {
			// Network or server trouble: show the login screen but keep the credentials for the next attempt.
			console.error('Login failed', error);
			token.set(null);
			return;
		}
		if (responseCode !== 0) {
			console.error('Login failed!');
			token.set(null);
			// Invalid credentials
			if (responseCode === 100) {
				Preferences.remove({ key: 'email' });
				Preferences.remove({ key: 'password' });
			}
			userCredentials.set(null);
		} else {
			Preferences.set({ key: 'email', value: v.email });
			Preferences.set({ key: 'password', value: v.password });
		}
	});
}

export async function login(email: string, password: string) {
	try {
		const session = await loginWithEmel(email, password);
		token.set({
			accessToken: session.accessToken,
			refreshToken: session.refreshToken,
			expiration: session.expiresAt,
			userId: session.userId,
			tenantId: session.user.tenantId,
		});
		user.set({
			email: session.user.email ?? email,
			name: [session.user.firstName, session.user.lastName].filter(Boolean).join(' ') || session.user.userName || email,
		});
		const initialLoads = await Promise.allSettled([refreshAccountInfo(), updateUserInfo()]);
		for (const result of initialLoads) {
			if (result.status === 'rejected') console.error('Failed to load VAIMOO account data', result.reason);
		}
		return 0;
	} catch (error) {
		if (error instanceof InvalidCredentialsError) return 100;
		throw error;
	}
}

export async function logOut() {
	stopBackendSync();
	token.set(null);
	userCredentials.set(null);
	accountInfo.set(null);
	currentTrip.set(null);
	user.set(null);
	selectedStation.set(null);
	tripRating.set({ currentRating: null });
	// purposefully not settings settings distancelock, since thats annoying when you swap accounts
}

const msBetweenRefreshAttempts = 2000;
const attempts = 5;
let refreshRequest: Promise<boolean>|null = null;

/**
 * Refresh the VAIMOO session, falling back to a full login with the saved credentials.
 * Concurrent callers (app resume, network reconnect, a 401 mid-request) share one attempt: the
 * refresh token rotates on every use, so a second parallel refresh would fail and log the user out.
 */
export function refreshToken(): Promise<boolean> {
	refreshRequest ??= doRefreshToken().finally(() => refreshRequest = null);
	return refreshRequest;
}

async function doRefreshToken() {
	if (await Network.getStatus().then(status => !status.connected)) return false;
	const tokens = get(token);
	if (!tokens) return false;
	let success = false;
	for (let i = 0; i < attempts && !success; i++) {
		try {
			const session = await refreshVaimooSession(tokens.refreshToken);
			token.set({
				accessToken: session.accessToken,
				refreshToken: session.refreshToken,
				expiration: session.expiresAt,
				userId: session.userId,
				tenantId: session.user.tenantId,
			});
			success = true;
		} catch (error) {
			// A rejected refresh token will not become valid by retrying; go straight to the credentials.
			if (error instanceof VaimooApiError && (error.status === 400 || error.status === 401)) break;
			await new Promise(resolve => setTimeout(resolve, msBetweenRefreshAttempts));
		}
	}
	if (!success) {
		for (let i = 0; i < attempts && !success; i++) {
			const creds = get(userCredentials);
			if (!creds) return false;
			let res: number;
			try {
				res = await login(creds.email, creds.password);
			} catch (error) {
				// Network or server trouble; keep the session and try again rather than
				// rejecting, so callers that fire and forget don't leak unhandled errors
				console.error('Credentials fallback login failed', error);
				await new Promise(resolve => setTimeout(resolve, msBetweenRefreshAttempts));
				continue;
			}
			if (res !== 0) {
				// Invalid credentials
				await new Promise(resolve => setTimeout(resolve, msBetweenRefreshAttempts));
				continue;
			} else {
				success = true;
				break;
			}
		}
		return success;
	}
	return true;
}

export async function updateUserInfo() {
	const session = currentSession();
	if (!session) return;
	const response = await getVaimooUser(session);
	const email = response.email ?? '';
	const name = [response.firstName, response.lastName].filter(Boolean).join(' ') || response.userName || email;
	user.set({ email, name });
}

export async function refreshAccountInfo() {
	const snapshot = await getAccountSnapshot();
	accountInfo.set(snapshot);
	return snapshot;
}