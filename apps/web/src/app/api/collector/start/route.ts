import { NextResponse } from 'next/server';
import { getRepositories } from '../../../../lib/db';
import { requireApi, apiError } from '../../../../lib/http';

export async function POST() {
  try {
    await requireApi(true);
    if (process.env.GLOBAL_KILL_SWITCH === 'true') {
      return NextResponse.json({ ok: false, error: 'GLOBAL_KILL_SWITCH_ACTIVE' }, { status: 403 });
    }
    const repos = getRepositories();
    const session = repos.collectorSessions.create('web');
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    return apiError(error);
  }
}
