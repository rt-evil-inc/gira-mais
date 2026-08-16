import { encryptedFirebaseToken, token } from '$lib/account';
import { get } from 'svelte/store';
import type { WSEvent } from '$lib/gira-api/ws-types';
import { randomUUID } from '$lib/utils';
import { updateWithTripMessage, ingestStations } from '$lib/injest-api-data';
import { GIRA_WS_URL } from '$lib/constants';

let ws: WebSocket;
export function startWS() {
	console.debug('starting ws');
	const tokens = get(token);
	const access = tokens?.accessToken;
	const firebase = get(encryptedFirebaseToken);
	if (!access) return;
	if (ws) {
		if (ws.readyState === WebSocket.CONNECTING) return;
		if (ws.readyState === WebSocket.OPEN) return;
	}

	ws = new WebSocket(GIRA_WS_URL + '/graphql', 'graphql-ws');
	ws.onopen = () => {
		backoff = 0;
		console.debug('ws opened');
		ws.send(JSON.stringify({
			'type': 'connection_init',
			'payload': firebase ? {
				'headers': {
					'x-firebase-token': firebase,
				},
			} : {},
		}));
		ws.send(JSON.stringify({
			'type': 'start',
			'id': randomUUID(),
			'payload': {
				'operationName': 'activeTripSubscription',
				'query': 'subscription activeTripSubscription($_access_token: String) { activeTripSubscription(_access_token: $_access_token) { code bike startDate endDate cost finished canPayWithMoney canUsePoints clientPoints tripPoints canceled period periodTime error}}',
				'variables': {
					'_access_token': access,
				},
			},
		}));
		ws.send(JSON.stringify({
			'type': 'start',
			'id': randomUUID(),
			'payload': {
				'operationName': 'operationalStationsSubscription',
				'query': 'subscription operationalStationsSubscription {operationalStationsSubscription {assetCondition, assetStatus, assetType, code, description, latitude, longitude, name, bikes, docks, serialNumber, stype}}',
				'variables': {
					'_access_token': access,
				},
			},
		}));
	};

	ws.onmessage = (event:MessageEvent<string>) => {
		const eventData = JSON.parse(event.data) as WSEvent;
		console.debug('ws message', eventData);
		if (eventData.type === 'data') {
			const payload = eventData.payload;
			if (payload && payload.data) {
				const data = payload.data;
				if (data.operationalStationsSubscription) {
					console.debug('updated stations with websocket');
					ingestStations({ getStations: data.operationalStationsSubscription });
				} else if (data.activeTripSubscription) {
					const recvTrip = data.activeTripSubscription;
					updateWithTripMessage(recvTrip);
				} else if (data.serverDate) {
					console.debug('serverdate', data.serverDate.date);
					console.debug('serverdate diff', new Date(data.serverDate.date).getTime() - Date.now(), 'ms');
				}
			}
		}
	};

	let backoff = 0;
	const restartWS = () => {
		setTimeout(() => {
			startWS();
			backoff += 1000;
		}, backoff);
	};
	ws.onclose = e => {
		console.debug('ws closed', e);
		restartWS();
	};
	ws.onerror = e => {
		console.debug('ws error', e);
		restartWS();
	};
}