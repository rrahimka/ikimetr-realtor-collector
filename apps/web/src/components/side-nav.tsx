'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS, isActiveNav } from '../lib/nav';
import { t, type Lang } from '../lib/i18n';

export function SideNav({ lang, pendingReviewCount }: { lang: Lang; pendingReviewCount: number }) {
  const pathname = usePathname() ?? '/';
  return (
    <nav aria-label="Основная навигация">
      {NAV_ITEMS.map(([href, key]) => {
        const active = isActiveNav(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            className={active ? 'nav-link active' : 'nav-link'}
            aria-current={active ? 'page' : undefined}
          >
            {t(lang, key)}
            {key === 'nav.review' && pendingReviewCount > 0 ? ` (${pendingReviewCount})` : ''}
          </Link>
        );
      })}
    </nav>
  );
}
