import { beforeEach, describe, expect, it } from 'vitest';
import { addToSearchHistory, loadSearchHistory, searchHistory, type SearchHistoryEntry } from '$lib/search-history';
import { get } from 'svelte/store';

const lisbon = (name: string, lat = 38.7): SearchHistoryEntry => ({ type: 'location', name, lat, lng: -9.14 });

describe('search history', () => {
	beforeEach(() => {
		localStorage.clear();
		searchHistory.set([]);
	});

	it('keeps the most recent selections first and deduplicates repeats', () => {
		addToSearchHistory(lisbon('Rossio'));
		addToSearchHistory({ type: 'station', name: '481 - Cais do Sodré', lat: 38.7063, lng: -9.1449, stationSerial: 'sodre' });
		addToSearchHistory(lisbon('Rossio'));
		const names = get(searchHistory).map(e => e.name);
		expect(names).toEqual(['Rossio', '481 - Cais do Sodré']);
	});

	it('caps the history size', () => {
		for (let i = 0; i < 15; i++) addToSearchHistory(lisbon(`Place ${i}`));
		expect(get(searchHistory)).toHaveLength(10);
		expect(get(searchHistory)[0].name).toBe('Place 14');
	});

	it('persists across reloads', async () => {
		addToSearchHistory(lisbon('Rossio'));
		searchHistory.set([]);
		await loadSearchHistory();
		expect(get(searchHistory).map(e => e.name)).toEqual(['Rossio']);
	});
});