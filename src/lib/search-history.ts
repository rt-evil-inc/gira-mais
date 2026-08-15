import { Preferences } from '@capacitor/preferences';
import { writable } from 'svelte/store';
import type { Destination } from '$lib/routing';

const STORAGE_KEY = 'searchHistory';
const MAX_ENTRIES = 10;

export type SearchHistoryEntry = Destination & { name: string };

export const searchHistory = writable<SearchHistoryEntry[]>([]);

function sameEntry(a: SearchHistoryEntry, b: SearchHistoryEntry) {
	if (a.type === 'station' || b.type === 'station') {
		return a.type === 'station' && b.type === 'station' && a.stationSerial === b.stationSerial;
	}
	return a.name === b.name && a.lat === b.lat && a.lng === b.lng;
}

export async function loadSearchHistory() {
	try {
		const { value } = await Preferences.get({ key: STORAGE_KEY });
		if (!value) return;
		const entries = JSON.parse(value) as SearchHistoryEntry[];
		searchHistory.set(entries.filter(e => e && typeof e.name === 'string' && typeof e.lat === 'number' && typeof e.lng === 'number'));
	} catch (e) {
		console.error('Failed to load search history', e);
	}
}

/** Record a search selection, moving repeats to the front */
export function addToSearchHistory(entry: SearchHistoryEntry) {
	searchHistory.update(history => {
		const next = [entry, ...history.filter(h => !sameEntry(h, entry))].slice(0, MAX_ENTRIES);
		Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(next) });
		return next;
	});
}

loadSearchHistory();