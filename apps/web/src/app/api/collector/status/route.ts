import { NextResponse } from 'next/server';
import { getRepositories } from '../../../../lib/db';
import { requireApi, apiError } from '../../../../lib/http';

export async function GET() {
  try {
    await requireApi();
    const repos = getRepositories();
    const session = repos.collectorSessions.getActive();
    if (!session) {
      return NextResponse.json({ active: false });
    }
    const counters = repos.collectorSessions.computeCounters(session.id);
    repos.collectorSessions.setCounters(session.id, counters as unknown as Record<string, number>);
    return NextResponse.json({ active: true, session: { ...session, counters } });
  } catch (error) {
    return apiError(error);
  }
}
