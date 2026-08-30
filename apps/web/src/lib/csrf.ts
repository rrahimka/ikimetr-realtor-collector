import { randomBytes,timingSafeEqual } from 'node:crypto';
export const createCsrfToken=()=>randomBytes(24).toString('base64url');
export function verifyCsrf(cookie:string|undefined,header:string|undefined):void{if(!cookie||!header){throw new Error('CSRF token missing');}const a=Buffer.from(cookie);const b=Buffer.from(header);if(a.length!==b.length||!timingSafeEqual(a,b))throw new Error('CSRF token mismatch');}

/**
 * Same-origin CSRF check that accepts the token from a request header OR a JSON
 * body field. This lets a `sendBeacon` (which cannot set headers) still satisfy
 * the token check with a body value the cross-site attacker cannot read.
 */
export async function verifyCsrfRelaxed(request: Request): Promise<void> {
  const cookie = request.headers.get('cookie')?.split('; ').find((v) => v.startsWith('csrf_token='))?.split('=')[1];
  const header = request.headers.get('x-csrf-token') ?? undefined;
  let bodyToken: string | undefined;
  if (!header) {
    try {
      const body = (await request.clone().json().catch(() => ({}))) as { csrf?: string };
      bodyToken = body.csrf;
    } catch { /* ignore */ }
  }
  verifyCsrf(cookie, header ?? bodyToken);
}
