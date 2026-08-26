'use client';

import { useState } from 'react';
import { showToast } from './toast';

function csrf() {
  return document.cookie.split('; ').find((v) => v.startsWith('csrf_token='))?.split('=')[1] ?? '';
}

export interface ApiButtonProps {
  url: string;
  label: string;
  body?: unknown;
  kind?: 'button' | 'danger' | 'secondary';
  loadingLabel?: string;
  ackLabel?: string;
  successToast?: string;
  errorToast?: string;
  disabled?: boolean;
  disabledTitle?: string;
  onSuccess?: (data: unknown) => void;
  autoReload?: boolean;
}

export function ApiButton({
  url,
  label,
  body,
  kind = 'button',
  loadingLabel,
  successToast,
  errorToast,
  disabled = false,
  disabledTitle,
  onSuccess,
  autoReload = true,
}: ApiButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (disabled || busy) return;

    setBusy(true);
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrf(),
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    try {
      const response = await fetch(url, init);
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (response.ok) {
        if (successToast) {
          showToast(successToast, 'success');
        }
        if (onSuccess) {
          onSuccess(data);
        }
        if (autoReload) {
          location.reload();
        } else {
          setBusy(false);
        }
      } else {
        setBusy(false);
        const errorMessage = data.error || errorToast || 'Action failed';
        showToast(errorMessage, 'error');
      }
    } catch (err) {
      setBusy(false);
      const msg = err instanceof Error ? err.message : 'Network error';
      showToast(msg, 'error');
    }
  };

  const buttonClass = `${kind}`.trim();

  return (
    <button
      className={buttonClass}
      disabled={disabled || busy}
      title={disabledTitle}
      onClick={handleClick}
      type="button"
    >
      {busy ? loadingLabel ?? '…' : label}
    </button>
  );
}

export async function apiMutation(url: string, method: string, body?: unknown) {
  const init: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrf(),
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return fetch(url, init);
}
