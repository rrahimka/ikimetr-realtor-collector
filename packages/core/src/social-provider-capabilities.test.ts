import { describe, expect, it } from 'vitest';
import {
  PROVIDER_REGISTRY,
  getProviderProfile,
  isCapabilitySupported,
  isProviderConfigured,
  listProviderProfiles,
  listUnsupportedCapabilities,
} from './social-provider-capabilities';
import {
  buildOAuthAuthorizeUrl,
  buildTokenExchangeRequest,
  generatePkcePair,
} from './social-provider-oauth';

const PLATFORMS = ['instagram', 'tiktok', 'facebook', 'whatsapp', 'telegram'] as const;

describe('social-provider-capabilities', () => {
  it('classifies every platform without mocks or unsupported-as-working', () => {
    expect(listProviderProfiles()).toHaveLength(PLATFORMS.length);
    for (const platform of PLATFORMS) {
      const profile = PROVIDER_REGISTRY[platform];
      expect(profile.platform).toBe(platform);
      expect(['real', 'architecture_ready', 'mock', 'unsupported']).toContain(profile.status);
      // A provider must never advertise an unsupported capability as supported.
      for (const cap of profile.unsupportedCapabilities) {
        expect(profile.supportedCapabilities).not.toContain(cap);
      }
    }
  });

  it('marks telegram as the only real provider-supported path', () => {
    expect(getProviderProfile('telegram').status).toBe('real');
    expect(getProviderProfile('telegram').authMethod).toBe('mtproto');
    expect(['instagram', 'tiktok', 'facebook', 'whatsapp'].every((p) => getProviderProfile(p as never).status === 'architecture_ready')).toBe(true);
  });

  it('does not fake group member enumeration or following lists', () => {
    expect(listUnsupportedCapabilities('whatsapp')).toContain('group_member_enumeration_official_api');
    expect(listUnsupportedCapabilities('tiktok')).toContain('following_list');
    expect(isCapabilitySupported('tiktok', 'following_list')).toBe(false);
    expect(isCapabilitySupported('whatsapp', 'group_member_enumeration_official_api')).toBe(false);
  });

  it('isProviderConfigured reflects env presence only', () => {
    const empty = {} as NodeJS.ProcessEnv;
    expect(isProviderConfigured(getProviderProfile('telegram'), empty)).toBe(false);
    const filled = {
      TELEGRAM_API_ID: '1',
      TELEGRAM_API_HASH: 'h',
      TELEGRAM_SESSION_STRING: 's',
    } as NodeJS.ProcessEnv;
    expect(isProviderConfigured(getProviderProfile('telegram'), filled)).toBe(true);
  });

  it('generates RFC 7636 PKCE pairs', () => {
    const pair = generatePkcePair();
    expect(pair.method).toBe('S256');
    expect(pair.verifier.length).toBeGreaterThan(40);
    // verifier must be url-safe base64
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    const second = generatePkcePair();
    expect(second.verifier).not.toBe(pair.verifier);
  });

  it('builds provider-correct OAuth authorize URLs (PKCE, no network)', () => {
    const challenge = generatePkcePair().challenge;
    const ig = buildOAuthAuthorizeUrl('instagram', {
      clientId: 'APP_ID',
      redirectUri: 'https://localhost/cb',
      state: 'st',
      codeChallenge: challenge,
    });
    expect(ig.startsWith('https://www.instagram.com/oauth/authorize')).toBe(true);
    expect(ig).toContain('client_id=APP_ID');
    expect(ig).toContain('code_challenge=' + challenge);
    expect(ig).toContain('code_challenge_method=S256');
    expect(ig).toContain('response_type=code');
    expect(ig).toContain('scope=instagram_basic');

    const tt = buildOAuthAuthorizeUrl('tiktok', {
      clientId: 'KEY',
      redirectUri: 'https://localhost/cb',
      state: 'st',
      codeChallenge: challenge,
    });
    expect(tt.startsWith('https://www.tiktok.com/v2/auth/authorize/')).toBe(true);
    expect(tt).toContain('scope=user.info.basic');
    expect(tt).toContain('video.list');

    const fb = buildOAuthAuthorizeUrl('facebook', {
      clientId: 'FBID',
      redirectUri: 'https://localhost/cb',
      state: 'st',
      codeChallenge: challenge,
    });
    expect(fb.startsWith('https://www.facebook.com/v21.0/dialog/oauth')).toBe(true);

    // Non-OAuth providers must throw rather than fake a URL.
    expect(() => buildOAuthAuthorizeUrl('telegram', {} as never)).toThrow();
    expect(() => buildOAuthAuthorizeUrl('whatsapp', {} as never)).toThrow();
  });

  it('builds token-exchange requests without performing a fetch', () => {
    const pair = generatePkcePair();
    const req = buildTokenExchangeRequest('instagram', {
      clientId: 'APP_ID',
      clientSecret: 'SECRET',
      code: 'CODE',
      redirectUri: 'https://localhost/cb',
      codeVerifier: pair.verifier,
    });
    expect(req.url).toBe('https://api.instagram.com/oauth/access_token');
    expect(req.body.grant_type).toBe('authorization_code');
    expect(req.body.code_verifier).toBe(pair.verifier);
    expect(req.body.client_secret).toBe('SECRET');

    expect(() => buildTokenExchangeRequest('telegram', {} as never)).toThrow();
  });
});
