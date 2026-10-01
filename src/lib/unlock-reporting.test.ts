import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	reportUnlockAttemptEvent: vi.fn(),
	reportUnlockResultEvent: vi.fn(),
	emitBike: (_bike: unknown) => {},
	unsubscribe: vi.fn(),
}));

vi.mock('$lib/gira-mais-api/gira-mais-api', () => ({
	reportUnlockAttemptEvent: mocks.reportUnlockAttemptEvent,
	reportUnlockResultEvent: mocks.reportUnlockResultEvent,
}));
vi.mock('$lib/vaimoo-api/firestore', () => ({
	subscribeFirestoreBike: (_id: string, onData: (bike: unknown) => void) => {
		mocks.emitBike = onData;
		return mocks.unsubscribe;
	},
}));

import { reportUnlockAttempt, trackUnlockResult } from './unlock-reporting';

const subject = { source: 'hidden' as const, hiddenReasons: ['Service status is not OK'], record: null };
const context = { bike: 'E0980', station: '4551' };
const bike = (TripVehicleState: string, TripErrorCode: string | null = '0') => ({ VisualId: 'E0980', TripVehicleState, TripErrorCode, DockingStationId: '4551', DockingPointVisualId: '11' });

function resultCalls() {
	return mocks.reportUnlockResultEvent.mock.calls.map(call => ({ attemptId: call[0], ...call[1] }));
}

describe('unlock reporting', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.reportUnlockAttemptEvent.mockResolvedValue({ success: true });
		mocks.reportUnlockResultEvent.mockResolvedValue({ success: true });
	});

	it('counts an unlock as released only once the bike goes RUNNING, with the states it went through', async () => {
		const report = reportUnlockAttempt(subject, context, 'accepted');
		trackUnlockResult(report);
		mocks.emitBike(bike('LOCKED'));
		mocks.emitBike(bike('WAITING_FOR_START'));
		expect(mocks.reportUnlockResultEvent).not.toHaveBeenCalled();

		mocks.emitBike(bike('RUNNING'));
		await vi.waitFor(() => expect(mocks.reportUnlockResultEvent).toHaveBeenCalledOnce());
		const [result] = resultCalls();
		expect(result).toMatchObject({ attemptId: report.attemptId, outcome: 'confirmed', details: { tracking: 'bike-state' } });
		expect(result.details.transitions.map((step: { state: string }) => step.state)).toEqual(['LOCKED', 'WAITING_FOR_START', 'RUNNING']);
	});

	it('reports a start timeout as not released, ignoring an error code left over from an earlier attempt', async () => {
		trackUnlockResult(reportUnlockAttempt(subject, context, 'accepted'));
		mocks.emitBike(bike('LOCKED', '100'));
		mocks.emitBike(bike('WAITING_FOR_START', '100'));
		mocks.emitBike(bike('WAITING_FOR_START', '0'));
		expect(mocks.reportUnlockResultEvent).not.toHaveBeenCalled();

		mocks.emitBike(bike('WAITING_FOR_START', '100'));
		await vi.waitFor(() => expect(resultCalls()[0]).toMatchObject({ outcome: 'not-confirmed' }));
	});

	it('reports a bike that falls back to LOCKED after waiting as not released', async () => {
		trackUnlockResult(reportUnlockAttempt(subject, context, 'accepted'));
		mocks.emitBike(bike('WAITING_FOR_START'));
		mocks.emitBike(bike('LOCKED'));
		await vi.waitFor(() => expect(resultCalls()[0]).toMatchObject({ outcome: 'not-confirmed' }));
	});

	it('never posts a result before its attempt has been sent', async () => {
		let sendAttempt: (value: unknown) => void = () => {};
		mocks.reportUnlockAttemptEvent.mockReturnValue(new Promise(resolve => sendAttempt = resolve));
		trackUnlockResult(reportUnlockAttempt(subject, context, 'accepted'));
		mocks.emitBike(bike('RUNNING'));

		await new Promise(resolve => setTimeout(resolve, 10));
		expect(mocks.reportUnlockResultEvent).not.toHaveBeenCalled();
		sendAttempt({ success: true });
		await vi.waitFor(() => expect(mocks.reportUnlockResultEvent).toHaveBeenCalledOnce());
	});

	it('still completes the attempt when posting it failed', async () => {
		mocks.reportUnlockAttemptEvent.mockRejectedValue({ status: 500 });
		trackUnlockResult(reportUnlockAttempt(subject, context, 'accepted'));
		mocks.emitBike(bike('RUNNING'));
		await vi.waitFor(() => expect(mocks.reportUnlockResultEvent).toHaveBeenCalledOnce());
	});
});