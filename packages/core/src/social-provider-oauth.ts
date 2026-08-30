import { createHash, randomBytes } from 'node:crypto';
import type { SocialPlatform } from './social-connections';
import { PROVIDER_REGISTRY } from './social-provider-capabilities';

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

function base64Url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Generates an RFC 7636 PKCE verifier/challenge pair (S256). Pure, no network. */
export function generatePkcePair(): PkcePair {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge, method: 'S256' };
}

export interface BuildAuthorizeUrlParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod?: 'S256';
}

/**
 * Builds the provider-correct OAuth 2.0 authorize URL (PKCE). Pure function:
 * constructs the URL string only, makes NO network request. Throws for
 * non-OAuth providers so a mock flow is never silently faked.
 *
 * Server-only: depends on node:crypto. Do not import from client components.
 */
export function buildOAuthAuthorizeUrl(platform: SocialPlatform, params: BuildAuthorizeUrlParams): string {
  const profile = PROVIDER_REGISTRY[platform];
  if (!profile.oauth) {
    throw new Error(`Platform ${platform} does not support OAuth2 authorization`);
  }
  const url = new URL(profile.oauth.authorizeUrl);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', profile.oauth.scopes.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', params.codeChallengeMethod ?? 'S256');
  return url.toString();
}

export interface TokenExchangeRequest {
  url: string;
  body: Record<string, string>;
}

/**
 * Builds the token-exchange request (PKCE) for an OAuth provider. Pure: returns
 * the URL + form body only, performs NO fetch. The actual exchange must run
 * server-side with real credentials, never from the browser and never in tests.
 *
 * Server-only: depends on node:crypto. Do not import from client components.
 */
export function buildTokenExchangeRequest(
  platform: SocialPlatform,
  opts: { clientId: string; clientSecret?: string; code: string; redirectUri: string; codeVerifier: string },
): TokenExchangeRequest {
  const profile = PROVIDER_REGISTRY[platform];
  if (!profile.oauth) {
    throw new Error(`Platform ${platform} does not support OAuth2 token exchange`);
  }
  return {
    url: profile.oauth.tokenUrl,
    body: {
      client_id: opts.clientId,
      client_secret: opts.clientSecret ?? '',
      code: opts.code,
      grant_type: 'authorization_code',
      redirect_uri: opts.redirectUri,
      code_verifier: opts.codeVerifier,
    },
  };
}
