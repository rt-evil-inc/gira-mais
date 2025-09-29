import { get, writable } from 'svelte/store';
import { getTokensLogin, getTokensRefresh, getUserInfo } from '$lib/emel-api/emel-api';
import { currentTrip, tripRating } from '$lib/trip';
import { selectedStation } from '$lib/map.svelte';
import { Preferences } from '@capacitor/preferences';
import { startWS } from '$lib/gira-api/ws';
import { updateOnetimeInfo } from '$lib/injest-api-data';
import { GIRA_MAIS_API_URL } from './constants';
import { dev, version } from '$app/environment';
import { httpRequestWithRetry } from '$lib/utils';
import { errorMessages } from './ui.svelte';
import { t } from './translations';
import { reportErrorEvent } from '$lib/gira-mais-api/gira-mais-api';
import { encryptToken, hash } from '$lib/crypto';
import { Network } from '@capacitor/network';

export type Token = {
  accessToken: string;
	refreshToken: string;
	expiration: number;
};
export type JWT = {
	jti: string;
	sub: string;
	loginProvider: string;
	services: string[];
	nbf: number;
	exp: number;
	iat: number;
	iss: string;
	aud: string;
};
export type User = {
	email: string;
	name: string;
}
export type Subscription = {
	active: boolean;
	expirationDate: Date;
	name: string;
	subscriptionStatus: string;
	type:string
}
export type AccountInfo = {
	bonus: number;
	balance: number;
	subscription: Subscription|null;
}

export const token = writable<Token|null|undefined>(undefined);
export const encryptedFirebaseToken = writable<string|null>(null);
export const firebaseToken = writable<string|null>(null);
export const userCredentials = writable<{email: string, password: string}|null>(null);
export const user = writable<User|null>(null);
export const accountInfo = writable<AccountInfo|null>(null);

let tokenRefreshTimeout: ReturnType<typeof setTimeout>|null = null;
token.subscribe(async v => {
	if (!v) return;
	const jwt:JWT = JSON.parse(window.atob(v.accessToken.split('.')[1]));

	startWS();
	if (get(user) === null) {
		updateOnetimeInfo();
		updateUserInfo();
	}

	if (tokenRefreshTimeout) clearTimeout(tokenRefreshTimeout);
	tokenRefreshTimeout = setTimeout(refreshToken, jwt.exp * 1000 - Date.now() - 1000 * 30);
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

function isTokenExpired(token: string) {
	const jwt: JWT = JSON.parse(window.atob(token.split('.')[1]));
	return jwt.exp * 1000 < Date.now() + 1000 * 30;
}

export async function fetchFirebaseToken(userId: string, accessToken: string) {
	// Check if we already have a token that's not expired
	const currentToken = get(firebaseToken);
	if (currentToken && !isTokenExpired(currentToken)) {
		// Token is still valid, just re-encrypt it
		const encryptedToken = await encryptToken(currentToken, accessToken);
		if (encryptedToken) {
			await encryptedFirebaseToken.set(encryptedToken);
			return true;
		} else {
			// errorMessages.add(get(t)('token_encryption_error'));
			reportErrorEvent('token_encryption_error');
		}
	}

	// No valid token found, fetch a new one
	try {
		const response = await httpRequestWithRetry({
			method: 'get',
			url: GIRA_MAIS_API_URL + '/token',
			headers: {
				'User-Agent': `Gira+/${dev ? 'dev' : version}`,
				'x-user-id': userId,
			},
		});
		if (response?.status === 404) {
			// errorMessages.add(get(t)('no_tokens_available_error'));
			// reportErrorEvent('no_tokens_available_error');
			return false;
		} else if (!response || response.status !== 200 || !response.data) {
			// errorMessages.add(get(t)('token_fetch_error'));
			// reportErrorEvent('token_fetch_error', 'Response status: ' + response?.status);
			return false;
		}

		// Encrypt the token
		const encryptedToken = await encryptToken(response.data, accessToken);
		if (!encryptedToken) {
			// errorMessages.add(get(t)('token_encryption_error'));
			// reportErrorEvent('token_encryption_error');
			return false;
		}

		firebaseToken.set(response.data);
		await encryptedFirebaseToken.set(encryptedToken);
	} catch (e) {
		// errorMessages.add(get(t)('token_fetch_error'));
		// reportErrorEvent('token_fetch_error', (e as Error).message);
		return false;
	}
	return true;
}

export async function login(email: string, password: string) {
	const response = await getTokensLogin(email, password);
	if (response.error.code !== 0) return response.error.code;
	const { accessToken, refreshToken, expiration } = response.data;
	if (!accessToken || !refreshToken) return response.error.code;
	await fetchFirebaseToken(await hash(email), accessToken);
	token.set({ accessToken, refreshToken, expiration });
	return 0;
}

export async function logOut() {
	token.set(null);
	firebaseToken.set(null);
	encryptedFirebaseToken.set(null);
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
		const creds = get(userCredentials);
		if (!creds) return false;
		const response = await getTokensRefresh(tokens);
		if (!response.error || response.error.code !== 0 || !response.data.accessToken || !response.data.refreshToken) {
			await new Promise(resolve => setTimeout(resolve, msBetweenRefreshAttempts));
			continue;
		}
		const { accessToken, refreshToken, expiration } = response.data;
		await fetchFirebaseToken(await hash(creds.email), accessToken);
		token.set({ accessToken, refreshToken, expiration });
		success = true;
	}
	if (!success) {
		const success = false;
		for (let i = 0; i < attempts && !success; i++) {
			const creds = get(userCredentials);
			if (!creds) return false;
			const res = await login(creds.email, creds.password);
			if (res !== 0) {
				// Invalid credentials
				await new Promise(resolve => setTimeout(resolve, msBetweenRefreshAttempts));
				continue;
			} else {
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
	const response = await getUserInfo(tokens);
	const { email, name } = response.data;
	user.set({ email, name });
}