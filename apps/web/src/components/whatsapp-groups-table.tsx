'use client';

import { useState } from 'react';
import {
  type WhatsAppGroupData,
  isRealtorGroupContext,
} from '../lib/source-options';
import { formatDateTime, t, type Lang } from '../lib/i18n';
import { showToast } from './toast';

interface WhatsAppGroupsTableProps {
  lang: Lang;
  initialGroups: WhatsAppGroupData[];
}

interface GroupApiResponse {
  ok?: boolean;
  group?: WhatsAppGroupData;
  error?: string;
}

export function WhatsAppGroupsTable({
  lang,
  initialGroups,
}: WhatsAppGroupsTableProps) {
  const [groups, setGroups] = useState<WhatsAppGroupData[]>(initialGroups);
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);

  // Consent Confirmation Modal State
  const [consentTargetGroup, setConsentTargetGroup] = useState<WhatsAppGroupData | null>(null);

  const handleToggleConsentRequest = (group: WhatsAppGroupData) => {
    if (group.authorized) {
      // Revoke permission immediately
      void handleSaveGroupConsent(group.id, false, group.isRealtorOnlyGroup);
    } else {
      // Open explicit consent modal
      setConsentTargetGroup(group);
    }
  };

  const handleConfirmConsent = async () => {
    if (!consentTargetGroup) return;
    await handleSaveGroupConsent(consentTargetGroup.id, true, consentTargetGroup.isRealtorOnlyGroup);
    setConsentTargetGroup(null);
  };

  const handleSaveGroupConsent = async (
    groupId: string,
    authorized: boolean,
    isRealtorOnly?: boolean
  ) => {
    setBusyGroupId(groupId);
    try {
      const res = await fetch('/api/connections/whatsapp/groups', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          groupId,
          authorized,
          isRealtorOnlyGroup: isRealtorOnly,
        }),
      });
      const data = (await res.json()) as GroupApiResponse;
      if (res.ok && data.group) {
        const updatedGroup = data.group;
        setGroups((prev) =>
          prev.map((g) => (g.id === groupId ? { ...g, ...updatedGroup } : g))
        );
        showToast(
          authorized ? t(lang, 'whatsapp.consentGranted') : t(lang, 'toast.actionSuccess'),
          'success'
        );
      }
    } catch {
      showToast(t(lang, 'toast.stopFailed'), 'error');
    } finally {
      setBusyGroupId(null);
    }
  };

  const handleToggleRealtorOnly = async (group: WhatsAppGroupData) => {
    const nextVal = !group.isRealtorOnlyGroup;
    await handleSaveGroupConsent(group.id, group.authorized, nextVal);
  };

  return (
    <div style={{ marginTop: '32px' }}>
      <h2>{t(lang, 'whatsapp.title')}</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '-8px', marginBottom: '16px' }}>
        Анализ разрешён только для подтверждённых групп вашего аккаунта. Личные сообщения (1-на-1) строго исключены.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t(lang, 'whatsapp.groupName')}</th>
              <th>Тип группы</th>
              <th>Поиск риелторов</th>
              <th>Поиск лидов</th>
              <th>{t(lang, 'whatsapp.lastActivity')}</th>
              <th>{t(lang, 'whatsapp.status')}</th>
              <th>{t(lang, 'whatsapp.permission')}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const isBusy = busyGroupId === group.id;
              const hasRealtorContext = isRealtorGroupContext(group.name, group.description);

              return (
                <tr key={group.id}>
                  {/* Group Name & Participants */}
                  <td>
                    <strong>{group.name}</strong>
                    {group.description && (
                      <div className="muted" style={{ fontSize: '12px' }}>
                        {group.description}
                      </div>
                    )}
                    <span className="muted" style={{ fontSize: '11px' }}>
                      {group.participantCount ?? 0} {t(lang, 'whatsapp.participants').toLowerCase()}
                    </span>
                  </td>

                  {/* Group Type / Realtor Only Toggle */}
                  <td>
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={group.isRealtorOnlyGroup}
                        onChange={() => { void handleToggleRealtorOnly(group); }}
                        disabled={isBusy}
                      />
                      <span>Риелторская</span>
                    </label>
                    {group.isRealtorOnlyGroup && (
                      <div style={{ marginTop: '4px' }}>
                        {hasRealtorContext ? (
                          <span className="badge badge-success" style={{ fontSize: '10px' }}>
                            ✓ Контекст подтверждён
                          </span>
                        ) : (
                          <span className="badge badge-warning" style={{ fontSize: '10px' }}>
                            ⚠ Общий чат
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Realtor Search */}
                  <td>
                    {group.authorized && (group.searchMode === 'realtors' || group.searchMode === 'both') ? (
                      <span className="badge badge-success">✓ Активен</span>
                    ) : (
                      <span className="badge badge-muted">Отключён</span>
                    )}
                  </td>

                  {/* Lead Search */}
                  <td>
                    {group.authorized && (group.searchMode === 'leads' || group.searchMode === 'both') ? (
                      <span className="badge badge-success">✓ Активен</span>
                    ) : (
                      <span className="badge badge-muted">Отключён</span>
                    )}
                  </td>

                  {/* Last Activity */}
                  <td>
                    <span className="muted">
                      {formatDateTime(lang, group.lastActivity)}
                    </span>
                  </td>

                  {/* Status */}
                  <td>
                    {group.authorized ? (
                      <span className="badge badge-success">{t(lang, 'whatsapp.consentGranted')}</span>
                    ) : (
                      <span className="badge badge-muted">{t(lang, 'whatsapp.consentDenied')}</span>
                    )}
                  </td>

                  {/* Permission Action Button */}
                  <td>
                    <button
                      type="button"
                      className={group.authorized ? 'danger' : ''}
                      onClick={() => handleToggleConsentRequest(group)}
                      disabled={isBusy}
                    >
                      {group.authorized
                        ? t(lang, 'whatsapp.revokeSearch')
                        : t(lang, 'whatsapp.allowSearch')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Explicit Consent Modal */}
      {consentTargetGroup && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content">
            <h2 style={{ margin: 0 }}>{t(lang, 'whatsapp.confirmGroupConsentTitle')}</h2>
            <p style={{ color: 'var(--text)', fontSize: '14px', lineHeight: 1.5 }}>
              {t(lang, 'whatsapp.confirmGroupConsentText')}
            </p>
            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--panel-subtle)',
                borderRadius: '8px',
                border: '1px solid var(--line)',
              }}
            >
              <strong>Группа:</strong> {consentTargetGroup.name}
              <br />
              <span className="muted" style={{ fontSize: '12px' }}>
                ID: {consentTargetGroup.id} · Участников: {consentTargetGroup.participantCount ?? 0}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setConsentTargetGroup(null)}
              >
                {t(lang, 'whatsapp.cancel')}
              </button>
              <button
                type="button"
                onClick={() => { void handleConfirmConsent(); }}
                disabled={busyGroupId !== null}
              >
                {t(lang, 'whatsapp.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
