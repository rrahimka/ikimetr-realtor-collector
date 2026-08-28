import { NextResponse } from 'next/server';
import { getRepositories } from '../../../../lib/db';
import { requireApi, apiError } from '../../../../lib/http';
import { getSourceCategory, isSourceSupported } from '../../../../lib/source-options';
import { getConnectionsStore } from '../../../../lib/connections-store';

export async function POST(request: Request) {
  try {
    await requireApi(true);

    if (process.env.GLOBAL_KILL_SWITCH === 'true') {
      return NextResponse.json({
        ok: false,
        error: 'GLOBAL_KILL_SWITCH_ACTIVE',
        message: 'Global kill switch is active. Source execution is disabled.',
        queued: 0,
        alreadyRunning: 0,
        disabled: 0,
        skipped: 0,
        details: [],
      }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      category?: 'website' | 'social';
      action?: 'start' | 'stop';
    };

    const category = body.category || 'website';
    const action = body.action || 'start';
    const repos = getRepositories();
    const allSources = repos.sources.list();
    const connectionsStore = getConnectionsStore();

    if (action === 'stop') {
      const allRuns = repos.runs.list();
      let stoppedCount = 0;
      const details: Array<{ id: number; name: string; status: string }> = [];

      for (const run of allRuns) {
        if (['queued', 'running'].includes(run.status)) {
          const source = repos.sources.get(run.sourceId);
          if (source) {
            const cat = getSourceCategory(source.type || source.locator);
            if (cat === category || (category as string) === 'all') {
              repos.runs.requestCancellation(run.id);
              stoppedCount++;
              details.push({ id: source.id, name: source.name, status: 'STOPPING' });
            }
          }
        }
      }

      return NextResponse.json({
        ok: true,
        action: 'stop',
        category,
        stoppedCount,
        details,
      });
    }

    // action === 'start'
    let queuedCount = 0;
    let alreadyRunningCount = 0;
    let disabledCount = 0;
    let skippedCount = 0;
    const details: Array<{ id: number; name: string; status: string; reason?: string }> = [];

    const categorySources = allSources.filter((s) => {
      const cat = getSourceCategory(s.type || s.locator);
      return cat === category;
    });

    for (const source of categorySources) {
      if (!source.enabled) {
        disabledCount++;
        details.push({ id: source.id, name: source.name, status: 'DISABLED' });
        continue;
      }

      if (source.killSwitch) {
        disabledCount++;
        details.push({ id: source.id, name: source.name, status: 'KILL_SWITCH' });
        continue;
      }

      if (category === 'social') {
        const supported = isSourceSupported(source.type) || isSourceSupported(source.locator);
        if (!supported && source.type !== 'test_fixture') {
          skippedCount++;
          details.push({ id: source.id, name: source.name, status: 'NOT_SUPPORTED' });
          continue;
        }

        // Check if social account is connected
        let isConnected = false;
        const sType = String(source.type);
        const sLoc = source.locator.toLowerCase();

        if (sType.startsWith('instagram') || sLoc.includes('instagram.com')) {
          isConnected = connectionsStore.accounts.instagram?.status === 'connected';
        } else if (sType.startsWith('tiktok') || sLoc.includes('tiktok.com')) {
          isConnected = connectionsStore.accounts.tiktok?.status === 'connected';
        } else if (sType.startsWith('facebook') || sLoc.includes('facebook.com')) {
          isConnected = connectionsStore.accounts.facebook?.status === 'connected';
        } else if (sType.startsWith('whatsapp') || sLoc.includes('whatsapp.com')) {
          isConnected = connectionsStore.accounts.whatsapp?.status === 'connected';
        } else if (sType.startsWith('telegram') || sLoc.includes('t.me')) {
          isConnected = true;
        } else if (source.type === 'test_fixture') {
          isConnected = true;
        }

        if (!isConnected) {
          skippedCount++;
          details.push({ id: source.id, name: source.name, status: 'AUTH_REQUIRED', reason: 'Account not connected' });
          continue;
        }
      }

      if (repos.runs.hasActive(source.id)) {
        alreadyRunningCount++;
        details.push({ id: source.id, name: source.name, status: 'ALREADY_RUNNING' });
        continue;
      }

      try {
        repos.runs.enqueue(source.id);
        queuedCount++;
        details.push({ id: source.id, name: source.name, status: 'QUEUED' });
      } catch {
        skippedCount++;
        details.push({ id: source.id, name: source.name, status: 'ERROR' });
      }
    }

    return NextResponse.json({
      ok: true,
      action: 'start',
      category,
      queued: queuedCount,
      alreadyRunning: alreadyRunningCount,
      disabled: disabledCount,
      skipped: skippedCount,
      details,
    });
  } catch (error) {
    return apiError(error);
  }
}
