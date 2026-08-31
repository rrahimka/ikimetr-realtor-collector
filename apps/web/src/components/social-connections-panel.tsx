'use client';

import { useState } from 'react';
import {
  ALL_SEARCH_SURFACES,
  getMaxSafePresetSurfaces,
  getPlatformSupportedSurfaces,
  type SearchPurpose,
  type SearchSurfaceMode,
  type SocialAccountConnection,
  type SocialPlatform,
} from '../lib/source-options';
import { getProviderProfile, listUnsupportedCapabilities } from '@ikimetr/core/capabilities';
import { t, type Lang } from '../lib/i18n';
import { showToast } from './toast';

interface SocialConnectionsPanelProps {
  lang: Lang;
  initialAccounts: Record<SocialPlatform, SocialAccountConnection>;
}

interface ConnectionApiResponse {
  ok?: boolean;
  account?: SocialAccountConnection;
  error?: string;
  authorizeUrl?: string | undefined;
  needsCredentials?: boolean | undefined;
}

function integrationStatusVariant(status?: string): string {
  switch (status) {
    case 'real':
      return 'success';
    case 'architecture_ready':
      return 'info';
    case 'unsupported':
      return 'warning';
    default:
      return 'muted';
  }
}

export function SocialConnectionsPanel({
  lang,
  initialAccounts,
}: SocialConnectionsPanelProps) {
  const [accounts, setAccounts] = useState<Record<SocialPlatform, SocialAccountConnection>>(initialAccounts);
  const [busy, setBusy] = useState<string | null>(null);

  // Search Config Modal State
  const [configModalPlatform, setConfigModalPlatform] = useState<SocialPlatform | null>(null);
  const [selectedSurfaces, setSelectedSurfaces] = useState<SearchSurfaceMode[]>([]);
  const [selectedPurpose, setSelectedPurpose] = useState<SearchPurpose>('both');

  // Human Auth Modal State
  const [authModalAccount, setAuthModalAccount] = useState<SocialAccountConnection | null>(null);
  const [telegramAuthStep, setTelegramAuthStep] = useState<'phone' | 'code' | '2fa'>('phone');
  const [telegramPhoneNumber, setTelegramPhoneNumber] = useState('');
  const [telegramCode, setTelegramCode] = useState('');
  const [telegram2faPassword, setTelegram2faPassword] = useState('');
  const [telegramAuthError, setTelegramAuthError] = useState('');
  const [telegramAuthBusy, setTelegramAuthBusy] = useState(false);

  const platforms: { id: SocialPlatform; name: string }[] = [
    { id: 'instagram', name: 'Instagram' },
    { id: 'tiktok', name: 'TikTok' },
    { id: 'facebook', name: 'Facebook' },
    { id: 'whatsapp', name: 'WhatsApp' },
    { id: 'telegram', name: 'Telegram' },
  ];

  const handleConnect = async (platform: SocialPlatform) => {
    setBusy(platform);
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform, action: 'connect' }),
      });
      const data = (await res.json()) as ConnectionApiResponse;
      if (res.ok && data.account) {
        const account = data.account;
        setAccounts((prev) => ({ ...prev, [platform]: account }));
        if (data.authorizeUrl) {
          // Provider-supported OAuth: open the real authorize URL in a new tab.
          window.open(data.authorizeUrl, '_blank', 'noopener,noreferrer');
          showToast(t(lang, 'connections.openAuthorize'), 'info');
        } else if (data.needsCredentials) {
          showToast(t(lang, 'connections.needsCredentials'), 'error');
        } else if (account.humanAuthRequired) {
          setAuthModalAccount(account);
        } else {
          showToast(t(lang, 'toast.actionSuccess'), 'success');
        }
      } else {
        showToast(t(lang, 'toast.stopFailed'), 'error');
      }
    } catch {
      showToast(t(lang, 'toast.stopFailed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async (platform: SocialPlatform) => {
    setBusy(platform);
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform, action: 'disconnect' }),
      });
      const data = (await res.json()) as ConnectionApiResponse;
      if (res.ok && data.account) {
        const account = data.account;
        setAccounts((prev) => ({ ...prev, [platform]: account }));
        showToast(t(lang, 'toast.actionSuccess'), 'info');
      }
    } catch {
      showToast(t(lang, 'toast.stopFailed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleSwitchAccount = async (platform: SocialPlatform) => {
    setBusy(platform);
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform, action: 'switch_account' }),
      });
      const data = (await res.json()) as ConnectionApiResponse;
      if (res.ok && data.account) {
        const account = data.account;
        setAccounts((prev) => ({ ...prev, [platform]: account }));
        if (account.humanAuthRequired) {
          setAuthModalAccount(account);
        } else {
          showToast(t(lang, 'toast.actionSuccess'), 'success');
        }
      } else {
        showToast(t(lang, 'toast.stopFailed'), 'error');
      }
    } catch {
      showToast(t(lang, 'toast.stopFailed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmHumanAuth = async () => {
    if (!authModalAccount) return;
    const platform = authModalAccount.platform;

    if (platform === 'telegram') {
      return handleTelegramAuth();
    }

    setBusy(platform);
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform, action: 'confirm_auth' }),
      });
      const data = (await res.json()) as ConnectionApiResponse;
      if (res.ok && data.account) {
        const account = data.account;
        setAccounts((prev) => ({ ...prev, [platform]: account }));
        setAuthModalAccount(null);
        showToast(t(lang, 'toast.actionSuccess'), 'success');
      }
    } catch {
      showToast(t(lang, 'toast.stopFailed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleTelegramAuth = async () => {
    if (!authModalAccount) return;
    setTelegramAuthBusy(true);
    setTelegramAuthError('');

    try {
      if (telegramAuthStep === 'phone') {
        if (!telegramPhoneNumber.trim()) {
          setTelegramAuthError('Enter your phone number');
          return;
        }
        const res = await fetch('/api/connections/telegram/auth', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'send_code', phoneNumber: telegramPhoneNumber }),
        });
        const data = await res.json() as { ok?: boolean; error?: string; state?: { status?: string } };
        if (data.ok && data.state?.status === 'waiting_code') {
          setTelegramAuthStep('code');
        } else {
          setTelegramAuthError(data.error || 'Failed to send code');
        }
      } else if (telegramAuthStep === 'code') {
        if (!telegramCode.trim()) {
          setTelegramAuthError('Enter the verification code');
          return;
        }
        const res = await fetch('/api/connections/telegram/auth', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'sign_in', code: telegramCode }),
        });
        const data = await res.json() as { ok?: boolean; error?: string; state?: { status?: string; accountInfo?: { username?: string; id?: number } } };
        if (data.ok && data.state?.status === 'connected') {
          const handle = data.state.accountInfo?.username
            ? `@${data.state.accountInfo.username}`
            : String(data.state.accountInfo?.id ?? '');
          setAccounts((prev) => ({
            ...prev,
            telegram: {
              ...prev.telegram,
              status: 'connected',
              accountHandle: handle,
              connectedAt: new Date().toISOString(),
            },
          }));
          setAuthModalAccount(null);
          resetTelegramAuthState();
          showToast(t(lang, 'toast.actionSuccess'), 'success');
        } else if (data.ok && data.state?.status === 'waiting_2fa') {
          setTelegramAuthStep('2fa');
        } else {
          setTelegramAuthError(data.error || 'Invalid code');
        }
      } else if (telegramAuthStep === '2fa') {
        if (!telegram2faPassword.trim()) {
          setTelegramAuthError('Enter your 2FA password');
          return;
        }
        const res = await fetch('/api/connections/telegram/auth', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'sign_in_2fa', password: telegram2faPassword }),
        });
        const data = await res.json() as { ok?: boolean; error?: string; state?: { status?: string; accountInfo?: { username?: string; id?: number } } };
        if (data.ok && data.state?.status === 'connected') {
          const handle = data.state.accountInfo?.username
            ? `@${data.state.accountInfo.username}`
            : String(data.state.accountInfo?.id ?? '');
          setAccounts((prev) => ({
            ...prev,
            telegram: {
              ...prev.telegram,
              status: 'connected',
              accountHandle: handle,
              connectedAt: new Date().toISOString(),
            },
          }));
          setAuthModalAccount(null);
          resetTelegramAuthState();
          showToast(t(lang, 'toast.actionSuccess'), 'success');
        } else {
          setTelegramAuthError(data.error || 'Invalid 2FA password');
        }
      }
    } catch {
      setTelegramAuthError('Network error');
    } finally {
      setTelegramAuthBusy(false);
    }
  };

  const resetTelegramAuthState = () => {
    setTelegramAuthStep('phone');
    setTelegramPhoneNumber('');
    setTelegramCode('');
    setTelegram2faPassword('');
    setTelegramAuthError('');
  };

  const handleCancelTelegramAuth = async () => {
    try {
      await fetch('/api/connections/telegram/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
    } catch { /* ignore */ }
    resetTelegramAuthState();
    setAuthModalAccount(null);
  };

  const openConfigModal = (platform: SocialPlatform) => {
    const acc = accounts[platform];
    setConfigModalPlatform(platform);
    setSelectedSurfaces(acc?.enabledSurfaces ?? getMaxSafePresetSurfaces(platform));
    setSelectedPurpose(acc?.purpose ?? 'both');
  };

  const handleSaveConfig = async () => {
    if (!configModalPlatform) return;
    setBusy(configModalPlatform);
    try {
      const res = await fetch(`/api/connections/${configModalPlatform}/search-config`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabledSurfaces: selectedSurfaces,
          purpose: selectedPurpose,
          maxSafePreset: false,
        }),
      });
      const data = (await res.json()) as ConnectionApiResponse;
      if (res.ok && data.account) {
        const account = data.account;
        setAccounts((prev) => ({ ...prev, [configModalPlatform]: account }));
        setConfigModalPlatform(null);
        showToast(t(lang, 'toast.sourceSaved'), 'success');
      }
    } catch {
      showToast(t(lang, 'toast.stopFailed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleApplyMaxSafePreset = () => {
    if (!configModalPlatform) return;
    setSelectedSurfaces(getMaxSafePresetSurfaces(configModalPlatform));
    setSelectedPurpose('both');
  };

  const toggleSurface = (surface: SearchSurfaceMode) => {
    setSelectedSurfaces((prev) =>
      prev.includes(surface) ? prev.filter((s) => s !== surface) : [...prev, surface]
    );
  };

  return (
    <div>
      <h2>{t(lang, 'connections.socialNetworks')}</h2>
      <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
        {t(lang, 'connections.mockBadge')}
      </p>

      <div className="connections-grid">
        {platforms.map(({ id, name }) => {
          const acc = accounts[id];
          const isConnected = acc?.status === 'connected';
          const isConnecting = acc?.status === 'connecting';
          const isReauth = acc?.status === 'reauth_required';
          const profile = getProviderProfile(id);
          const unsupported = listUnsupportedCapabilities(id);

          return (
            <div key={id} className="connection-card">
              <div>
                <div className="connection-header">
                  <div className="platform-title">{name}</div>
                  {isConnected && <span className="badge badge-success">{t(lang, 'connections.statusConnected')}</span>}
                  {isConnecting && <span className="badge badge-info">{t(lang, 'connections.statusConnecting')}</span>}
                  {isReauth && <span className="badge badge-warning">{t(lang, 'connections.statusReauthRequired')}</span>}
                  {!isConnected && !isConnecting && !isReauth && (
                    <span className="badge badge-muted">{t(lang, 'connections.statusDisconnected')}</span>
                  )}
                  <span className={`badge badge-${integrationStatusVariant(acc?.integrationStatus)}`}>
                    {t(lang, `connections.integration.${acc?.integrationStatus ?? 'architecture_ready'}`)}
                  </span>
                </div>

                <div className="connection-body">
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    {profile.notes}
                  </div>
                  {acc?.accountHandle && (
                    <div>
                      <strong>{t(lang, 'connections.account')}:</strong> {acc.accountHandle}
                    </div>
                  )}

                  {isConnected && (
                    <div>
                      <div style={{ fontWeight: 600, marginTop: '6px' }}>{t(lang, 'connections.availableModes')}:</div>
                      <div className="surface-tags">
                        {acc.enabledSurfaces.map((s) => {
                          const surfaceDef = ALL_SEARCH_SURFACES.find((item) => item.id === s);
                          return (
                            <span key={s} className="surface-tag">
                              ✓ {surfaceDef ? t(lang, surfaceDef.labelKey) : s}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {unsupported.length > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      <strong>{t(lang, 'connections.notSupported')}:</strong>{' '}
                      {unsupported.map((cap) => t(lang, `connections.cap.${cap}`)).join(', ')}
                    </div>
                  )}
                </div>
              </div>

              <div className="connection-actions">
                {isConnected ? (
                  <>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => openConfigModal(id)}
                      disabled={busy === id}
                    >
                      {t(lang, 'connections.configureSearch')}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => { void handleSwitchAccount(id); }}
                      disabled={busy === id}
                    >
                      {t(lang, 'connections.switchAccount')}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => { void handleDisconnect(id); }}
                      disabled={busy === id}
                    >
                      {t(lang, 'connections.disconnect')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => { void handleConnect(id); }}
                    disabled={busy === id}
                  >
                    {busy === id ? t(lang, 'button.running') : t(lang, 'connections.connect')}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Existing Telegram Connector Preservation Banner */}
      <div className="connection-card" style={{ borderLeft: '4px solid var(--accent)' }}>
        <div>
          <div className="connection-header">
            <div className="platform-title">Telegram — MTProto Connector</div>
            <span className="badge badge-success">{t(lang, 'telegram.statusActive')}</span>
          </div>
          <div className="connection-body">
            <p style={{ margin: '0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Авторизованный MTProto коннектор управляется через карточку Telegram выше. Каналы и супергруппы доступны через источники.
            </p>
          </div>
        </div>
        <div className="connection-actions">
          <a href="/sources" className="button secondary" style={{ textDecoration: 'none' }}>
            Перейти к источникам Telegram
          </a>
        </div>
      </div>
      </div>

      {/* Human Auth Modal */}
      {authModalAccount && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content">
            <h2 style={{ margin: 0 }}>
              {authModalAccount.platform === 'telegram'
                ? 'Telegram Authorization'
                : t(lang, 'connections.humanAuthRequired')}
            </h2>

            {authModalAccount.platform === 'telegram' ? (
              <div style={{ marginTop: '12px' }}>
                {telegramAuthStep === 'phone' && (
                  <div>
                    <p style={{ margin: '0 0 8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                      Enter your Telegram phone number (with country code).
                    </p>
                    <input
                      type="tel"
                      value={telegramPhoneNumber}
                      onChange={(e) => { setTelegramPhoneNumber(e.target.value); setTelegramAuthError(''); }}
                      placeholder="+994 XX XXX XX XX"
                      style={{ width: '100%', padding: '8px', marginBottom: '8px' }}
                      disabled={telegramAuthBusy}
                    />
                  </div>
                )}
                {telegramAuthStep === 'code' && (
                  <div>
                    <p style={{ margin: '0 0 8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                      Enter the verification code sent to your phone.
                    </p>
                    <input
                      type="text"
                      value={telegramCode}
                      onChange={(e) => { setTelegramCode(e.target.value); setTelegramAuthError(''); }}
                      placeholder="12345"
                      style={{ width: '100%', padding: '8px', marginBottom: '8px' }}
                      disabled={telegramAuthBusy}
                      autoFocus
                    />
                  </div>
                )}
                {telegramAuthStep === '2fa' && (
                  <div>
                    <p style={{ margin: '0 0 8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                      Enter your Telegram 2FA password.
                    </p>
                    <input
                      type="password"
                      value={telegram2faPassword}
                      onChange={(e) => { setTelegram2faPassword(e.target.value); setTelegramAuthError(''); }}
                      placeholder="2FA password"
                      style={{ width: '100%', padding: '8px', marginBottom: '8px' }}
                      disabled={telegramAuthBusy}
                      autoFocus
                    />
                  </div>
                )}
                {telegramAuthError && (
                  <p style={{ margin: '0 0 8px', color: 'var(--danger, #ef4444)', fontSize: '12px' }}>
                    {telegramAuthError}
                  </p>
                )}
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>
                {authModalAccount.humanAuthPrompt ?? t(lang, 'connections.humanAuthInstruction')}
              </p>
            )}

            {authModalAccount.platform !== 'telegram' && authModalAccount.qrCodeData && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                <img
                  src={authModalAccount.qrCodeData}
                  alt="WhatsApp QR"
                  style={{ width: '160px', height: '160px', borderRadius: '8px', border: '1px solid var(--line)' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (authModalAccount.platform === 'telegram') {
                    void handleCancelTelegramAuth();
                  } else {
                    setAuthModalAccount(null);
                  }
                }}
              >
                {t(lang, 'whatsapp.cancel')}
              </button>
              {authModalAccount.platform === 'telegram' ? (
                <button
                  type="button"
                  onClick={() => { void handleConfirmHumanAuth(); }}
                  disabled={telegramAuthBusy}
                >
                  {telegramAuthBusy
                    ? t(lang, 'button.running')
                    : telegramAuthStep === 'phone'
                      ? 'Send Code'
                      : telegramAuthStep === 'code'
                        ? 'Verify Code'
                        : 'Verify 2FA'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { void handleConfirmHumanAuth(); }}
                  disabled={busy !== null}
                >
                  {t(lang, 'connections.confirmAuth')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search Configuration Modal */}
      {configModalPlatform && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>
                {t(lang, 'connections.configureSearch')}: {configModalPlatform.toUpperCase()}
              </h2>
              <button
                type="button"
                className="secondary"
                style={{ padding: '4px 10px', fontSize: '12px' }}
                onClick={handleApplyMaxSafePreset}
              >
                {t(lang, 'connections.maxSafeSearch')}
              </button>
            </div>

            {/* Search Purpose */}
            <div>
              <label style={{ marginBottom: '8px', fontWeight: 700 }}>
                {t(lang, 'connections.searchPurpose')}
              </label>
              <div style={{ display: 'flex', gap: '14px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="purpose"
                    checked={selectedPurpose === 'realtors'}
                    onChange={() => setSelectedPurpose('realtors')}
                  />
                  {t(lang, 'connections.purposeRealtors')}
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="purpose"
                    checked={selectedPurpose === 'leads'}
                    onChange={() => setSelectedPurpose('leads')}
                  />
                  {t(lang, 'connections.purposeLeads')}
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="purpose"
                    checked={selectedPurpose === 'both'}
                    onChange={() => setSelectedPurpose('both')}
                  />
                  {t(lang, 'connections.purposeBoth')}
                </label>
              </div>
            </div>

            {/* Surfaces Selection */}
            <div>
              <label style={{ marginBottom: '8px', fontWeight: 700 }}>
                {t(lang, 'connections.availableModes')}:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {getPlatformSupportedSurfaces(configModalPlatform).map((surfaceId) => {
                  const surfaceDef = ALL_SEARCH_SURFACES.find((item) => item.id === surfaceId);
                  const isChecked = selectedSurfaces.includes(surfaceId);
                  return (
                    <label
                      key={surfaceId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSurface(surfaceId)}
                      />
                      {surfaceDef ? t(lang, surfaceDef.labelKey) : surfaceId}
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setConfigModalPlatform(null)}
              >
                {t(lang, 'whatsapp.cancel')}
              </button>
              <button
                type="button"
                onClick={() => { void handleSaveConfig(); }}
                disabled={busy !== null}
              >
                {t(lang, 'button.saved')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
