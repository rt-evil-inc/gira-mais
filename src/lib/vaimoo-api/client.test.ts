import { beforeEach, describe, expect, it, vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('@capacitor/core', () => ({ CapacitorHttp: { request } }));

import { defaultQuery, loginWithEmel, vaimooRequest, VaimooApiError } from './client';

describe('VAIMOO API client', () => {
	beforeEach(() => request.mockReset());

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

	it('adds the VAIMOO protocol headers and query parameters', async () => {
		request.mockResolvedValue({ status: 200, data: { result: 'pong' } });
		await vaimooRequest('ping', { token: 'access', userId: 42 });

		const options = request.mock.calls[0][0];
		expect(options.headers).toMatchObject({
			AppId: '8d75593b-83a1-4cce-862f-1671b59c5b0f',
			Authorization: 'access',
		});
		expect(options.params).toMatchObject({ userId: '42', mainAppVersion: 'A1.0.0' });
		expect(JSON.parse(defaultQuery(2, 50))).toEqual({ pageIndex: 2, pageSize: 50, filter: { filters: [] } });
	});

	it('normalizes VAIMOO failures for the existing error UI', async () => {
		request.mockResolvedValue({ status: 409, data: { message: 'already_active_trip' } });

		const error = await vaimooRequest('trip/v2/quick-start/bike', { method: 'POST' }).catch(value => value);

		expect(error).toBeInstanceOf(VaimooApiError);
		expect(error).toMatchObject({ status: 409, errors: [{ message: 'already_active_trip' }] });
	});
});