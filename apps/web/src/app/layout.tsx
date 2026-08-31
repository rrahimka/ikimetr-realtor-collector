import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getLang } from '../lib/lang';
import { t } from '../lib/i18n';
import { ToastContainer } from '../components/toast';
import { SideNav } from '../components/side-nav';
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
            <header className="top-nav">
              <Link href="/" className="brand-link" title={t(lang, 'nav.dashboard')}>
                <div className="brand">
                  IKIMETR <span>COLLECTOR</span>
                </div>
              </Link>
              <SideNav lang={lang} pendingReviewCount={pendingReviewCount} />
              <div className="top-nav-right">
                <a href="/api/logout" className="logout-btn" title={t(lang, 'common.logout')}>
                  {t(lang, 'common.logout')}
                </a>
              </div>
            </header>
            <main>
              {children}
            </main>
          </div>
        ) : (
          <div className="login-shell">
            <main className="login-main">{children}</main>
          </div>
        )}
        <ToastContainer />
      </body>
    </html>
  );
}
