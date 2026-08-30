import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Api } from 'telegram';
import { requireTelegramAuth } from '../../../../../lib/telegram-session';
import { scanTelegramAuthorizedMessages } from '@ikimetr/connectors';
import type { TelegramAuthorizedMessage } from '@ikimetr/connectors';
import { apiError, requireApi } from '../../../../../lib/http';

const querySchema = z.object({
  chatId: z.string().min(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  offsetId: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    await requireApi();
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      chatId: url.searchParams.get('chatId'),
      limit: url.searchParams.get('limit'),
      offsetId: url.searchParams.get('offsetId'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { chatId, limit, offsetId } = parsed.data;

    const numericChatId = Number(chatId);
    if (Number.isNaN(numericChatId) || numericChatId > 0) {
      return NextResponse.json(
        { error: 'Private chat IDs are not allowed. Use a group or channel ID.' },
        { status: 400 }
      );
    }

    const client = await requireTelegramAuth();

    const rawMessages = await client.getMessages(chatId, {
      limit,
      ...(offsetId ? { offsetId: Number(offsetId) } : {}),
    });

    const messages: TelegramAuthorizedMessage[] = rawMessages
      .filter((msg): msg is Api.Message => msg instanceof Api.Message)
      .map((msg) => {
        const msgChatId = msg.chatId != null ? Number(msg.chatId.toString()) : 0;
        const isChannel = msg.isChannel;
        const isGroup = msg.isGroup;
        const chatType = isChannel ? 'channel' : isGroup ? 'supergroup' : 'group';

        const text = msg.text || '';
        const date = msg.date
          ? new Date(msg.date * 1000).toISOString()
          : new Date().toISOString();

        const entry: TelegramAuthorizedMessage = {
          id: msg.id,
          chatId: msgChatId,
          chatType,
          text,
          date,
        };

        if (msg.senderId) {
          entry.senderId = Number(msg.senderId.toString());
        }

        if (isChannel) {
          const numericId = String(msgChatId).replace(/^-100/, '');
          entry.permalink = `https://t.me/c/${numericId}/${msg.id}`;
        }

        return entry;
      });

    const scanResult = scanTelegramAuthorizedMessages(messages);

    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : undefined;

    return NextResponse.json({
      ok: true,
      messages,
      scanResult: {
        scannedCount: scanResult.scannedCount,
        leadCandidates: scanResult.leadCandidates.length,
        realtorEvidence: scanResult.realtorEvidence.length,
      },
      pagination: {
        hasMore: messages.length === limit,
        nextOffsetId: lastMsg ? String(lastMsg.id) : undefined,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
