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
}

export const appSettings = writable<AppSettings>();

export async function loadSettings() {
	const distanceLock = (await Preferences.get({ key: 'settings/distanceLock' })).value !== 'false'; // !== 'false' is so that it defaults to true if the key is not set
	const mockUnlock = (await Preferences.get({ key: 'settings/mockUnlock' })).value !== 'false';
	const backgroundLocation = (await Preferences.get({ key: 'settings/backgroundLocation' })).value !== 'false';
	const analytics = (await Preferences.get({ key: 'settings/analytics' })).value !== 'false';
	const reportRatings = (await Preferences.get({ key: 'settings/reportRatings' })).value !== 'false';
	const theme = ((await Preferences.get({ key: 'settings/theme' })).value || 'system') as 'light'|'dark'|'system'|'daylight';
	const locale = ((await Preferences.get({ key: 'settings/locale' })).value || 'system') as 'pt'|'en'|'system';
	const updateWarning = (await Preferences.get({ key: 'settings/updateWarning' })).value !== 'false';
	appSettings.set({ distanceLock, mockUnlock, backgroundLocation, analytics, theme, locale, updateWarning, reportRatings });

	// Track previous values to only save changed settings
	let prev: AppSettings | undefined;
	appSettings.subscribe(v => {
		if (!prev) {
			prev = v;
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
		prev = v;
	});
}