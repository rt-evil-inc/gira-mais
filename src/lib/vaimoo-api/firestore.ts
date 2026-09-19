import { GIRA_TENANT } from '$lib/constants';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore, onSnapshot, query, where, type DocumentData, type QueryConstraint } from 'firebase/firestore';
import type { VaimooBike, VaimooStation } from './types';

// Public client credentials of the official VAIMOO app; GIRA shares this project with other VAIMOO tenants.
const FIRESTORE_PROJECT = 'vaimoorotterdam';
const FIRESTORE_API_KEY = 'AIzaSyAmKfHdjYUhzYmg7qSZtRwwYE92HQQlmJ4';
const FIREBASE_APP_NAME = 'vaimoo-firestore';

function firestoreDatabase() {
	const app = getApps().some(candidate => candidate.name === FIREBASE_APP_NAME) ?
		getApp(FIREBASE_APP_NAME) :
		initializeApp({ apiKey: FIRESTORE_API_KEY, projectId: FIRESTORE_PROJECT }, FIREBASE_APP_NAME);
	return getFirestore(app);
}

function tenantQuery(collectionId: string, ...constraints: QueryConstraint[]) {
	return query(collection(firestoreDatabase(), collectionId), where('Tenant', '==', GIRA_TENANT), ...constraints);
}

async function queryOnce<T>(collectionId: string, ...constraints: QueryConstraint[]): Promise<T[]> {
	const snapshot = await getDocs(tenantQuery(collectionId, ...constraints));
	return snapshot.docs.map(document => document.data() as DocumentData as T);
}

const RESUBSCRIBE_BASE_DELAY_MS = 5_000;
const RESUBSCRIBE_MAX_DELAY_MS = 60_000;

// Firestore stops delivering snapshots after the error callback fires, so a single failure would
// otherwise freeze the station map for the rest of the session. Report it and resubscribe with backoff.
function subscribeToQuery<T>(
	collectionId: string,
	constraints: QueryConstraint[],
	onData: (documents: T[]) => void,
	onError?: (error: Error) => void,
) {
	let stopped = false;
	let failures = 0;
	let unsubscribe = () => {};
	let retry: ReturnType<typeof setTimeout> | null = null;
	const subscribe = () => {
		unsubscribe = onSnapshot(
			tenantQuery(collectionId, ...constraints),
			snapshot => {
				failures = 0;
				onData(snapshot.docs.map(document => document.data() as DocumentData as T));
			},
			error => {
				onError?.(error);
				if (stopped) return;
				const delay = Math.min(RESUBSCRIBE_MAX_DELAY_MS, RESUBSCRIBE_BASE_DELAY_MS * 2 ** failures++);
				console.warn(`Firestore listener on ${collectionId} failed, resubscribing in ${delay}ms`);
				retry = setTimeout(subscribe, delay);
			},
		);
	};
	subscribe();
	return () => {
		stopped = true;
		if (retry) clearTimeout(retry);
		unsubscribe();
	};
}

export function getFirestoreStations(): Promise<VaimooStation[]> {
	return queryOnce<VaimooStation>('docking-stations');
}

export function getFirestoreBikes(stationId: number): Promise<VaimooBike[]> {
	return queryOnce<VaimooBike>('bikes', where('DockingStationId', '==', stationId));
}

export function findFirestoreBike(visualId: string): Promise<VaimooBike[]> {
	return queryOnce<VaimooBike>('bikes', where('VisualId', '==', visualId));
}

/** Subscribe to the same tenant-scoped station feed used by the official app. */
export function subscribeFirestoreStations(
	onData: (stations: VaimooStation[]) => void,
	onError?: (error: Error) => void,
) {
	return subscribeToQuery<VaimooStation>('docking-stations', [], onData, onError);
}

/** Keep bike details live only for the station currently being viewed. */
export function subscribeFirestoreBikes(
	stationId: number,
	onData: (bikes: VaimooBike[]) => void,
	onError?: (error: Error) => void,
) {
	return subscribeToQuery<VaimooBike>('bikes', [where('DockingStationId', '==', stationId)], onData, onError);
}

/** Follow the physical bike during start/end transitions, regardless of station assignment. */
export function subscribeFirestoreBike(
	visualId: string,
	onData: (bike: VaimooBike | null) => void,
	onError?: (error: Error) => void,
) {
	return subscribeToQuery<VaimooBike>('bikes', [where('VisualId', '==', visualId)], bikes => onData(bikes[0] ?? null), onError);
}