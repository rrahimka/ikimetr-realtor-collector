import { describe, expect, it } from 'vitest';
import { resolveOriginGroup } from './origin.js';

describe('resolveOriginGroup', () => {
  it('classifies WhatsApp platform, URL, or source type as whatsapp', () => {
    expect(resolveOriginGroup({ platform: 'whatsapp' })).toBe('whatsapp');
    expect(resolveOriginGroup({ locator: 'https://chat.whatsapp.com/12345678' })).toBe('whatsapp');
    expect(resolveOriginGroup({ sourceType: 'whatsapp_group' })).toBe('whatsapp');
    expect(resolveOriginGroup({ sourceType: 'social_whatsapp' })).toBe('whatsapp');
  });

  it('classifies social media platforms as social', () => {
    expect(resolveOriginGroup({ platform: 'instagram' })).toBe('social');
    expect(resolveOriginGroup({ platform: 'tiktok' })).toBe('social');
    expect(resolveOriginGroup({ platform: 'telegram' })).toBe('social');
    expect(resolveOriginGroup({ platform: 'facebook' })).toBe('social');
    expect(resolveOriginGroup({ locator: 'https://t.me/baku_realtors' })).toBe('social');
    expect(resolveOriginGroup({ locator: 'https://instagram.com/baku_realestate' })).toBe('social');
  });

  it('classifies web listing portals as website', () => {
    expect(resolveOriginGroup({ platform: 'website' })).toBe('website');
    expect(resolveOriginGroup({ sourceType: 'bina_agency' })).toBe('website');
    expect(resolveOriginGroup({ locator: 'https://bina.az/baku' })).toBe('website');
    expect(resolveOriginGroup({ locator: 'https://tap.az/elanlar' })).toBe('website');
    expect(resolveOriginGroup({ locator: 'https://arenda.az/kiraye' })).toBe('website');
    expect(resolveOriginGroup({ locator: 'https://yeniemlak.az' })).toBe('website');
  });
});
