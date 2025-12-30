import type { Q } from '$lib/gira-api/api-types';
import type { ActiveTripSubscription } from '$lib/gira-api/ws-types';
import { get } from 'svelte/store';
import { currentPos } from '$lib/location';
import { stations, type StationInfo } from '$lib/map.svelte';
import { currentTrip, endTrip, tripRating } from '$lib/trip';
import { fullOnetimeInfo, getActiveTripInfo, getStations, rateTrip, tripPayWithNoPoints, tripPayWithPoints } from '$lib/gira-api/api';
import { accountInfo } from '$lib/account';

export async function updateOnetimeInfo() {
	const resp = await fullOnetimeInfo();
	ingestStations(resp);
	ingestAccountInfo(resp);
	ingestSubscriptions(resp);
	ingestActiveTripInfo(resp);
	ingestLastUnratedTrip(resp);
}

export function updateActiveTripInfo() {
	getActiveTripInfo().then(ingestActiveTripInfo);
}

export async function updateStations() {
	getStations().then(ingestStations);
}

export function updateWithTripMessage(recvTrip:ActiveTripSubscription) {
	console.debug('ingesting trip message from ws', recvTrip);
	const ct = get(currentTrip);

	if (recvTrip.code === 'no_trip' || recvTrip.bike === 'dummy') {
		if (ct?.confirmed || Date.now() - (ct?.startDate?.getTime() ?? 0) > 30000) {
			updateActiveTripInfo(); // double-check if trip finished
		}
		return;
	}

	if (recvTrip.finished) {
		if (recvTrip.canUsePoints) tripPayWithPoints(recvTrip.code);
		else if (recvTrip.canPayWithMoney) tripPayWithNoPoints(recvTrip.code);
	}

	if (recvTrip.code === ct?.code) ingestCurrentTripUpdate(recvTrip);
	else ingestOtherTripUpdate(recvTrip);
}

export function ingestStations(maybeStations:Q<['getStations']>) {
	if (maybeStations.getStations === null || maybeStations.getStations === undefined) return;
	const stationsList:StationInfo[] = [];
	maybeStations.getStations.forEach(station => {
		if (station === null || station === undefined) return;
		const { code, name, description, latitude, longitude, bikes, docks, serialNumber, assetStatus } = station;
		if (code === null || code === undefined || name === null ||
			name === undefined || description === undefined ||
			latitude === null || latitude === undefined || longitude === null ||
			longitude === undefined || bikes === null || bikes === undefined ||
			docks === null || docks === undefined || serialNumber === null ||
			serialNumber === undefined || assetStatus === null || assetStatus === undefined
		) {
			console.error('invalid station', station);
			return;
		}
		stationsList.push({ code, name, description, latitude, longitude, bikes, docks, serialNumber, assetStatus });
	});
	stations.value = stationsList;
}

export function ingestAccountInfo(maybePointsAndBalance:Q<['client']>) {
	if (maybePointsAndBalance.client === null || maybePointsAndBalance.client === undefined || maybePointsAndBalance.client.length <= 0) return;
	const { balance, bonus } = maybePointsAndBalance.client[0]!;
	if (balance === null || balance === undefined || bonus === null || bonus === undefined) return;
	accountInfo.update(ai => (
		{ subscription: ai?.subscription ?? null, balance, bonus }
	));
}

export async function ingestSubscriptions(maybeSubscriptions:Q<['activeUserSubscriptions']>) {
	if (maybeSubscriptions.activeUserSubscriptions === null || maybeSubscriptions.activeUserSubscriptions === undefined || maybeSubscriptions.activeUserSubscriptions.length <= 0) return;
	const { active, expirationDate, name, subscriptionStatus, type } = maybeSubscriptions.activeUserSubscriptions[0]!;
	accountInfo.update(ai => (
		{ balance: ai?.balance ?? 0, bonus: ai?.bonus ?? 0, subscription: { active: active!, expirationDate: new Date(expirationDate), name: name!, subscriptionStatus: subscriptionStatus!, type: type ?? 'unknown' } }
	));
}

export function ingestActiveTripInfo(maybeTrips:Q<['activeTrip']>) {
	if (maybeTrips.activeTrip === null || maybeTrips.activeTrip === undefined || maybeTrips.activeTrip.code === 'no_trip' || maybeTrips.activeTrip.asset === 'dummy') {
		const ct = get(currentTrip);
		if (ct?.confirmed || Date.now() - (ct?.startDate?.getTime() ?? 0) > 30000) {
			endTrip();
		}
		return;
	}
	const {
		// asset,
		startDate,
		code,
		// user,
		// endDate,
		// startLocation,
		// endLocation,
		// rating,
		// photo,
		// cost,
		// startOccupation,
		// endOccupation,
		// totalBonus,
		// client,
		// costBonus,
		// comment,
		// compensationTime,
		// endTripDock,
		// tripStatus,
		// name,
		// description,
		// creationDate,
		// createdBy,
		// updateDate,
		// updatedBy,
		// defaultOrder,
		// version,
	} = maybeTrips.activeTrip!;
	currentTrip.update(ct => ({
		code: code!,
		bikePlate: ct?.bikePlate ?? null,
		startPos: ct?.startPos ?? null,
		destination: ct?.destination ?? null,
		traveledDistanceKm: ct?.traveledDistanceKm ?? 0,
		distanceLeft: ct?.distanceLeft ?? null,
		speed: ct?.speed ?? 0,
		startDate: new Date(startDate!),
		predictedEndDate: ct?.predictedEndDate ?? null,
		arrivalTime: ct?.predictedEndDate ?? null,
		finished: false,
		confirmed: true,
		pathTaken: ct?.pathTaken ?? [],
		lastUpdate: new Date,
	}));
}

export function ingestLastUnratedTrip(lastTripData:Q<['unratedTrips', 'tripHistory']>) {
	if (lastTripData.unratedTrips === null || lastTripData.unratedTrips === undefined || lastTripData.unratedTrips.length <= 0) return;
	const unratedTrip = lastTripData.unratedTrips[0];
	if (unratedTrip == null || unratedTrip.code == null || unratedTrip.asset == null) return;
	const endToNow = (new Date).getTime() - new Date(unratedTrip.endDate).getTime();
	if (unratedTrip) tripPayWithPoints(unratedTrip.code); // attempt to pay with points just in case
	// check if 7 days have passed
	if (endToNow > 24 * 60 * 60 * 1000 * 7){
		// auto-rate trip as 5 stars
		rateTrip(unratedTrip.code, 5)
		return;
	}
	let bikePlate;
	if (lastTripData.tripHistory !== null && lastTripData.tripHistory !== undefined && lastTripData.tripHistory.length > 0) {
		const lastTrip = lastTripData.tripHistory[0];
		if (lastTrip) {
			const lastTripCode = lastTrip?.code;
			bikePlate = lastTrip.bikeName;
			if (lastTripCode !== unratedTrip.code) return;
		}
	}
	if (bikePlate === null || bikePlate === undefined) {
		console.warn('ingestLastUnratedTrip: bike plate is null or undefined');
		return;
	}

	tripRating.set({
		currentRating: {
			code: unratedTrip.code,
			bikePlate,
			startDate: new Date(unratedTrip.startDate),
			endDate: new Date(unratedTrip.endDate),
			tripPoints: unratedTrip.costBonus || 0,
		},
	});
}

export function ingestCurrentTripUpdate(recvTrip:ActiveTripSubscription) {
	if (recvTrip.finished) {
		currentTrip.set(null);
		if (!recvTrip.canceled) {
			tripRating.update(rating => {
				rating.currentRating = {
					code: recvTrip.code,
					bikePlate: recvTrip.bike,
					startDate: new Date(recvTrip.startDate),
					endDate: new Date(recvTrip.endDate ?? 0),
					tripPoints: recvTrip.tripPoints ?? 0,
				};
				return rating;
			});
		}
	} else {
		currentTrip.update(trip => {
			if (trip === null) throw new Error('trip is null in impossible place');
			return {
				...trip,
				startDate: new Date(recvTrip.startDate),
				bikePlate: recvTrip.bike,
				code: recvTrip.code,
				confirmed: true,
				lastUpdate: new Date,
			};
		});
	}
}

export function ingestOtherTripUpdate(recvTrip:ActiveTripSubscription) {
	if (recvTrip.finished) return;
	const p = get(currentPos);
	currentTrip.set({
		startDate: new Date(recvTrip.startDate),
		bikePlate: recvTrip.bike,
		code: recvTrip.code,
		finished: recvTrip.finished,
		startPos: null,
		destination: null,
		traveledDistanceKm: 0,
		distanceLeft: null,
		speed: 0,
		predictedEndDate: null,
		arrivalTime: null,
		confirmed: true,
		pathTaken: p ? [{
			lat: p.coords.latitude,
			lng: p.coords.longitude,
			time: new Date,
		}] : [],
		lastUpdate: new Date,
	});
}