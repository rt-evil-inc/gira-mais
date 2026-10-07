import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/preferences', () => ({ Preferences: { get: vi.fn(), set: vi.fn() } }));

import { forwardsToEmel, vaimooFeedbackComment } from './trip-rating';

describe('VAIMOO feedback comment list', () => {
	it('is a single empty entry for a bare rating, like the official app', () => {
		expect(vaimooFeedbackComment()).toEqual(['']);
		expect(vaimooFeedbackComment({ reasons: [], comment: '   ' })).toEqual(['']);
	});

	it('lists the reasons in VAIMOO wording and ends with the free text', () => {
		expect(vaimooFeedbackComment({ reasons: ['brakes', 'dirty'], comment: ' Squeaky front brake ' })).toEqual([
			'Braking issue',
			'Dirty vehicle',
			'Squeaky front brake',
		]);
		expect(vaimooFeedbackComment({ reasons: ['docking'], comment: '' })).toEqual(['Difficulty locking the bike', '']);
	});

	it('keeps Gira+ app problems, and the text written with them, out of what EMEL receives', () => {
		expect(vaimooFeedbackComment({ reasons: ['app'], comment: '' })).toEqual(['']);
		expect(vaimooFeedbackComment({ reasons: ['app'], comment: 'Map froze' })).toEqual(['']);
		expect(vaimooFeedbackComment({ reasons: ['app', 'brakes'], comment: 'Map froze, brakes squeak' })).toEqual(['Braking issue', '']);
	});

	it('keeps the empty reason placeholder when only a comment was written', () => {
		expect(vaimooFeedbackComment({ reasons: [], comment: 'Seat was wet' })).toEqual(['', 'Seat was wet']);
	});
});

describe('forwarding a rating to EMEL', () => {
	it('withholds a poor rating blamed solely on Gira+', () => {
		expect(forwardsToEmel(3, { reasons: ['app'], comment: 'Map froze' })).toBe(false);
		expect(forwardsToEmel(1, { reasons: ['app'], comment: '' })).toBe(false);
	});

	it('forwards everything else', () => {
		expect(forwardsToEmel(4, { reasons: ['app'], comment: '' })).toBe(true);
		expect(forwardsToEmel(2, { reasons: ['app', 'brakes'], comment: '' })).toBe(true);
		expect(forwardsToEmel(2, { reasons: [], comment: 'Bad trip' })).toBe(true);
		expect(forwardsToEmel(1)).toBe(true);
	});
});