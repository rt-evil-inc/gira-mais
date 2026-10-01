import { errorDetails } from '$lib/error-reporting';
import { reportUnlockAttemptEvent, reportUnlockResultEvent } from '$lib/gira-mais-api/gira-mais-api';
import type { UnlockAttemptPostRequest, UnlockResultPostRequest } from '$lib/gira-mais-api/types';
import { VaimooApiError } from '$lib/vaimoo-api/client';
import { subscribeFirestoreBike } from '$lib/vaimoo-api/firestore';
import type { VaimooBike } from '$lib/vaimoo-api/types';

// Unlock statistics (/statistics/unlocks) for the bikes the app offers although the server flags them
// unavailable, to notice if VAIMOO stops releasing them. An attempt is reported as soon as VAIMOO answers the
// unlock request, with the bike's record as the app saw it; an accepted one is completed later with whether
// the bike really released (outcome "confirmed").

/** How long to watch the bike's record; a dock that hasn't let go by then isn't going to. */
const RESULT_TIMEOUT_MS = 90_000;

/** The bike an unlock is attempted on, as it was offered in the station menu. */
export type UnlockSubject = {
	/** 'listed' as available, or 'hidden': offered despite the server flagging it unavailable. */
	source: UnlockAttemptPostRequest['source'];
	/** The server's hiding reasons, or null for a bike the server lists as available. */
	hiddenReasons: string[] | null;
	record: VaimooBike | null;
};

export type UnlockRequestOutcome = UnlockAttemptPostRequest['request'];

export type UnlockReport = {
	attemptId: string;
	bike: string;
	/** Settles once the attempt has been posted, so the result never reaches the server before its attempt. */
	sent: Promise<unknown>;
};

/** Only the bikes the server doesn't offer itself are reported. */
export function isReportedUnlock(subject: UnlockSubject | undefined): subject is UnlockSubject {
	return subject !== undefined && subject.source !== 'listed';
}

function newAttemptId() {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function reportUnlockAttempt(
	subject: UnlockSubject,
	context: { bike: string; station: string },
	request: UnlockRequestOutcome,
	error?: unknown,
): UnlockReport {
	const attemptId = newAttemptId();
	const sent = reportUnlockAttemptEvent({
		attemptId,
		survey: false,
		bike: context.bike,
		station: context.station,
		source: subject.source,
		hiddenReasons: subject.hiddenReasons,
		request,
		vaimooCode: error instanceof VaimooApiError ? error.code : null,
		details: {
			record: subject.record,
			...error !== undefined && { error: errorDetails(error) },
		},
	}).catch(err => console.error('Failed to report unlock attempt', err));
	return { attemptId, bike: context.bike, sent };
}

type BikeTransition = { ms: number; state: string | null; error: string | null; station: string | null; dock: string | null; tripId: number | null };

function snapshot(bike: VaimooBike | null, ms: number): BikeTransition {
	const error = bike?.TripErrorCode;
	return {
		ms,
		state: bike?.TripVehicleState ?? null,
		error: error == null || String(error) === '0' ? null : String(error),
		station: bike?.DockingStationId == null ? null : String(bike.DockingStationId),
		dock: bike?.DockingPointVisualId ?? null,
		tripId: bike?.TripId ?? null,
	};
}

/**
 * Follow an accepted unlock on the bike's own record, then report whether it really released. VAIMOO opens
 * the trip as soon as it accepts the request, before the dock lets go, so the trip itself says nothing; the
 * bike going RUNNING does (the survey riders confirmed every such case). A new error code (100 = start
 * timeout, e.g. the bike wasn't pulled out in time) or a return to LOCKED after waiting means it never came out.
 */
export function trackUnlockResult(report: UnlockReport) {
	const startedAt = Date.now();
	const transitions: BikeTransition[] = [];
	let outcome: UnlockResultPostRequest['outcome'] | null = null;
	let elapsedMs = 0;
	let unsubscribe: (() => void) | null = null;
	// Result posts go out in order and only after the attempt itself, which the server needs to exist first.
	let posting: Promise<unknown> = report.sent;
	const post = () => {
		const details = { tracking: 'bike-state', transitions: [...transitions] };
		posting = posting
			.then(() => reportUnlockResultEvent(report.attemptId, { outcome: outcome!, elapsedMs, details }))
			.catch(err => console.error('Failed to report unlock result', err));
	};
	const finish = (result: UnlockResultPostRequest['outcome']) => {
		if (outcome) return;
		outcome = result;
		elapsedMs = Date.now() - startedAt;
		clearTimeout(timer);
		// The listener can call back synchronously on subscribe, before `unsubscribe` is assigned.
		queueMicrotask(() => unsubscribe?.());
		post();
	};
	const timer = setTimeout(() => finish('unresolved'), RESULT_TIMEOUT_MS);

	let sawWaiting = false;
	unsubscribe = subscribeFirestoreBike(report.bike, bike => {
		const current = snapshot(bike, Date.now() - startedAt);
		const last = transitions.at(-1);
		if (!last || last.state !== current.state || last.error !== current.error || last.station !== current.station || last.dock !== current.dock || last.tripId !== current.tripId) {
			transitions.push(current);
		}
		// A code left over from an earlier attempt is already there on the first snapshot; only a change to one counts.
		const newError = last !== undefined && current.error !== null && current.error !== last.error;
		if (current.state === 'WAITING_FOR_START') sawWaiting = true;
		if (current.state === 'RUNNING') finish('confirmed');
		else if (newError) finish('not-confirmed');
		else if (sawWaiting && current.state === 'LOCKED') finish('not-confirmed');
	}, error => console.error('Unlock result listener failed', error));
}