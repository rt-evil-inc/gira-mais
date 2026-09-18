// Stands in for src/lib/vaimoo-api/firestore.ts inside the screenshot browser.
//
// The station and bike feeds are Firestore listeners, not HTTP calls, so they
// cannot be replayed by intercepting requests; mock-api.js serves this module
// in place of the real one instead. The fixture is handed over on
// window.__giraMocks (see mock-api.js), which is in place before the app loads.

const mocks = () => window.__giraMocks;

const stations = () => mocks().data.stations;

const bikesAt = stationId => mocks().data.stationBikes[String(stationId)] ?? [];

const everyBike = () => Object.values(mocks().data.stationBikes).flat();

/** The bike of the trip scene, out on the road: undocked, still on its trip.
  * The app watches it to notice a trip ending, so it must never look locked
  * and tripless. */
function ridingBike() {
	const { data, trip } = mocks();
	if (!trip) return null;
	return {
		BikeId: data.activeTrip.bikeId,
		VisualId: data.activeTrip.bike,
		CommunicationId: data.activeTrip.communicationId,
		BatteryPercentage: data.activeTrip.battery,
		BatteryRemainingCapacity: data.activeTrip.battery,
		RemainingDistance: null,
		DockingStationId: 0,
		DockingPointId: 0,
		DockingPointVisualId: null,
		IsAvaliable: false,
		IsBooked: false,
		TripId: data.activeTrip.tripId,
		TripVehicleState: 'UNLOCKED',
		TripErrorCode: null,
		UserId: data.user.userId,
		Model: 'GIRAElectric',
		Category: data.activeTrip.category,
		Fleet: 'LSB',
		Tenant: data.user.tenantId,
	};
}

/** Answers once, like a listener on a collection that never changes again. */
function subscribe(documents, onData) {
	const timeout = setTimeout(() => onData(documents), 0);
	return () => clearTimeout(timeout);
}

export function getFirestoreStations() {
	return Promise.resolve(stations());
}

export function getFirestoreBikes(stationId) {
	return Promise.resolve(bikesAt(stationId));
}

export function findFirestoreBike(visualId) {
	const riding = ridingBike();
	if (riding?.VisualId === visualId) return Promise.resolve([riding]);
	return Promise.resolve(everyBike().filter(bike => bike.VisualId === visualId));
}

export function subscribeFirestoreStations(onData) {
	return subscribe(stations(), onData);
}

export function subscribeFirestoreBikes(stationId, onData) {
	return subscribe(bikesAt(stationId), onData);
}

export function subscribeFirestoreBike(visualId, onData) {
	const riding = ridingBike();
	const bike = riding?.VisualId === visualId ? riding : everyBike().find(candidate => candidate.VisualId === visualId) ?? null;
	return subscribe(bike, onData);
}