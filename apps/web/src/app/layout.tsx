import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getLang } from '../lib/lang';
import { t } from '../lib/i18n';
import { LangSwitcher } from '../components/lang-switcher';
import { ToastContainer } from '../components/toast';

export const metadata: Metadata = {
  title: 'IKimetr Realtor Collector',
  description: 'Local public professional contact collector',
};

const nav = [
  ['/', 'nav.dashboard'],
  ['/sources', 'nav.sources'],
  ['/keywords', 'nav.keywords'],
  ['/contacts', 'nav.contacts'],
  ['/runs', 'nav.runs'],
  ['/review', 'nav.review'],
] as const;

export default async function Layout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              IKIMETR <span>COLLECTOR</span>
            </div>
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
          <main>{children}</main>
        </div>
        <ToastContainer />
      </body>
    </html>
  );
}
