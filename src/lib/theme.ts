import { derived, get } from 'svelte/store';
import { appSettings } from './settings';
import { currentPos } from './location';
import SunCalc from 'suncalc';

export type Theme = 'light' | 'dark';

export const theme = derived(appSettings, ($appSettings, set) => {
	if (!$appSettings) return;

	const calculateTheme = (): Theme => {
		if ($appSettings.theme === 'daylight') {
			const now = new Date;
			const position = get(currentPos);
			const coords = position?.coords ?? { latitude: 38.7223, longitude: -9.1393 };
			const times = SunCalc.getTimes(now, coords.latitude, coords.longitude);
			const dawnMidpoint = new Date((times.dawn.getTime() + times.sunrise.getTime()) / 2);
			const duskMidpoint = new Date((times.sunset.getTime() + times.dusk.getTime()) / 2);
			return now >= dawnMidpoint && now < duskMidpoint ? 'light' : 'dark';
		}
		if ($appSettings.theme === 'system') {
			return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		}
		return $appSettings.theme as Theme;
	};

	set(calculateTheme());

	const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
	const systemThemeListener = () => set(calculateTheme());

	if ($appSettings.theme === 'system') {
		mediaQuery.addEventListener('change', systemThemeListener);
	}

	if ($appSettings.theme === 'daylight') {
		const interval = setInterval(() => {
			set(calculateTheme());
		}, 60000);
		return () => clearInterval(interval);
	}

	return () => {
		mediaQuery.removeEventListener('change', systemThemeListener);
	};
});