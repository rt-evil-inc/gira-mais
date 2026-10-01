import { Preferences } from '@capacitor/preferences';
import type { Translations } from './translations';

/** Ratings at or below this open the details step before the rating is sent, as the official app's feedback screen does. */
export const DETAILS_RATING_THRESHOLD = 3;

export type TripRatingReason = {
	/** Stable identifier, what the Gira+ API stores. */
	code: string;
	label: keyof Translations;
	/**
	 * The wording VAIMOO's own feedback lists use for the problem, sent in the trip feedback's comment
	 * list so EMEL reads it in its vocabulary. Null for problems that are Gira+'s, not EMEL's: those are
	 * kept out of the feedback forwarded to VAIMOO, and so is the free text written alongside them, since
	 * it is most likely about Gira+ too. They only reach the Gira+ API.
	 */
	vaimoo: string | null;
};

export const TRIP_RATING_REASONS = [
	{ code: 'brakes', label: 'rating_reason_brakes', vaimoo: 'Braking issue' },
	{ code: 'tires', label: 'rating_reason_tires', vaimoo: 'Deflated/flat tire' },
	{ code: 'pedal_assist', label: 'rating_reason_pedal_assist', vaimoo: 'Pedal assist issue' },
	{ code: 'battery', label: 'rating_reason_battery', vaimoo: 'Battery too low' },
	{ code: 'gears', label: 'rating_reason_gears', vaimoo: 'Gear shifting issue' },
	{ code: 'saddle', label: 'rating_reason_saddle', vaimoo: 'Saddle issue' },
	{ code: 'handlebar', label: 'rating_reason_handlebar', vaimoo: 'Handlebar/steering issue' },
	{ code: 'dirty', label: 'rating_reason_dirty', vaimoo: 'Dirty vehicle' },
	{ code: 'unlocking', label: 'rating_reason_unlocking', vaimoo: 'Difficulty unlocking the bike' },
	{ code: 'docking', label: 'rating_reason_docking', vaimoo: 'Difficulty locking the bike' },
	{ code: 'app', label: 'rating_reason_app', vaimoo: null },
] as const satisfies readonly TripRatingReason[];

export type TripRatingReasonCode = typeof TRIP_RATING_REASONS[number]['code'];

export type TripRatingDetails = {
	reasons: TripRatingReasonCode[];
	comment: string;
};

/**
 * The comment list of a VAIMOO trip feedback, laid out the way the official app sends it: the
 * chosen reasons first (a single empty entry when none), then the free text; just [''] for a bare rating.
 * Reasons about Gira+ itself are left out, and take the free text with them: EMEL can do nothing about them.
 */
export function vaimooFeedbackComment(details?: TripRatingDetails): string[] {
	const chosen = (details?.reasons ?? []).flatMap(code => {
		const reason = TRIP_RATING_REASONS.find(candidate => candidate.code === code);
		return reason ? [reason] : [];
	});
	const reasons = chosen.flatMap(reason => reason.vaimoo ? [reason.vaimoo] : []);
	const aboutGiraMais = chosen.some(reason => reason.vaimoo === null);
	const comment = aboutGiraMais ? '' : details?.comment.trim() ?? '';
	if (!reasons.length && !comment) return [''];
	return [...reasons.length ? reasons : [''], comment];
}

/**
 * Whether the rating should reach EMEL at all. A poor rating whose only stated reasons are Gira+'s
 * own problems says nothing about the bike or the service, and forwarding it would count against them.
 */
export function forwardsToEmel(rating: number, details?: TripRatingDetails): boolean {
	if (rating > DETAILS_RATING_THRESHOLD || !details?.reasons.length) return true;
	return details.reasons.some(code => TRIP_RATING_REASONS.find(reason => reason.code === code)?.vaimoo);
}

const DRAG_HINT_KEY = 'tripRating/dragHintSeen';

/** Whether the rider has already been told the rating card can be dragged. */
export async function ratingDragHintSeen(): Promise<boolean> {
	return (await Preferences.get({ key: DRAG_HINT_KEY })).value === 'true';
}

export function markRatingDragHintSeen(): Promise<void> {
	return Preferences.set({ key: DRAG_HINT_KEY, value: 'true' });
}