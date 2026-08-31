/**
 * Client-side CSRF token access.
 *
 * Route handlers guard every write with `requireApi(true)`, which calls
 * `verifyCsrf()` and rejects any request whose `x-csrf-token` header is absent
 * or does not match the `csrf_token` cookie. The cookie is deliberately
 * readable from script (see `api/login`), so client components must read it
 * and attach it to every POST/PUT/DELETE.
 *
 * Keep this in its own module: `lib/csrf.ts` is server-side and pulls `Buffer`
 * and `timingSafeEqual` in, which must not reach the browser bundle.
 */

/** Reads the CSRF token from the cookie jar. Empty string when unavailable. */
export function csrfToken(): string {
  if (typeof document === 'undefined') return '';
  return (
    document.cookie
      .split('; ')
      .find((v) => v.startsWith('csrf_token='))
      ?.split('=')[1] ?? ''
  );
}

/** Headers for a JSON mutating request that satisfies the server CSRF guard. */
export function jsonMutationHeaders(): Record<string, string> {
  return { 'content-type': 'application/json', 'x-csrf-token': csrfToken() };
}
