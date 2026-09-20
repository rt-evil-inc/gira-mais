import { beforeEach, describe, expect, it, vi } from 'vitest';

const { request, addError } = vi.hoisted(() => ({ request: vi.fn(), addError: vi.fn() }));
vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('@capacitor/core', () => ({ CapacitorHttp: { request } }));
vi.mock('@capacitor/network', () => ({ Network: { getStatus: async () => ({ connected: true }) } }));
vi.mock('$lib/ui.svelte', () => ({ errorMessages: { add: addError } }));
vi.mock('$lib/translations', () => ({ t: { subscribe: (run: (value: (key: string) => string) => void) => { run(key => key); return () => {}; } } }));

import { loginWithEmel, quickStartVaimooTrip, refreshVaimooSession, vaimooRequest, VaimooApiError, VaimooNetworkError } from './client';

const jwt = (exp: number) => `h.${Buffer.from(JSON.stringify({ sub: '42', exp })).toString('base64url')}.s`;

describe('VAIMOO API client', () => {
	beforeEach(() => {
		request.mockReset();
		addError.mockReset();
	});

	it('retries network failures with a warning and gives up with a communication error', async () => {
		vi.useFakeTimers();
		try {
			request.mockRejectedValue(new Error('Request timed out'));
			const pending = vaimooRequest('user/trip', { token: 'access', userId: 42 }).catch(value => value);
			await vi.advanceTimersByTimeAsync(10_000);
			const error = await pending;

			expect(error).toBeInstanceOf(VaimooNetworkError);
			expect(request).toHaveBeenCalledTimes(3);
			expect(addError.mock.calls.map(call => call[0])).toEqual(['gira_api_communication_error_retry', 'gira_api_communication_error']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('recovers when a network failure is transient and does not retry HTTP errors', async () => {
		vi.useFakeTimers();
		try {
			request.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ status: 200, data: { ok: true } });
			const pending = vaimooRequest('user/trip');
			await vi.advanceTimersByTimeAsync(2_000);
			expect(await pending).toEqual({ ok: true });

			request.mockReset().mockResolvedValue({ status: 500, data: {} });
			await expect(vaimooRequest('user/trip')).rejects.toBeInstanceOf(VaimooApiError);
			expect(request).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not retry or warn for the unlock request', async () => {
		request.mockRejectedValue(new Error('Request timed out'));
		const session = { accessToken: 'a', refreshToken: 'r', userId: 42, expiresAt: 0, user: { userId: 42, tenantId: 'P1/EML/EML/' } };

		await expect(quickStartVaimooTrip(session, 'bike-1')).rejects.toBeInstanceOf(VaimooNetworkError);
		expect(request).toHaveBeenCalledTimes(1);
		expect(addError).not.toHaveBeenCalled();
	});

	it('performs the browserless EMEL exchange and returns a VAIMOO session', async () => {
		request
			.mockResolvedValueOnce({ status: 200, data: { data: { accessToken: 'emel-a', refreshToken: 'emel-r', expiration: 3600 }, error: { code: 0 } } })
			.mockResolvedValueOnce({ status: 200, data: { data: { id: 99 }, error: { code: 0 } } })
			.mockResolvedValueOnce({ status: 200, data: { code: 'secure-code' } })
			.mockResolvedValueOnce({ status: 200, data: { accessToken: { token: 'vaimoo-a', refreshToken: 'vaimoo-r', expireSeconds: '3600' }, user: { userId: 42, tenantId: 'P1/EML/EML/' } } });

		const session = await loginWithEmel('rider@example.com', 'secret');

		expect(session).toMatchObject({ accessToken: 'vaimoo-a', refreshToken: 'vaimoo-r', userId: 42 });
		expect(request.mock.calls.map(call => new URL(call[0].url).pathname)).toEqual([
			'/emel-api/auth',
			'/emel-api/user',
			'/api/auth/code',
			'/auth/v2/oauth/',
		]);
		expect(request.mock.calls[3][0].data).toEqual({ code: 'secure-code' });
	});

	it('normalizes VAIMOO failures for the existing error UI', async () => {
		request.mockResolvedValue({ status: 409, data: { message: 'already_active_trip' } });

		const error = await vaimooRequest('trip/v2/quick-start/bike', { method: 'POST' }).catch(value => value);

		expect(error).toBeInstanceOf(VaimooApiError);
		expect(error).toMatchObject({ status: 409, code: null, errors: [{ message: 'already_active_trip' }] });
	});

	it('reads the error code and messages from a VAIMOO responseStatus envelope', async () => {
		request.mockResolvedValue({
			status: 400,
			data: {
				isSuccess: false,
				message: 'Bad Request',
				responseStatus: { errorCode: 1234, hasError: true, message: 'Trip cannot start', errors: [{ fieldName: 'bike', errorCode: 'BIKE_BOOKED', message: 'Bike is booked' }] },
			},
		});

		const error = await vaimooRequest('trip/v2/quick-start/bike', { method: 'POST' }).catch(value => value);

		expect(error).toMatchObject({ status: 400, code: 1234, errors: [{ message: 'Bike is booked' }] });
	});

	it('reads the short access-token lifetime from the JWT and accepts the refresh response user id', async () => {
		const exp = Math.floor(Date.now() / 1000) + 300;
		request.mockResolvedValue({ status: 200, data: { accessToken: { token: jwt(exp), refreshToken: 'r' }, user: { id: 42, tenantId: 'P1/EML/EML/' } } });

		const session = await refreshVaimooSession('old-refresh');

		expect(session.userId).toBe(42);
		expect(session.expiresAt).toBe(exp * 1000);
	});
});