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
	appSettings.subscribe(async v => {
		Preferences.set({ key: 'settings/distanceLock', value: v.distanceLock.toString() });
		Preferences.set({ key: 'settings/mockUnlock', value: v.mockUnlock.toString() });
		Preferences.set({ key: 'settings/backgroundLocation', value: v.backgroundLocation.toString() });
		Preferences.set({ key: 'settings/analytics', value: v.analytics.toString() });
		Preferences.set({ key: 'settings/reportRatings', value: v.reportRatings.toString() });
		Preferences.set({ key: 'settings/theme', value: v.theme });
		Preferences.set({ key: 'settings/locale', value: v.locale });
		Preferences.set({ key: 'settings/updateWarning', value: v.updateWarning.toString() });
	});
}