import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSessionToken, sessionCookieOptions } from '../../../lib/auth';
import { createCsrfToken } from '../../../lib/csrf';
import { loginRateLimit } from '../../../lib/rate-limit';

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  if (!loginRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many login attempts. Please wait a minute.' }, { status: 429 });
  }

  const body = z.object({
    login: z.string().optional(),
    password: z.string().min(1),
  }).safeParse(await request.json().catch(() => null));

  const expected = process.env.LOCAL_AUTH_PASSWORD ?? '';
  if (!body.success || !expected) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const a = Buffer.from(body.data.password);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('collector_session', createSessionToken(process.env.SESSION_SECRET ?? ''), sessionCookieOptions(false));
  response.cookies.set('csrf_token', createCsrfToken(), { httpOnly: false, sameSite: 'strict', path: '/', secure: false, maxAge: 86400 });
  return response;
}
