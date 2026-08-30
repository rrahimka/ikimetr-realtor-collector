import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Api } from 'telegram';
import { requireTelegramAuth } from '../../../../../lib/telegram-session';
import { apiError, requireApi } from '../../../../../lib/http';

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
});

export async function GET(request: Request) {
  try {
    await requireApi();
    const url = new URL(request.url);
    const { limit } = querySchema.parse({
      limit: url.searchParams.get('limit'),
    });

    const client = await requireTelegramAuth();

    const dialogs = await client.getDialogs({ limit });
    const result: Array<{
      id: number;
      title: string;
      type: string;
      username?: string;
      participantCount?: number;
      isCreator?: boolean;
    }> = [];

    for (const dialog of dialogs) {
      if (!dialog.entity || dialog.id == null) continue;
      const entity = dialog.entity;

      let type = 'user';
      let title = '';
      let username: string | undefined;
      let isCreator: boolean | undefined;

      if (entity instanceof Api.Channel) {
        type = entity.megagroup ? 'supergroup' : 'channel';
        title = entity.title;
        username = entity.username;
        isCreator = entity.creator;
      } else if (entity instanceof Api.Chat) {
        type = 'group';
        title = entity.title;
        isCreator = entity.creator;
      } else if (entity instanceof Api.User) {
        type = 'user';
        title = `${entity.firstName || ''} ${entity.lastName || ''}`.trim();
        username = entity.username;
      }

      if (title && type !== 'user') {
        const entry: {
          id: number;
          title: string;
          type: string;
          username?: string;
          participantCount?: number;
          isCreator?: boolean;
        } = {
          id: Number(dialog.id.toString()),
          title,
          type,
        };
        if (username) entry.username = username;
        if (isCreator != null) entry.isCreator = isCreator;
        result.push(entry);
      }
    }

    return NextResponse.json({ ok: true, dialogs: result });
  } catch (error) {
    return apiError(error);
  }
}
