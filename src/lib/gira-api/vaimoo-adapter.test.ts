import { writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getFirestoreStations: vi.fn(),
	getFirestoreBikes: vi.fn(),
	findFirestoreBike: vi.fn(),
	quickStartVaimooTrip: vi.fn(),
	getCurrentVaimooTrip: vi.fn(),
	getVaimooRemainingCredit: vi.fn(),
	getVaimooSubscriptionUsage: vi.fn(),
}));

vi.mock('$lib/account', () => ({
	token: writable({ accessToken: 'access', refreshToken: 'refresh', expiration: Date.now() + 60_000, userId: 42, tenantId: 'P1/EML/EML/' }),
}));
vi.mock('$lib/vaimoo-api/firestore', () => mocks);
vi.mock('$lib/vaimoo-api/client', () => ({
	quickStartVaimooTrip: mocks.quickStartVaimooTrip,
	getCurrentVaimooTrip: mocks.getCurrentVaimooTrip,
	getVaimooRemainingCredit: mocks.getVaimooRemainingCredit,
	getVaimooSubscriptionUsage: mocks.getVaimooSubscriptionUsage,
}));

import { findAvailableBike, getAccountSnapshot, getActiveTrip, getStationBikes, getStations, quickStartBike } from './api';

const station = {
	DockingStationId: 4551,
	AvailableBikes: 2,
	FreeDocks: 3,
	DockLimit: 6,
	Name: '777 - Emel Station',
	Country: 'Portugal',
	City: 'Lisboa',
	Street: 'Avenida',
	StreetBuildingIdentifier: '',
	Location: { latitude: 38.77, longitude: -9.15 },
	IsActive: true,
	IsVirtual: false,
	ServiceStatus: 'AVAILABLE',
	Fleet: 'LSB',
	Tenant: 'P1/EML/EML/',
};

const bike = {
	BikeId: 1,
	VisualId: 'E0980',
	CommunicationId: 'communication-id',
	BatteryPercentage: 98,
	BatteryRemainingCapacity: 0,
	RemainingDistance: null,
	DockingStationId: 4551,
	DockingPointId: 443,
	DockingPointVisualId: '2',
	IsAvaliable: true,
	IsBooked: false,
	Model: '',
	Category: 'E-Bike',
	Fleet: 'LSB',
	Tenant: 'P1/EML/EML/',
};

describe('VAIMOO app-domain adapter', () => {
	beforeEach(() => vi.clearAllMocks());

	it('uses authoritative station availability and real dock labels', async () => {
		mocks.getFirestoreStations.mockResolvedValue([station]);
		mocks.getFirestoreBikes.mockResolvedValue([bike]);

		expect((await getStations())[0]).toMatchObject({ serialNumber: '4551', bikes: 2, docks: 6, freeDocks: 3 });
		expect((await getStationBikes('4551'))[0]).toMatchObject({ id: 'E0980', communicationId: 'communication-id', battery: 98, dock: '2' });
	});

	it('resolves a manually entered bike from live Firestore data', async () => {
		mocks.findFirestoreBike.mockResolvedValue([bike]);
		expect(await findAvailableBike('e0980')).toMatchObject({ id: 'E0980', manual: true });
	});

	it('quick-starts directly without a fake reservation', async () => {
		mocks.quickStartVaimooTrip.mockResolvedValue(undefined);
		await quickStartBike('communication-id');
		expect(mocks.quickStartVaimooTrip).toHaveBeenCalledWith(expect.objectContaining({ userId: 42 }), 'communication-id');
	});

	it('treats VAIMOO activeTripId zero as no active trip', async () => {
		mocks.getCurrentVaimooTrip.mockResolvedValue({ activeTripId: 0 });
		expect(await getActiveTrip()).toBeNull();
	});

	it('maps credit and infers subscription status when isExpired is omitted', async () => {
		mocks.getVaimooRemainingCredit.mockResolvedValue({ remainingCredit: 1.73 });
		mocks.getVaimooSubscriptionUsage.mockResolvedValue([{
			currentSubscription: { name: 'Passe Diário', membershipType: '' },
			expirationDate: '2099-09-15T10:38:39.343Z',
		}]);

		expect(await getAccountSnapshot()).toMatchObject({
			balance: 1.73,
			subscription: { active: true, name: 'Passe Diário', status: 'Active' },
		});
	});
});