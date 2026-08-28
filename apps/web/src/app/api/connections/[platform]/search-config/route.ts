import { NextResponse } from 'next/server';
import { z } from 'zod';
import { updateAccountSearchConfig } from '../../../../../lib/connections-store';
import { apiError, requireApi } from '../../../../../lib/http';
import {
  type SearchSurfaceMode,
  type SocialPlatform,
} from '@ikimetr/core';

type Context = { params: Promise<{ platform: string }> };

const searchConfigSchema = z.object({
  enabledSurfaces: z.array(z.string()),
  purpose: z.enum(['realtors', 'leads', 'both']),
  maxSafePreset: z.boolean().default(false),
});

export async function PUT(request: Request, { params }: Context) {
  try {
    await requireApi(true);
    const { platform } = await params;
    const body = searchConfigSchema.parse(await request.json());

    const updated = updateAccountSearchConfig(
      platform as SocialPlatform,
      body.enabledSurfaces as SearchSurfaceMode[],
      body.purpose,
      body.maxSafePreset
    );

    return NextResponse.json({ ok: true, account: updated });
  } catch (error) {
    return apiError(error);
  }
}
