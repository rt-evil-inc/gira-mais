import { reportErrorEvent } from '$lib/gira-mais-api/gira-mais-api';
import { VaimooApiError, VaimooNetworkError } from '$lib/vaimoo-api/client';

/** Enough for any VAIMOO/EMEL JSON error envelope; keeps HTML gateway error pages from filling the table. */
const MAX_BODY_CHARS = 4_000;
/** Response bodies can echo credentials or account details; keep those out of the telemetry database. */
const SENSITIVE_KEY = /token|password|authorization|secret|email|phone/i;

function redact(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(redact);
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? '[redacted]' : redact(item)]));
	}
	return value;
}

function boundedBody(body: unknown): unknown {
	if (body === undefined || body === null || body === '') return null;
	const redacted = redact(body);
	const serialized = typeof redacted === 'string' ? redacted : JSON.stringify(redacted);
	if (serialized.length <= MAX_BODY_CHARS) return redacted;
	return `${serialized.slice(0, MAX_BODY_CHARS)}… [${serialized.length - MAX_BODY_CHARS} more chars]`;
}

/**
 * Serialize a failure for the error statistics endpoint as a JSON string: the HTTP status, VAIMOO's numeric
 * error code, the extracted messages and the (redacted, size-capped) response body, plus any caller context.
 */
export function describeError(error: unknown, context: Record<string, unknown> = {}): string {
	const details: Record<string, unknown> = { ...context };
	if (error instanceof VaimooApiError) {
		details.type = error.name;
		details.status = error.status;
		details.code = error.code;
		details.messages = error.errors.map(item => item.message);
		details.body = boundedBody(error.body);
	} else if (error instanceof Error) {
		details.type = error.name;
		details.message = error.message;
		// Firestore errors carry their kind in `code` (e.g. "permission-denied", "unavailable").
		const code = (error as { code?: unknown }).code;
		if (typeof code === 'string' || typeof code === 'number') details.code = code;
	} else if (error && typeof error === 'object') {
		details.value = boundedBody(error);
	} else {
		details.value = String(error);
	}
	return JSON.stringify(details);
}

/**
 * Report a failed operation with its full server response. Transport failures are skipped: the VAIMOO
 * client already reports those (with the request path) when it gives up retrying.
 */
export async function reportApiError(errorCode: string, error: unknown, context: Record<string, unknown> = {}) {
	if (error instanceof VaimooNetworkError) return;
	await reportErrorEvent(errorCode, describeError(error, context));
}