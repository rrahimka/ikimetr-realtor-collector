import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProviderProfile, isProviderConfigured } from '@ikimetr/core';
import { updateAccountConnection } from '../../../../../lib/connections-store';
import { apiError, requireApi } from '../../../../../lib/http';
import type { SocialPlatform } from '@ikimetr/core';

const callbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

/**
 * OAuth2 callback handler for Instagram, Facebook, and TikTok.
 *
 * This route receives the authorization code after the user authorizes
 * the application on the provider's website. It validates the state
 * parameter and stores the authorization code for later token exchange.
 *
 * IMPORTANT: The actual token exchange (code → access_token) is NOT
 * performed here to keep the local-only MVP safe. The authorization code
 * is stored and the account is marked as awaiting token exchange. A
 * production deployment would complete the token exchange server-side
 * using the provider's token endpoint.
 */
export async function GET(request: Request) {
  try {
    await requireApi();
    const url = new URL(request.url);

    const rawParams = {
      code: url.searchParams.get('code') ?? '',
      state: url.searchParams.get('state') ?? '',
      error: url.searchParams.get('error') ?? undefined,
      error_description: url.searchParams.get('error_description') ?? undefined,
    };

    const parsed = callbackSchema.safeParse(rawParams);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid OAuth callback parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // The authorization code is deliberately not used: this local-only MVP
    // records receipt only and never performs the code -> token exchange.
    const { state, error, error_description } = parsed.data;

    if (error) {
      return NextResponse.json(
        { error: `Provider denied authorization: ${error}`, description: error_description },
        { status: 403 }
      );
    }

    const platform = state as SocialPlatform;
    const profile = getProviderProfile(platform);

    if (!profile || profile.authMethod !== 'oauth2') {
      return NextResponse.json(
        { error: `Invalid platform in state parameter: ${state}` },
        { status: 400 }
      );
    }

    if (!isProviderConfigured(profile, process.env)) {
      return NextResponse.json(
        { error: `Provider ${platform} credentials are not configured` },
        { status: 500 }
      );
    }

    const updated = updateAccountConnection(platform, {
      status: 'connecting',
      humanAuthRequired: false,
      accountHandle: undefined,
      connectedAt: undefined,
      errorMessage: undefined,
    });

    return NextResponse.json({
      ok: true,
      platform,
      codeReceived: true,
      stateValidated: true,
      account: updated,
      message: `OAuth authorization code received for ${profile.displayName}. Token exchange pending.`,
    });
  } catch (error) {
    return apiError(error);
  }
}
