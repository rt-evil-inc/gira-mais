import { CapacitorHttp } from '@capacitor/core';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { collection, getFirestore, onSnapshot, query, where, type DocumentData, type QueryConstraint } from 'firebase/firestore';
import type { VaimooBike, VaimooStation } from './types';

const FIRESTORE_PROJECT = 'vaimoorotterdam';
const FIRESTORE_API_KEY = 'AIzaSyAmKfHdjYUhzYmg7qSZtRwwYE92HQQlmJ4';
const GIRA_TENANT = 'P1/EML/EML/';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents:runQuery`;
const FIREBASE_APP_NAME = 'vaimoo-firestore';

type FirestoreValue = {
	nullValue?: null;
	booleanValue?: boolean;
	integerValue?: string;
	doubleValue?: number;
	stringValue?: string;
	timestampValue?: string;
	geoPointValue?: { latitude: number; longitude: number };
	arrayValue?: { values?: FirestoreValue[] };
	mapValue?: { fields?: Record<string, FirestoreValue> };
};

type FirestoreDocument = { fields: Record<string, FirestoreValue> };

function decodeValue(value: FirestoreValue): unknown {
	if ('nullValue' in value) return null;
	if (value.booleanValue !== undefined) return value.booleanValue;
	if (value.integerValue !== undefined) return Number(value.integerValue);
	if (value.doubleValue !== undefined) return value.doubleValue;
	if (value.stringValue !== undefined) return value.stringValue;
	if (value.timestampValue !== undefined) return value.timestampValue;
	if (value.geoPointValue !== undefined) return value.geoPointValue;
	if (value.arrayValue !== undefined) return (value.arrayValue.values ?? []).map(decodeValue);
	if (value.mapValue !== undefined) return decodeFields(value.mapValue.fields ?? {});
	return undefined;
}

function decodeFields(fields: Record<string, FirestoreValue>) {
	return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function fieldFilter(fieldPath: string, value: FirestoreValue) {
	return { fieldFilter: { field: { fieldPath }, op: 'EQUAL', value } };
}

async function queryCollection<T>(collectionId: string, filters: ReturnType<typeof fieldFilter>[]): Promise<T[]> {
	const where = filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } };
	const response = await CapacitorHttp.post({
		url: FIRESTORE_URL,
		params: { key: FIRESTORE_API_KEY },
		headers: { 'Content-Type': 'application/json' },
		data: { structuredQuery: { from: [{ collectionId }], where } },
		connectTimeout: 10_000,
		readTimeout: 15_000,
	});
	if (response.status < 200 || response.status >= 300) {
		throw new Error(`Firestore query failed with HTTP ${response.status}`);
	}
	return (response.data as { document?: FirestoreDocument }[])
		.flatMap(item => item.document ? [decodeFields(item.document.fields) as T] : []);
}

export function getFirestoreStations(): Promise<VaimooStation[]> {
	return queryCollection<VaimooStation>('docking-stations', [
		fieldFilter('Tenant', { stringValue: GIRA_TENANT }),
	]);
}

export function getFirestoreBikes(stationId: number): Promise<VaimooBike[]> {
	return queryCollection<VaimooBike>('bikes', [
		fieldFilter('Tenant', { stringValue: GIRA_TENANT }),
		fieldFilter('DockingStationId', { integerValue: String(stationId) }),
	]);
}

export function findFirestoreBike(visualId: string): Promise<VaimooBike[]> {
	return queryCollection<VaimooBike>('bikes', [
		fieldFilter('Tenant', { stringValue: GIRA_TENANT }),
		fieldFilter('VisualId', { stringValue: visualId }),
	]);
}

function firestoreDatabase() {
	const app = getApps().some(candidate => candidate.name === FIREBASE_APP_NAME)
		? getApp(FIREBASE_APP_NAME)
		: initializeApp({ apiKey: FIRESTORE_API_KEY, projectId: FIRESTORE_PROJECT }, FIREBASE_APP_NAME);
	return getFirestore(app);
}

function subscribeToQuery<T>(
	collectionId: string,
	constraints: QueryConstraint[],
	onData: (documents: T[]) => void,
	onError?: (error: Error) => void,
) {
	const firestoreQuery = query(collection(firestoreDatabase(), collectionId), ...constraints);
	return onSnapshot(
		firestoreQuery,
		snapshot => onData(snapshot.docs.map(document => document.data() as DocumentData as T)),
		error => onError?.(error),
	);
}

/** Subscribe to the same tenant-scoped station feed used by the official app. */
export function subscribeFirestoreStations(
	onData: (stations: VaimooStation[]) => void,
	onError?: (error: Error) => void,
) {
	return subscribeToQuery<VaimooStation>(
		'docking-stations',
		[where('Tenant', '==', GIRA_TENANT)],
		onData,
		onError,
	);
}

/** Keep bike details live only for the station currently being viewed. */
export function subscribeFirestoreBikes(
	stationId: number,
	onData: (bikes: VaimooBike[]) => void,
	onError?: (error: Error) => void,
) {
	return subscribeToQuery<VaimooBike>(
		'bikes',
		[where('Tenant', '==', GIRA_TENANT), where('DockingStationId', '==', stationId)],
		onData,
		onError,
	);
}

/** Follow the physical bike during start/end transitions, regardless of station assignment. */
export function subscribeFirestoreBike(
	visualId: string,
	onData: (bike: VaimooBike | null) => void,
	onError?: (error: Error) => void,
) {
	return subscribeToQuery<VaimooBike>(
		'bikes',
		[where('Tenant', '==', GIRA_TENANT), where('VisualId', '==', visualId)],
		bikes => onData(bikes[0] ?? null),
		onError,
	);
}

export const firestoreConfig = {
	project: FIRESTORE_PROJECT,
	tenant: GIRA_TENANT,
} as const;
