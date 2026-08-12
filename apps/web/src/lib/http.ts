import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { apiRateLimit } from './rate-limit';
import { verifySessionToken } from './auth';
import { verifyCsrf } from './csrf';

export async function requireApi(mutate = false) {
  const h = await headers();
  const key = h.get('x-forwarded-for')?.split(',')[0] ?? 'local';
  if (!apiRateLimit(key)) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw new Response('Too many requests', { status: 429 });
  }
  const jar = await cookies();
  const secret = process.env.SESSION_SECRET ?? '';
  if (!verifySessionToken(jar.get('collector_session')?.value, secret)) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw new Response('Unauthorized', { status: 401 });
  }
  if (mutate) verifyCsrf(jar.get('csrf_token')?.value, h.get('x-csrf-token') ?? undefined);
  return jar;
}

export function apiError(error: unknown): Response {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : 'Request failed';
  const status = /CSRF/.test(message) ? 403 : /not found/.test(message) ? 404 : 400;
  return NextResponse.json({ error: message }, { status });
}
