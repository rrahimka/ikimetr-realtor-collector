import { describe, expect, it } from 'vitest';
import { isActiveNav, NAV_ITEMS } from './nav';

describe('route-aware navigation', () => {
  it('keeps the dashboard active only on exactly the root route', () => {
    expect(isActiveNav('/', '/')).toBe(true);
    expect(isActiveNav('/', '/dashboard')).toBe(false);
    expect(isActiveNav('/', '/contacts')).toBe(false);
  });

  it('highlights a section for its nested routes', () => {
    expect(isActiveNav('/contacts', '/contacts')).toBe(true);
    expect(isActiveNav('/contacts', '/contacts/123')).toBe(true);
    expect(isActiveNav('/contacts', '/contacts/123/review')).toBe(true);
    expect(isActiveNav('/contacts', '/leads')).toBe(false);
  });

  it('ignores query strings when matching the active section', () => {
    expect(isActiveNav('/sources', '/sources?cat=social')).toBe(true);
    expect(isActiveNav('/runs', '/runs?status=failed')).toBe(true);
  });

  it('declares every sidebar entry exactly once', () => {
    const hrefs = NAV_ITEMS.map(([href]) => href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toContain('/connections');
  });
});
