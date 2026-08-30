import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getConnectionsStore,
  updateAccountConnection,
} from '../../../lib/connections-store';
import { apiError, requireApi } from '../../../lib/http';

export async function GET() {
  try {
    await requireApi();
    const store = getConnectionsStore();
    return NextResponse.json(store);
  } catch (error) {
    return apiError(error);
  }
}

const actionSchema = z.object({
  platform: z.enum(['instagram', 'tiktok', 'facebook', 'whatsapp', 'telegram']),
  action: z.enum(['connect', 'disconnect', 'confirm_auth', 'switch_account']),
  accountHandle: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    await requireApi(true);
    const body = actionSchema.parse(await request.json());

    if (body.action === 'disconnect') {
      const updated = updateAccountConnection(body.platform, {
        status: 'disconnected',
        accountHandle: undefined,
        humanAuthRequired: false,
        qrCodeData: undefined,
      });
      return NextResponse.json({ ok: true, account: updated });
    }

    if (body.action === 'connect') {
      if (body.platform === 'whatsapp') {
        // WhatsApp QR code authorization flow
        const updated = updateAccountConnection(body.platform, {
          status: 'connecting',
          humanAuthRequired: true,
          humanAuthType: 'qr',
          humanAuthPrompt: 'Отсканируйте QR-код в приложении WhatsApp на вашем телефоне (Связанные устройства)',
          qrCodeData: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="%23f1f5f9"/><text x="50%" y="50%" font-size="14" font-weight="bold" fill="%230284c7" dominant-baseline="middle" text-anchor="middle">WHATSAPP QR</text></svg>',
        });
        return NextResponse.json({ ok: true, account: updated });
      }

      // Instagram / TikTok / Facebook / Telegram confirmation flow
      const handle = body.accountHandle || (body.platform === 'instagram' ? '@baku_realtor_pilot' : body.platform === 'tiktok' ? '@baku_realtor' : body.platform === 'telegram' ? '+994 50 555 12 34' : 'baku.realtor');
      const updated = updateAccountConnection(body.platform, {
        status: 'connected',
        accountHandle: handle,
        connectedAt: new Date().toISOString(),
        humanAuthRequired: false,
      });
      return NextResponse.json({ ok: true, account: updated });
    }

    if (body.action === 'confirm_auth') {
      const handle = body.accountHandle || (body.platform === 'whatsapp' ? '+994 50 123 45 67' : body.platform === 'telegram' ? '+994 50 555 12 34' : '@user');
      const updated = updateAccountConnection(body.platform, {
        status: 'connected',
        accountHandle: handle,
        humanAuthRequired: false,
        connectedAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, account: updated });
    }

    if (body.action === 'switch_account') {
      // Switching account: revoke the old session and enter connecting state.
      // For WhatsApp, re-enter the QR auth flow. For others, re-enter the
      // confirmation flow. The old session is effectively revoked by
      // clearing the handle; a new connect flow must be completed.
      if (body.platform === 'whatsapp') {
        const updated = updateAccountConnection(body.platform, {
          status: 'connecting',
          accountHandle: undefined,
          humanAuthRequired: true,
          humanAuthType: 'qr',
          humanAuthPrompt: 'Отсканируйте QR-код в приложении WhatsApp на вашем телефоне (Связанные устройства)',
          qrCodeData: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="%23f1f5f9"/><text x="50%" y="50%" font-size="14" font-weight="bold" fill="%230284c7" dominant-baseline="middle" text-anchor="middle">WHATSAPP QR</text></svg>',
        });
        return NextResponse.json({ ok: true, account: updated });
      }

      // For Instagram/TikTok/Facebook/Telegram: enter connecting state.
      const updated = updateAccountConnection(body.platform, {
        status: 'connecting',
        accountHandle: undefined,
        humanAuthRequired: true,
        humanAuthType: 'browser',
        humanAuthPrompt: `Подтвердите вход в ${body.platform} на вашем устройстве для смены аккаунта.`,
      });
      return NextResponse.json({ ok: true, account: updated });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
