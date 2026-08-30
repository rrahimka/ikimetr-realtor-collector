import { NextResponse } from 'next/server';
import { getRepositories } from '../../../../lib/db';
import { requireApi, apiError } from '../../../../lib/http';
import { verifyCsrfRelaxed } from '../../../../lib/csrf';

export async function POST(request: Request) {
  try {
    await requireApi();
    await verifyCsrfRelaxed(request);
    const repos = getRepositories();
    const session = repos.collectorSessions.getActive();
    if (!session) {
      return NextResponse.json({ ok: true, active: false });
    }
    const updated = repos.collectorSessions.heartbeat(session.id);
    return NextResponse.json({ ok: true, active: true, session: updated });
  } catch (error) {
    return apiError(error);
  }
}
