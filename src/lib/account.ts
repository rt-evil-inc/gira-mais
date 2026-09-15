import { startBackendSync, stopBackendSync } from '$lib/gira-api/backend-sync';
import { getAccountSnapshot } from '$lib/gira-api/api';
import type { AccountSnapshot, SubscriptionInfo } from '$lib/gira-api/models';
import { selectedStation } from '$lib/map.svelte';
import { currentTrip, tripRating } from '$lib/trip';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { get, writable } from 'svelte/store';
import { getVaimooUser, loginWithEmel, refreshVaimooSession, VaimooApiError } from '$lib/vaimoo-api/client';

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

let tokenRefreshTimeout: ReturnType<typeof setTimeout>|null = null;
token.subscribe(async v => {
	if (!v) return;

	startBackendSync();

	if (tokenRefreshTimeout) clearTimeout(tokenRefreshTimeout);
	tokenRefreshTimeout = setTimeout(refreshToken, Math.max(1_000, v.expiration - Date.now() - 30_000));
});

export async function loadUserCreds() {
	const email = (await Preferences.get({ key: 'email' })).value;
	const password = (await Preferences.get({ key: 'password' })).value;
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
		const responseCode = await login(v.email, v.password);
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
		if (error instanceof VaimooApiError && error.status === 401) return 100;
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
export async function refreshToken() {
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
		} catch {
			await new Promise(resolve => setTimeout(resolve, msBetweenRefreshAttempts));
		}
	}
	if (!success) {
		for (let i = 0; i < attempts && !success; i++) {
			const creds = get(userCredentials);
			if (!creds) return false;
			const res = await login(creds.email, creds.password);
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
	const tokens = get(token);
	if (!tokens) return;
	const response = await getVaimooUser({
		accessToken: tokens.accessToken,
		refreshToken: tokens.refreshToken,
		expiresAt: tokens.expiration,
		userId: tokens.userId,
		user: { userId: tokens.userId, tenantId: tokens.tenantId },
	});
	const email = response.email ?? '';
	const name = [response.firstName, response.lastName].filter(Boolean).join(' ') || response.userName || email;
	user.set({ email, name });
}

export async function refreshAccountInfo() {
	const snapshot = await getAccountSnapshot();
	accountInfo.set(snapshot);
	return snapshot;
}