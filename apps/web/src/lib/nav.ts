export const NAV_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ['/', 'nav.dashboard'],
  ['/sources', 'nav.sources'],
  ['/connections', 'nav.connections'],
  ['/keywords', 'nav.keywords'],
  ['/contacts', 'nav.contacts'],
  ['/leads', 'nav.leads'],
  ['/runs', 'nav.runs'],
  ['/review', 'nav.review'],
];

/**
 * Route-aware active detection. The dashboard is active only on exactly `/`.
 * Every other section stays highlighted for all of its nested routes, so
 * `/contacts/123` keeps Контакты active and intermediate navigation never
 * desynchronises the highlight from the URL.
 */
export function isActiveNav(href: string, pathname: string): boolean {
  const clean = pathname.split('?')[0] ?? pathname;
  if (href === '/') return clean === '/' || clean === '';
  return clean === href || clean.startsWith(`${href}/`);
}
