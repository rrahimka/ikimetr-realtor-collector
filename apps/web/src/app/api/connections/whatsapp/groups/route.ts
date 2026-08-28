import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getConnectionsStore,
  updateWhatsAppGroupConsent,
} from '../../../../../lib/connections-store';
import { apiError, requireApi } from '../../../../../lib/http';

export async function GET() {
  try {
    await requireApi();
    const store = getConnectionsStore();
    return NextResponse.json({ groups: store.whatsappGroups });
  } catch (error) {
    return apiError(error);
  }
}

const updateGroupSchema = z.object({
  groupId: z.string().min(1),
  authorized: z.boolean(),
  isRealtorOnlyGroup: z.boolean().optional(),
  searchMode: z.enum(['realtors', 'leads', 'both']).optional(),
});

export async function PUT(request: Request) {
  try {
    await requireApi(true);
    const body = updateGroupSchema.parse(await request.json());

    const updated = updateWhatsAppGroupConsent(
      body.groupId,
      body.authorized,
      body.isRealtorOnlyGroup,
      body.searchMode
    );

    if (!updated) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, group: updated });
  } catch (error) {
    return apiError(error);
  }
}
