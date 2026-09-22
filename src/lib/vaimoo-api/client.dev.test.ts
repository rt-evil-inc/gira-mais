import { describe, expect, it, vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('$app/environment', () => ({ dev: true }));
vi.mock('@capacitor/core', () => ({ CapacitorHttp: { request } }));
vi.mock('$lib/gira-mais-api/gira-mais-api', () => ({ reportErrorEvent: vi.fn() }));

import { loginWithEmel } from './client';

describe('VAIMOO API client in development', () => {
	it('uses absolute Vite proxy URLs with CapacitorHttp', async () => {
		request
			.mockResolvedValueOnce({ status: 200, data: { data: { accessToken: 'emel-a', refreshToken: 'emel-r', expiration: 3600 }, error: { code: 0 } } })
			.mockResolvedValueOnce({ status: 200, data: { data: { id: 99 }, error: { code: 0 } } })
			.mockResolvedValueOnce({ status: 200, data: { code: 'secure-code' } })
			.mockResolvedValueOnce({ status: 200, data: { accessToken: { token: 'vaimoo-a', refreshToken: 'vaimoo-r', expireSeconds: '300' }, user: { userId: 42, tenantId: 'P1/EML/EML/' } } });

		await loginWithEmel('rider@example.com', 'secret');

		for (const [options] of request.mock.calls) {
			expect(() => new URL(options.url)).not.toThrow();
			expect(new URL(options.url).pathname).toMatch(/^\/__dev-proxy\/(emel|vaimoo)\//);
		}
	});
});