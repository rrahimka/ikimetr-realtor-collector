import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getLang } from '../lib/lang';
import { t } from '../lib/i18n';
import { LangSwitcher } from '../components/lang-switcher';
import { ToastContainer } from '../components/toast';
import { SideNav } from '../components/side-nav';
import { CollectorRunner } from '../components/collector-runner';
import { verifySessionToken } from '../lib/auth';

export const metadata: Metadata = {
  title: 'IKimetr Realtor Collector',
  description: 'Local public professional contact collector',
};

import { getRepositories } from '../lib/db';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  const jar = await cookies();
  const sessionCookie = jar.get('collector_session')?.value;
  const isAuthenticated = verifySessionToken(sessionCookie, process.env.SESSION_SECRET ?? '');
  const pendingReviewCount = isAuthenticated ? getRepositories().reviews.pendingCount() : 0;

  return (
    <html lang={lang}>
      <body>
        {isAuthenticated ? (
          <div className="shell">
            <aside className="sidebar">
              <Link href="/" className="brand-link" title={t(lang, 'nav.dashboard')}>
                <div className="brand">
                  IKIMETR <span>COLLECTOR</span>
                </div>
              </Link>
              <nav>
                <SideNav lang={lang} pendingReviewCount={pendingReviewCount} />
              </nav>
            </aside>
            <main>
              <CollectorRunner lang={lang} />
              <header className="global-header">
                <div className="header-left"></div>
                <div className="header-right">
                  <LangSwitcher lang={lang} />
                  <a href="/api/logout" className="logout-btn" title={t(lang, 'common.logout')}>
                    {t(lang, 'common.logout')}
                  </a>
                </div>
              </header>
              {children}
            </main>
          </div>
        ) : (
          <div className="login-shell">
            <header className="login-header">
              <LangSwitcher lang={lang} />
            </header>
            <main className="login-main">{children}</main>
          </div>
        )}
        <ToastContainer />
      </body>
    </html>
  );
}
