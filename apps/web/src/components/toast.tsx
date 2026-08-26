'use client';

import { useEffect, useState } from 'react';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

type ToastListener = (toasts: ToastItem[]) => void;
let listeners: ToastListener[] = [];
let toastState: ToastItem[] = [];

function notify() {
  for (const listener of listeners) {
    listener([...toastState]);
  }
}

export function showToast(message: string, type: 'success' | 'error' | 'info' = 'success', durationMs = 4000) {
  const id = Math.random().toString(36).substring(2, 9);
  const item: ToastItem = { id, message, type };
  toastState = [...toastState, item];
  notify();

  setTimeout(() => {
    toastState = toastState.filter((t) => t.id !== id);
    notify();
  }, durationMs);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    listeners.push(setToasts);
    return () => {
      listeners = listeners.filter((l) => l !== setToasts);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" role="region">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role="status">
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
