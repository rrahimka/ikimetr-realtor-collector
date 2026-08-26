'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function AutoRefresh({ hasActiveRuns }: { hasActiveRuns: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!hasActiveRuns) return;

    const interval = setInterval(() => {
      router.refresh();
    }, 2500);

    return () => clearInterval(interval);
  }, [hasActiveRuns, router]);

  return null;
}
