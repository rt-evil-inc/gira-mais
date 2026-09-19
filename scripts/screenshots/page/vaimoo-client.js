// Stands in for src/lib/vaimoo-api/client.ts inside the screenshot browser, so
// the app's account, trip history and active trip come out of the fixture
// instead of EMEL's login and VAIMOO's API. mock-api.js serves this module in
// place of the real one and hands the fixture over on window.__giraMocks.
//
// Only what the app imports is here; the requests themselves are gone, so
// anything that took credentials now takes none and answers immediately.

const mocks = () => window.__giraMocks;

const TOKEN_LIFETIME_ms = 60 * 60 * 1000;

/** Answering straight away is not just unrealistic, it changes what the app
  * does: an active trip that lands before the map has subscribed to it never
  * pulls the camera into the navigation view. Take about as long as a round
  * trip to Lisbon would. */
const ROUND_TRIP_ms = 150;

function answer(value) {
	return new Promise(resolve => setTimeout(() => resolve(value), ROUND_TRIP_ms));
}

export class VaimooApiError extends Error {
	constructor(message, status, body) {
		super(message);
		this.name = 'VaimooApiError';
		this.status = status;
		this.body = body;
		this.errors = [{ message }];
	}
}

function session() {
	const { user } = mocks().data;
	return {
		accessToken: 'screenshots',
		refreshToken: 'screenshots',
		userId: user.userId,
		expiresAt: Date.now() + TOKEN_LIFETIME_ms,
		user,
	};
}

/** Whatever was typed gets in: the fixture has only the one account. */
export function loginWithEmel() {
	return answer(session());
}

export function refreshVaimooSession() {
	return answer(session());
}

export function getVaimooUser() {
	return answer(mocks().data.user);
}

export function getCurrentVaimooTrip() {
	const { data, trip } = mocks();
	if (!trip) return answer({ activeTripId: null, lastBikePosition: null, bikePcbBikeState: null, tripStartDate: null, vehicleCategoryCode: null, visualId: null });
	return answer({
		activeTripId: data.activeTrip.tripId,
		lastBikePosition: null,
		bikePcbBikeState: 'UNLOCKED',
		tripStartDate: new Date(trip.startedAt).toISOString(),
		vehicleCategoryCode: data.activeTrip.category,
		visualId: data.activeTrip.bike,
	});
}

/** The fixture dates its trips relative to the day the screenshots are taken,
  * in the timezone the browser is emulating, the way VAIMOO dates its own. */
function tripDates(trip) {
	const [hours, minutes] = trip.startTime.split(':').map(Number);
	const day = new Date(Date.now() - trip.daysAgo * 24 * 60 * 60 * 1000);
	const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
	return { start, end: new Date(start.getTime() + trip.minutes * 60 * 1000) };
}

function localTimestamp(date) {
	const pad = (value, length = 2) => String(value).padStart(length, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function tripDetails(trip) {
	const { start, end } = tripDates(trip);
	return {
		tripId: trip.tripId,
		startDate: localTimestamp(start),
		endDate: localTimestamp(end),
		coveredDistanceInMeters: trip.distanceMeters,
		startStation: { name: trip.from, stationId: trip.fromId },
		endStation: { name: trip.to, stationId: trip.toId },
		tripCost: 0,
		vehicle: { visualId: trip.bike, vehicleCategoryCode: trip.category },
	};
}

export function getVaimooTrips(_session, pageIndex, pageSize) {
	const trips = mocks().data.tripHistory;
	const offset = Math.max(0, pageIndex - 1) * pageSize;
	const page = trips.slice(offset, offset + pageSize);
	return answer({
		count: page.length,
		data: page.map(tripDetails),
		pageIndex,
		pageSize,
		totalCount: trips.length,
		totalPages: Math.ceil(trips.length / pageSize),
	});
}

export function getVaimooTripDetails(_session, tripId) {
	const trip = mocks().data.tripHistory.find(candidate => candidate.tripId === tripId);
	if (!trip) throw new VaimooApiError('No such trip', 404, null);
	return answer(tripDetails(trip));
}

export function submitVaimooTripFeedback() {
	return answer(null);
}

export function getVaimooSubscriptionUsage() {
	const { name, membershipType, expiresInDays } = mocks().data.subscription;
	return answer([{
		currentSubscription: { name, membershipType },
		expirationDate: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
		isExpired: false,
	}]);
}

export function getVaimooRemainingCredit() {
	return answer({ remainingCredit: mocks().data.wallet.remainingCredit });
}

export function quickStartVaimooTrip() {
	return answer(undefined);
}