import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getOrCreateClient,
  getAuthState,
  setAuthState,
  clearAuthState,
  formatAccountInfo,
  Api,
  authMethods,
  getTelegramApiCredentials,
} from '../../../../../lib/telegram-session';
import { updateAccountConnection } from '../../../../../lib/connections-store';
import { apiError, requireApi } from '../../../../../lib/http';

const actionSchema = z.object({
  action: z.enum(['start', 'send_code', 'sign_in', 'sign_in_2fa', 'status', 'cancel']),
  phoneNumber: z.string().optional(),
  code: z.string().optional(),
  password: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    await requireApi(true);
    const body = actionSchema.parse(await request.json());

    if (body.action === 'start') {
      await clearAuthState();
      setAuthState({ status: 'waiting_phone' });
      return NextResponse.json({
        ok: true,
        state: { status: 'waiting_phone' },
        message: 'Enter your phone number to begin Telegram authorization.',
      });
    }

    if (body.action === 'send_code') {
      if (!body.phoneNumber) {
        return NextResponse.json({ error: 'phoneNumber required' }, { status: 400 });
      }
      const client = getOrCreateClient();
      const { apiId, apiHash } = getTelegramApiCredentials();
      await client.connect();

      const result = await authMethods.sendCode(
        client,
        { apiId, apiHash },
        body.phoneNumber
      );

      setAuthState({
        status: 'waiting_code',
        phoneNumber: body.phoneNumber,
        phoneCodeHash: result.phoneCodeHash,
      });

      return NextResponse.json({
        ok: true,
        state: { status: 'waiting_code' },
        message: `Verification code sent to ${body.phoneNumber}.`,
      });
    }

    if (body.action === 'sign_in') {
      if (!body.code) {
        return NextResponse.json({ error: 'code required' }, { status: 400 });
      }
      const currentState = getAuthState();
      if (currentState.status !== 'waiting_code') {
        return NextResponse.json({ error: 'Invalid auth state. Send code first.' }, { status: 400 });
      }

      const client = getOrCreateClient();

      try {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: currentState.phoneNumber as string,
            phoneCodeHash: currentState.phoneCodeHash as string,
            phoneCode: body.code,
          })
        );
      } catch (err: unknown) {
        const error = err as { message?: string };
        if (
          error.message?.includes('2FA') ||
          error.message?.includes('password') ||
          error.message?.includes('SESSION_PASSWORD_NEEDED')
        ) {
          setAuthState({
            status: 'waiting_2fa',
            phoneNumber: currentState.phoneNumber,
            phoneCodeHash: currentState.phoneCodeHash,
          });
          return NextResponse.json({
            ok: true,
            state: { status: 'waiting_2fa' },
            message: '2FA password required.',
          });
        }
        throw err;
      }

      const accountInfo = await formatAccountInfo(client);
      const sessionString = client.session.save() as unknown as string;

      setAuthState({ status: 'connected', accountInfo });
      updateAccountConnection('telegram', {
        status: 'connected',
        accountHandle: accountInfo.username
          ? `@${accountInfo.username}`
          : String(accountInfo.id),
        connectedAt: new Date().toISOString(),
        sessionString,
      });

      return NextResponse.json({
        ok: true,
        state: getAuthState(),
        message: 'Telegram authorization successful.',
      });
    }

    if (body.action === 'sign_in_2fa') {
      if (!body.password) {
        return NextResponse.json({ error: 'password required' }, { status: 400 });
      }
      const currentState = getAuthState();
      if (currentState.status !== 'waiting_2fa') {
        return NextResponse.json({ error: 'Invalid auth state. Sign in first.' }, { status: 400 });
      }

      const client = getOrCreateClient();
      const { apiId, apiHash } = getTelegramApiCredentials();

      await authMethods.signInWithPassword(
        client,
        { apiId, apiHash },
        {
          password: () => Promise.resolve(body.password!),
          onError: (err: Error) => {
            throw err;
          },
        }
      );

      const accountInfo = await formatAccountInfo(client);
      const sessionString = client.session.save() as unknown as string;

      setAuthState({ status: 'connected', accountInfo });
      updateAccountConnection('telegram', {
        status: 'connected',
        accountHandle: accountInfo.username
          ? `@${accountInfo.username}`
          : String(accountInfo.id),
        connectedAt: new Date().toISOString(),
        sessionString,
      });

      return NextResponse.json({
        ok: true,
        state: getAuthState(),
        message: 'Telegram 2FA authorization successful.',
      });
    }

    if (body.action === 'status') {
      return NextResponse.json({ ok: true, state: getAuthState() });
    }

    if (body.action === 'cancel') {
      await clearAuthState();
      updateAccountConnection('telegram', {
        status: 'disconnected',
        sessionString: undefined,
      });
      return NextResponse.json({
        ok: true,
        state: { status: 'disconnected' },
        message: 'Telegram authorization cancelled.',
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET() {
  try {
    await requireApi();
    return NextResponse.json({ ok: true, state: getAuthState() });
  } catch (error) {
    return apiError(error);
  }
}
