import { getConnectionsStore, withoutSessionSecrets } from '../../lib/connections-store';
import { getLang } from '../../lib/lang';
import { t } from '../../lib/i18n';
import { SocialConnectionsPanel } from '../../components/social-connections-panel';
import { WhatsAppGroupsTable } from '../../components/whatsapp-groups-table';

export const dynamic = 'force-dynamic';

export default async function ConnectionsPage() {
  const lang = await getLang();
  const store = withoutSessionSecrets(getConnectionsStore());

  return (
    <>
      <p className="eyebrow">{t(lang, 'connections.subtitle')}</p>
      <h1>{t(lang, 'connections.title')}</h1>

      <div className="stack">
        <SocialConnectionsPanel
          lang={lang}
          initialAccounts={store.accounts}
        />
        <WhatsAppGroupsTable
          lang={lang}
          initialGroups={store.whatsappGroups}
        />
      </div>
    </>
  );
}
