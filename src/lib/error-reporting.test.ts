import { describe, expect, it, vi } from 'vitest';

const { reportErrorEvent } = vi.hoisted(() => ({ reportErrorEvent: vi.fn() }));
vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('@capacitor/core', () => ({ CapacitorHttp: { request: vi.fn() } }));
vi.mock('@capacitor/network', () => ({ Network: { getStatus: async () => ({ connected: true }) } }));
vi.mock('$lib/ui.svelte', () => ({ errorMessages: { add: vi.fn() } }));
vi.mock('$lib/translations', () => ({ t: { subscribe: (run: (value: (key: string) => string) => void) => { run(key => key); return () => {}; } } }));
vi.mock('$lib/gira-mais-api/gira-mais-api', () => ({ reportErrorEvent }));

import { describeError, reportApiError } from './error-reporting';
import { VaimooApiError, VaimooNetworkError } from '$lib/vaimoo-api/client';

describe('error reporting', () => {
	it('redacts credentials and account details from response bodies', () => {
		const error = new VaimooApiError('failed', 500, {
			accessToken: { token: 'jwt', refreshToken: 'r' },
			user: { email: 'rider@example.com', userId: 42 },
			responseStatus: { errorCode: 7, message: 'boom' },
		});

		const details = JSON.parse(describeError(error));

		expect(details.body).toEqual({
			accessToken: '[redacted]',
			user: { email: '[redacted]', userId: 42 },
			responseStatus: { errorCode: 7, message: 'boom' },
		});
		expect(details).toMatchObject({ status: 500, code: 7, messages: ['boom'] });
	});

	it('caps oversized bodies so gateway error pages stay manageable', () => {
		const page = '<html>' + 'x'.repeat(10_000) + '</html>';
		const details = JSON.parse(describeError(new VaimooApiError('failed', 502, page)));

		expect(typeof details.body).toBe('string');
		expect(details.body.length).toBeLessThan(4_100);
		expect(details.body).toContain('more chars');
	});

	it('describes plain errors with their code and leaves transport failures to the client', async () => {
		const firestore = Object.assign(new Error('Missing or insufficient permissions.'), { name: 'FirebaseError', code: 'permission-denied' });
		expect(JSON.parse(describeError(firestore, { source: 'stations' }))).toEqual({
			source: 'stations', type: 'FirebaseError', message: 'Missing or insufficient permissions.', code: 'permission-denied',
		});

		await reportApiError('trip_status_error', new VaimooNetworkError('vaimoo request failed: timeout', null));
		expect(reportErrorEvent).not.toHaveBeenCalled();

		await reportApiError('trip_status_error', firestore);
		expect(reportErrorEvent).toHaveBeenCalledOnce();
	});
});