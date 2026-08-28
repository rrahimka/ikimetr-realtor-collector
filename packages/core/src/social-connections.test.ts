import { describe, expect, it } from 'vitest';
import {
  ALL_SEARCH_SURFACES,
  getMaxSafePresetSurfaces,
  getPlatformSupportedSurfaces,
  isRealtorGroupContext,
} from './social-connections';

describe('Social Connections & WhatsApp Models', () => {
  it('provides supported search surfaces for all platforms', () => {
    expect(getPlatformSupportedSurfaces('instagram')).toContain('name_username');
    expect(getPlatformSupportedSurfaces('instagram')).toContain('comments');
    expect(getPlatformSupportedSurfaces('instagram')).toContain('hashtags');

    expect(getPlatformSupportedSurfaces('tiktok')).toContain('posts_captions');
    expect(getPlatformSupportedSurfaces('tiktok')).toContain('comments');

    expect(getPlatformSupportedSurfaces('facebook')).toContain('bio_about');
    expect(getPlatformSupportedSurfaces('facebook')).toContain('comments');

    expect(getPlatformSupportedSurfaces('whatsapp')).toContain('comments');
    expect(getPlatformSupportedSurfaces('whatsapp')).not.toContain('hashtags');
  });

  it('provides safe presets for maximum safe search', () => {
    const igPresets = getMaxSafePresetSurfaces('instagram');
    expect(igPresets).toContain('name_username');
    expect(igPresets).toContain('bio_about');
    expect(igPresets).toContain('posts_captions');
    expect(igPresets).toContain('comments');
    expect(igPresets).toContain('hashtags');

    const ttPresets = getMaxSafePresetSurfaces('tiktok');
    expect(ttPresets).toContain('comments');
    expect(ttPresets).toContain('hashtags');

    const waPresets = getMaxSafePresetSurfaces('whatsapp');
    expect(waPresets).toContain('comments');
    expect(waPresets).not.toContain('hashtags');
  });

  it('identifies realtor-dedicated WhatsApp group contexts accurately', () => {
    // Strong matches
    expect(isRealtorGroupContext('Bakı Maklerlər Qrupu')).toBe(true);
    expect(isRealtorGroupContext('Əmlak Agentləri və Rieltorlar')).toBe(true);
    expect(isRealtorGroupContext('Baku Real Estate Agents Official')).toBe(true);
    expect(isRealtorGroupContext('Daşınmaz Əmlak Maklerləri')).toBe(true);

    // Generic chat or general buy/sell groups rejected
    expect(isRealtorGroupContext('Baku Chat & Sohbet')).toBe(false);
    expect(isRealtorGroupContext('Alqi Satqi Her Sey Avto Telefon')).toBe(false);
    expect(isRealtorGroupContext('Ucuzluq Elan Bazari')).toBe(false);
    expect(isRealtorGroupContext('Ailə Qrupu')).toBe(false);
  });

  it('lists all defined search surfaces with labels', () => {
    expect(ALL_SEARCH_SURFACES.length).toBeGreaterThanOrEqual(8);
    expect(ALL_SEARCH_SURFACES).toContainEqual(expect.objectContaining({ id: 'comments' }));
    expect(ALL_SEARCH_SURFACES).toContainEqual(expect.objectContaining({ id: 'name_username' }));
  });
});
