/**
 * Optional API key authentication for write operations.
 * When ATTENDANCE_API_KEY is set in env, requests must include X-API-Key header.
 * When unset, all requests are allowed (backward compatible for local demo).
 */
import { NextRequest } from 'next/server';

const HEADER = 'x-api-key';
const ENV_KEY = process.env.ATTENDANCE_API_KEY;

export function requireApiKey(request: NextRequest): { ok: true } | { ok: false; status: 401; body: { error: string } } {
  if (!ENV_KEY) return { ok: true };
  const provided = request.headers.get(HEADER);
  if (!provided || provided !== ENV_KEY) {
    return { ok: false, status: 401, body: { error: 'Invalid or missing X-API-Key' } };
  }
  return { ok: true };
}
