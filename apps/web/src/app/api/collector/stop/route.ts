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
      return NextResponse.json({ ok: true, stopped: false });
    }
    repos.runs.requestCancellationBySession(session.id);
    const stopped = repos.collectorSessions.markStopped(session.id, 'user_requested');
    return NextResponse.json({ ok: true, stopped: true, session: stopped });
  } catch (error) {
    return apiError(error);
  }
}
