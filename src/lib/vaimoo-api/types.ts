export interface VaimooAccessToken {
	token: string;
	refreshToken: string;
	createDate?: string;
	expireSeconds?: string;
}

export interface VaimooUser {
	userId: number;
	/** The refresh-token response uses `id` instead of `userId`. */
	id?: number;
	userName?: string | null;
	firstName?: string | null;
	lastName?: string | null;
	email?: string | null;
	tenantId: string;
	activeTripId?: number | null;
}

export interface VaimooLoginResponse {
	accessToken: VaimooAccessToken;
	user: VaimooUser;
}

export interface VaimooSession {
	accessToken: string;
	refreshToken: string;
	userId: number;
	expiresAt: number;
	user: VaimooUser;
}

export interface VaimooStation {
	DockingStationId: number;
	AvailableBikes: number;
	FreeDocks: number;
	DockLimit: number;
	Name: string;
	Country: string;
	City: string;
	Street: string;
	StreetBuildingIdentifier: string;
	Location: { latitude: number; longitude: number };
	IsActive: boolean;
	IsVirtual: boolean;
	ServiceStatus: string;
	Fleet: string;
	Tenant: string;
}

export interface VaimooBike {
	BikeId: number;
	VisualId: string;
	CommunicationId: string;
	BatteryPercentage: number | null;
	BatteryRemainingCapacity: number;
	RemainingDistance: number | null;
	DockingStationId: number;
	DockingPointId: number;
	DockingPointVisualId?: string | null;
	IsAvaliable: boolean;
	IsBooked: boolean;
	TripId?: number | null;
	TripVehicleState?: string | null;
	TripErrorCode?: number | null;
	UserId?: number | null;
	Model: string;
	Category: string;
	Fleet: string;
	Tenant: string;
}

export interface VaimooCurrentTrip {
	activeTripId: number | null;
	lastBikePosition: { altitude: number; latitude: number; longitude: number; timestamp: string } | null;
	bikePcbBikeState: string | null;
	tripStartDate: string | null;
	vehicleCategoryCode: string | null;
	visualId: string | null;
}

export interface VaimooTripDetails {
	tripId: number | null;
	startDate: string;
	endDate: string;
	coveredDistanceInMeters: number;
	startStation: { name: string; stationId?: number | null } | null;
	endStation: { name: string; stationId?: number | null } | null;
	tripCost: number;
	vehicle: { visualId: string; vehicleCategoryCode: string } | null;
}

export interface VaimooTripFeedback {
	createDate: string;
	osVersion: string;
	appVersion: string;
	rating: number;
	comment: string[];
	reportType: 'Opinion';
	vehicleVisualId: string;
	geoFenceId: number | null;
	tripId: number;
}

export interface VaimooSubscriptionUsage {
	currentSubscription: { name: string; membershipType?: string };
	expirationDate: string;
	isExpired?: boolean;
}

export interface VaimooPagedResponse<T> {
	count: number;
	data: T[];
	pageIndex: number;
	pageSize: number;
	totalCount: number;
	totalPages: number;
}