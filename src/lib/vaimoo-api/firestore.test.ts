import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getDocs: vi.fn(),
	onSnapshot: vi.fn(),
	where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
	query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints })),
}));
vi.mock('firebase/app', () => ({ getApps: () => [], getApp: vi.fn(), initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/firestore', () => ({
	getFirestore: vi.fn(() => ({})),
	collection: vi.fn((_db: unknown, id: string) => ({ id })),
	getDocs: mocks.getDocs,
	onSnapshot: mocks.onSnapshot,
	query: mocks.query,
	where: mocks.where,
}));

import { findFirestoreBike, getFirestoreBikes, getFirestoreStations, subscribeFirestoreBike, subscribeFirestoreStations } from './firestore';

const snapshot = (documents: unknown[]) => ({ docs: documents.map(data => ({ data: () => data })) });

describe('VAIMOO Firestore adapter', () => {
	beforeEach(() => vi.clearAllMocks());

	it('reads station documents scoped to the GIRA tenant', async () => {
		mocks.getDocs.mockResolvedValue(snapshot([{ DockingStationId: 4551, AvailableBikes: 2 }]));

		const stations = await getFirestoreStations();
		expect(stations[0]).toMatchObject({ DockingStationId: 4551, AvailableBikes: 2 });
		expect(mocks.query.mock.calls[0][0]).toEqual({ id: 'docking-stations' });
		expect(mocks.query.mock.calls[0].slice(1)).toEqual([{ field: 'Tenant', op: '==', value: 'P1/EML/EML/' }]);
	});

	it('queries bikes by station or visual ID', async () => {
		mocks.getDocs.mockResolvedValue(snapshot([]));
		await getFirestoreBikes(4551);
		await findFirestoreBike('E0980');

		expect(mocks.query.mock.calls[0].slice(1)).toContainEqual({ field: 'DockingStationId', op: '==', value: 4551 });
		expect(mocks.query.mock.calls[1].slice(1)).toContainEqual({ field: 'VisualId', op: '==', value: 'E0980' });
	});

	it('resubscribes with backoff after a listener error and stops once unsubscribed', () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		try {
			const errors: ((error: Error) => void)[] = [];
			mocks.onSnapshot.mockImplementation((_query: unknown, _next: unknown, onError: (error: Error) => void) => {
				errors.push(onError);
				return () => {};
			});
			const onError = vi.fn();
			const unsubscribe = subscribeFirestoreStations(() => {}, onError);
			expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);

			errors[0](new Error('permission-denied'));
			expect(onError).toHaveBeenCalledOnce();
			vi.advanceTimersByTime(4_999);
			expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);
			vi.advanceTimersByTime(1);
			expect(mocks.onSnapshot).toHaveBeenCalledTimes(2);

			// the delay doubles while failures keep coming
			errors[1](new Error('permission-denied'));
			vi.advanceTimersByTime(9_999);
			expect(mocks.onSnapshot).toHaveBeenCalledTimes(2);
			vi.advanceTimersByTime(1);
			expect(mocks.onSnapshot).toHaveBeenCalledTimes(3);

			// unsubscribing while a retry is pending cancels it
			errors[2](new Error('permission-denied'));
			unsubscribe();
			vi.advanceTimersByTime(120_000);
			expect(mocks.onSnapshot).toHaveBeenCalledTimes(3);
		} finally {
			vi.useRealTimers();
		}
	});

	it('reports a missing bike as null when following a single bike', () => {
		const onData = vi.fn();
		mocks.onSnapshot.mockImplementation((_query: unknown, next: (s: unknown) => void) => {
			next(snapshot([]));
			return () => {};
		});
		subscribeFirestoreBike('E0980', onData);
		expect(onData).toHaveBeenCalledWith(null);
	});
});