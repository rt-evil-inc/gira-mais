export type AvailableBike = {
	id: string;
	communicationId: string;
	type: 'classic' | 'electric';
	battery: number | null;
	remainingDistanceKm: number | null;
	dock: string | null;
	stationId: string;
	manual?: boolean;
};

export type ServerActiveTrip = {
	id: string;
	bikeId: string | null;
	startedAt: Date;
	bikeState: string | null;
};

export type CompletedTrip = {
	id: string;
	startedAt: Date;
	endedAt: Date;
	bikeId: string | null;
	bikeType: string | null;
	startStation: string | null;
	endStation: string | null;
	distanceMeters: number;
	cost: number | null;
};

export type SubscriptionInfo = {
	active: boolean;
	expiresAt: Date;
	name: string;
	status: string;
	type: string;
};

export type AccountSnapshot = {
	balance: number;
	subscription: SubscriptionInfo | null;
};