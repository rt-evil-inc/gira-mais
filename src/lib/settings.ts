import { Preferences } from '@capacitor/preferences';
import { writable } from 'svelte/store';

export type AppSettings = {
	distanceLock: boolean;
	mockUnlock: boolean;
	backgroundLocation: boolean;
	analytics: boolean;
	reportRatings: boolean;
	theme: 'light'|'dark'|'system'|'daylight';
	locale: 'pt'|'en'|'system';
	updateWarning: boolean;
	/** Development only: glide the location marker and the camera between fixes
	 * instead of placing them straight onto each one. */
	markerSmoothing: boolean;
}

export const appSettings = writable<AppSettings>();

export async function loadSettings() {
	// Every read is a native bridge round trip and the whole UI waits on this
	// (the layout renders nothing until the theme is known), so issue them all
	// at once instead of one after the other
	const keys = ['distanceLock', 'mockUnlock', 'backgroundLocation', 'analytics', 'reportRatings', 'theme', 'locale', 'updateWarning', 'markerSmoothing'] as const;
	const values = await Promise.all(keys.map(key => Preferences.get({ key: `settings/${key}` }).then(r => r.value)));
	const raw = Object.fromEntries(keys.map((key, i) => [key, values[i]])) as Record<typeof keys[number], string|null>;
	const distanceLock = raw.distanceLock !== 'false'; // !== 'false' is so that it defaults to true if the key is not set
	const mockUnlock = raw.mockUnlock !== 'false';
	const backgroundLocation = raw.backgroundLocation !== 'false';
	const analytics = raw.analytics !== 'false';
	const reportRatings = raw.reportRatings !== 'false';
	const theme = (raw.theme || 'system') as 'light'|'dark'|'system'|'daylight';
	const locale = (raw.locale || 'system') as 'pt'|'en'|'system';
	const updateWarning = raw.updateWarning !== 'false';
	const markerSmoothing = raw.markerSmoothing !== 'false';
	appSettings.set({ distanceLock, mockUnlock, backgroundLocation, analytics, theme, locale, updateWarning, reportRatings, markerSmoothing });

	// Track previous values to only save changed settings
	let prev: AppSettings | undefined;
	appSettings.subscribe(v => {
		if (!prev) {
			prev = { ...v };
			return; // Skip initial subscription call
		}
		// Only save settings that have actually changed
		if (v.distanceLock !== prev.distanceLock) Preferences.set({ key: 'settings/distanceLock', value: v.distanceLock.toString() });
		if (v.mockUnlock !== prev.mockUnlock) Preferences.set({ key: 'settings/mockUnlock', value: v.mockUnlock.toString() });
		if (v.backgroundLocation !== prev.backgroundLocation) Preferences.set({ key: 'settings/backgroundLocation', value: v.backgroundLocation.toString() });
		if (v.analytics !== prev.analytics) Preferences.set({ key: 'settings/analytics', value: v.analytics.toString() });
		if (v.reportRatings !== prev.reportRatings) Preferences.set({ key: 'settings/reportRatings', value: v.reportRatings.toString() });
		if (v.theme !== prev.theme) Preferences.set({ key: 'settings/theme', value: v.theme });
		if (v.locale !== prev.locale) Preferences.set({ key: 'settings/locale', value: v.locale });
		if (v.updateWarning !== prev.updateWarning) Preferences.set({ key: 'settings/updateWarning', value: v.updateWarning.toString() });
		if (v.markerSmoothing !== prev.markerSmoothing) Preferences.set({ key: 'settings/markerSmoothing', value: v.markerSmoothing.toString() });
		prev = { ...v };
	});
}