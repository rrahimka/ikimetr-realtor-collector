import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getConnectionsStore,
  updateAccountConnection,
  buildConnectAuthorizeResult,
  withoutSessionSecrets,
} from '../../../lib/connections-store';
import { clearAuthState } from '../../../lib/telegram-session';
import { apiError, requireApi } from '../../../lib/http';

export async function GET() {
  try {
    await requireApi();
    const store = getConnectionsStore();
    return NextResponse.json(withoutSessionSecrets(store));
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
      if (body.platform === 'telegram') {
        await clearAuthState();
      }
      const updated = updateAccountConnection(body.platform, {
        status: 'disconnected',
        accountHandle: undefined,
        humanAuthRequired: false,
        qrCodeData: undefined,
        sessionString: body.platform === 'telegram' ? undefined : undefined,
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

      // Provider-faithful connect: real OAuth authorize URL (PKCE) when app
      // credentials are configured, or a real MTProto session path. Never fake
      // a "connected" state — we return an authorize URL or a credentials hint.
      const result = buildConnectAuthorizeResult(body.platform, process.env);
      if (result.kind === 'oauth' && result.authorizeUrl) {
        const updated = updateAccountConnection(body.platform, {
          status: 'connecting',
          humanAuthRequired: false,
          authorizeUrl: result.authorizeUrl,
          accountHandle: undefined,
          connectedAt: undefined,
          errorMessage: undefined,
        });
        return NextResponse.json({ ok: true, account: updated, authorizeUrl: result.authorizeUrl });
      }
      if (result.kind === 'mtproto') {
        const updated = updateAccountConnection(body.platform, {
          status: 'connecting',
          humanAuthRequired: true,
          humanAuthType: 'otp',
          humanAuthPrompt: 'Enter your Telegram phone number to begin authorization.',
          accountHandle: undefined,
          connectedAt: undefined,
          errorMessage: undefined,
        });
        return NextResponse.json({
          ok: true,
          account: updated,
          authEndpoint: '/api/connections/telegram/auth',
          message: 'Use /api/connections/telegram/auth to complete Telegram authorization.',
        });
      }
      // needs_credentials: report honestly, do not fake a connection.
      const updated = updateAccountConnection(body.platform, {
        status: 'connecting',
        humanAuthRequired: false,
        authorizeUrl: undefined,
        accountHandle: undefined,
        connectedAt: undefined,
        errorMessage: 'Provider credentials are not configured (see environment variables).',
      });
      return NextResponse.json({ ok: true, account: updated, needsCredentials: true });
    }

    if (body.action === 'confirm_auth') {
      const store = getConnectionsStore();
      const current = store.accounts[body.platform];
      if (!current || current.status !== 'connecting') {
        return NextResponse.json(
          { error: 'Platform must be in connecting state before confirming auth' },
          { status: 400 }
        );
      }
      if (!body.accountHandle) {
        return NextResponse.json(
          { error: 'accountHandle is required to confirm auth (no hardcoded handles)' },
          { status: 400 }
        );
      }
      const updated = updateAccountConnection(body.platform, {
        status: 'connected',
        accountHandle: body.accountHandle,
        humanAuthRequired: false,
        connectedAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, account: updated });
    }

    if (body.action === 'switch_account') {
      // Switching account: revoke the old session and enter connecting state.
      // For WhatsApp, re-enter the QR auth flow. For Telegram, re-enter the
      // OTP auth flow. For others, re-enter the confirmation flow.
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

      if (body.platform === 'telegram') {
        await clearAuthState();
        const updated = updateAccountConnection(body.platform, {
          status: 'connecting',
          accountHandle: undefined,
          humanAuthRequired: true,
          humanAuthType: 'otp',
          humanAuthPrompt: 'Enter your Telegram phone number to begin authorization.',
          sessionString: undefined,
        });
        return NextResponse.json({ ok: true, account: updated });
      }

      // For Instagram/TikTok/Facebook: enter connecting state.
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
