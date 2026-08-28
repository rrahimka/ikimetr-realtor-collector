import { describe, expect, it } from 'vitest';
import {
  getConnectionsStore,
  updateAccountConnection,
  updateAccountSearchConfig,
  updateWhatsAppGroupConsent,
} from './connections-store';

describe('Connections Store', () => {
  it('loads default connections state with social networks and WhatsApp groups', () => {
    const store = getConnectionsStore();
    expect(store.accounts.instagram).toBeDefined();
    expect(store.accounts.tiktok).toBeDefined();
    expect(store.accounts.facebook).toBeDefined();
    expect(store.accounts.whatsapp).toBeDefined();
    expect(store.whatsappGroups.length).toBeGreaterThanOrEqual(3);
  });

  it('updates social account connection state and disconnects cleanly', () => {
    const connected = updateAccountConnection('tiktok', {
      status: 'connected',
      accountHandle: '@baku_realtor_tiktok',
    });
    expect(connected.status).toBe('connected');
    expect(connected.accountHandle).toBe('@baku_realtor_tiktok');

    const disconnected = updateAccountConnection('tiktok', {
      status: 'disconnected',
      accountHandle: undefined,
    });
    expect(disconnected.status).toBe('disconnected');
    expect(disconnected.accountHandle).toBeUndefined();
  });

  it('updates search configuration surfaces and purpose', () => {
    const updated = updateAccountSearchConfig(
      'instagram',
      ['name_username', 'bio_about', 'comments'],
      'leads',
      false
    );
    expect(updated.enabledSurfaces).toEqual(['name_username', 'bio_about', 'comments']);
    expect(updated.purpose).toBe('leads');
    expect(updated.maxSafePreset).toBe(false);
  });

  it('updates WhatsApp group consent and realtor-only mode', () => {
    const group = updateWhatsAppGroupConsent('wa-group-003', true, false, 'both');
    expect(group).toBeDefined();
    expect(group?.authorized).toBe(true);
    expect(group?.authorizedAt).toBeDefined();

    const revoked = updateWhatsAppGroupConsent('wa-group-003', false);
    expect(revoked?.authorized).toBe(false);
    expect(revoked?.authorizedAt).toBeUndefined();
  });
});
