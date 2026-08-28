import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getLang } from '../lib/lang';
import { t } from '../lib/i18n';
import { LangSwitcher } from '../components/lang-switcher';
import { ToastContainer } from '../components/toast';
import { verifySessionToken } from '../lib/auth';

export const metadata: Metadata = {
  title: 'IKimetr Realtor Collector',
  description: 'Local public professional contact collector',
};

const nav = [
  ['/', 'nav.dashboard'],
  ['/sources', 'nav.sources'],
  ['/connections', 'nav.connections'],
  ['/keywords', 'nav.keywords'],
  ['/contacts', 'nav.contacts'],
  ['/leads', 'nav.leads'],
  ['/runs', 'nav.runs'],
  ['/review', 'nav.review'],
] as const;

export default async function Layout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  const jar = await cookies();
  const sessionCookie = jar.get('collector_session')?.value;
  const isAuthenticated = verifySessionToken(sessionCookie, process.env.SESSION_SECRET ?? '');

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
                {nav.map(([href, key]) => (
                  <Link key={href} href={href}>
                    {t(lang, key)}
                  </Link>
                ))}
              </nav>
              <div className="langbar">
                <LangSwitcher lang={lang} />
                <a href="/api/logout">{t(lang, 'common.logout')}</a>
              </div>
            </aside>
            <main>
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
