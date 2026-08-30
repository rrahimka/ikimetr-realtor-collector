'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { t, type Lang } from '../lib/i18n';

interface CollectorCounters {
  pagesChecked: number;
  discoveredListings: number;
  uniquePhones: number;
  newContacts: number;
  duplicates: number;
  errors: number;
  runsTotal: number;
  runsCompleted: number;
  currentSourceId: number | null;
}

interface CollectorSession {
  id: number;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  stopReason: string | null;
  activeSources: number[];
  counters?: CollectorCounters;
  error?: string | null;
}

function csrfToken(): string {
  return document.cookie.split('; ').find((v) => v.startsWith('csrf_token='))?.split('=')[1] ?? '';
}

function formatDuration(startedAt: string | null): string {
  if (!startedAt) return '—';
  const ms = Date.now() - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function CollectorRunner({ lang }: { lang: Lang }) {
  const [session, setSession] = useState<CollectorSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [, forceRefresh] = useState(0);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedHereRef = useRef(false);

  const stopIntervals = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    if (refreshRef.current) clearInterval(refreshRef.current);
    heartbeatRef.current = null;
    refreshRef.current = null;
  }, []);

  const heartbeat = useCallback(async () => {
    try {
      await fetch('/api/collector/heartbeat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
        body: JSON.stringify({}),
      });
    } catch { /* network jitter must not kill the session */ }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/collector/status', { method: 'GET', headers: { 'content-type': 'application/json' } });
      const data = (await res.json()) as { active: boolean; session?: CollectorSession };
      if (data.active && data.session) {
        setSession(data.session);
        forceRefresh((v) => v + 1);
      } else {
        setSession(null);
        stopIntervals();
      }
    } catch { /* ignore */ }
  }, [stopIntervals]);

  const beginLoops = useCallback(() => {
    stopIntervals();
    heartbeatRef.current = setInterval(() => void heartbeat(), 12_000);
    refreshRef.current = setInterval(() => void refreshStatus(), 12_000);
  }, [heartbeat, refreshStatus, stopIntervals]);

  // On mount, resume the heartbeat loop if a session is already active so that
  // navigation between pages keeps the run alive without restarting it.
  useEffect(() => {
    void refreshStatus();
    return () => stopIntervals();
  }, []);

  // Best-effort clean shutdown when the tab is actually closed.
  useEffect(() => {
    const onPageHide = () => {
      if (startedHereRef.current) {
        try {
          const blob = new Blob([JSON.stringify({ csrf: csrfToken() })], { type: 'application/json' });
          navigator.sendBeacon('/api/collector/stop', blob);
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  const handleStart = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/collector/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { ok: boolean; session?: CollectorSession };
      if (data.ok && data.session) {
        startedHereRef.current = true;
        setSession(data.session);
        beginLoops();
      }
    } catch { /* ignore */ } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/collector/stop', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
        body: JSON.stringify({}),
      });
      startedHereRef.current = false;
      stopIntervals();
      setSession(null);
    } catch { /* ignore */ } finally {
      setBusy(false);
    }
  };

  const status = session?.status ?? 'stopped';
  const counters = session?.counters;
  const statusLabel =
    status === 'running' ? t(lang, 'collector.running')
      : status === 'starting' ? t(lang, 'collector.starting')
        : status === 'stopping' ? t(lang, 'collector.stopping')
          : status === 'error' ? t(lang, 'collector.error')
            : t(lang, 'collector.stopped');

  const statusClass =
    status === 'running' ? 'badge-success'
      : status === 'error' ? 'badge-danger'
        : status === 'starting' || status === 'stopping' ? 'badge-warning'
          : 'badge-muted';

  return (
    <section className="panel collector-runner" aria-label={t(lang, 'collector.title')}>
      <div className="collector-runner-head">
        <div>
          <p className="eyebrow">{t(lang, 'collector.title')}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className={`badge ${statusClass}`}>{statusLabel}</span>
            {session?.startedAt && (
              <span className="muted" style={{ fontSize: '12px' }}>
                {t(lang, 'collector.duration')}: {formatDuration(session.startedAt)} · {t(lang, 'collector.activeSources')}: {session.activeSources?.length ?? 0}
              </span>
            )}
          </div>
        </div>
        <div className="toolbar">
          {status === 'running' || status === 'starting' ? (
            <button type="button" className="danger" disabled={busy} onClick={handleStop}>
              {t(lang, 'collector.stop')}
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={handleStart}>
              {t(lang, 'collector.start')}
            </button>
          )}
        </div>
      </div>

      {counters && (
        <div className="collector-counters">
          <div className="collector-counter"><span className="muted">{t(lang, 'collector.pages')}</span><strong>{counters.pagesChecked}</strong></div>
          <div className="collector-counter"><span className="muted">{t(lang, 'collector.listings')}</span><strong>{counters.discoveredListings}</strong></div>
          <div className="collector-counter"><span className="muted">{t(lang, 'collector.new')}</span><strong style={{ color: 'var(--success)' }}>+{counters.newContacts}</strong></div>
          <div className="collector-counter"><span className="muted">{t(lang, 'collector.duplicates')}</span><strong>{counters.duplicates}</strong></div>
          <div className="collector-counter"><span className="muted">{t(lang, 'collector.errors')}</span><strong style={{ color: counters.errors > 0 ? 'var(--danger)' : 'inherit' }}>{counters.errors}</strong></div>
          <div className="collector-counter"><span className="muted">{t(lang, 'collector.currentSource')}</span><strong>{counters.currentSourceId ? `#${counters.currentSourceId}` : '—'}</strong></div>
        </div>
      )}

      {session?.stopReason && (
        <div className="muted" style={{ marginTop: '8px', fontSize: '12px' }}>
          {t(lang, 'collector.heartbeatLost')}: {session.stopReason}
        </div>
      )}
    </section>
  );
}
