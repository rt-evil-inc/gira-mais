import { writable } from 'svelte/store';
import { Network, type ConnectionStatus } from '@capacitor/network';
import { refreshToken } from '$lib/account';
import { updateActiveTripInfo } from '$lib/injest-api-data';

export const networkStatus = writable<boolean>(true);

Network.getStatus().then((s: ConnectionStatus) => networkStatus.set(s.connected));
Network.addListener('networkStatusChange', (status: ConnectionStatus) => {
	networkStatus.set(status.connected);
	if (status.connected) {
		refreshToken().then(updateActiveTripInfo);
	}
});