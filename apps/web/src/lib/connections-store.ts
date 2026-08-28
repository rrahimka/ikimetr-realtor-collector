import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  type SocialAccountConnection,
  type SocialPlatform,
  type WhatsAppGroupData,
  type SearchSurfaceMode,
  type SearchPurpose,
  getMaxSafePresetSurfaces,
} from '@ikimetr/core';

export interface ConnectionsState {
  accounts: Record<SocialPlatform, SocialAccountConnection>;
  whatsappGroups: WhatsAppGroupData[];
}

const DEFAULT_STATE: ConnectionsState = {
  accounts: {
    instagram: {
      platform: 'instagram',
      status: 'connected',
      accountHandle: '@baku_realtor_pilot',
      accountName: 'Baku Real Estate Pilot',
      enabledSurfaces: getMaxSafePresetSurfaces('instagram'),
      purpose: 'both',
      maxSafePreset: true,
      connectedAt: '2026-08-28T00:00:00Z',
    },
    tiktok: {
      platform: 'tiktok',
      status: 'disconnected',
      enabledSurfaces: getMaxSafePresetSurfaces('tiktok'),
      purpose: 'both',
      maxSafePreset: true,
    },
    facebook: {
      platform: 'facebook',
      status: 'disconnected',
      enabledSurfaces: getMaxSafePresetSurfaces('facebook'),
      purpose: 'both',
      maxSafePreset: true,
    },
    whatsapp: {
      platform: 'whatsapp',
      status: 'connected',
      accountHandle: '+994 50 123 45 67',
      accountName: 'Collector Agent',
      enabledSurfaces: getMaxSafePresetSurfaces('whatsapp'),
      purpose: 'both',
      maxSafePreset: true,
      connectedAt: '2026-08-28T00:00:00Z',
    },
  },
  whatsappGroups: [
    {
      id: 'wa-group-001',
      name: 'Bakı Maklerlər və Əmlak Agentləri',
      description: 'Rieltorların daxili peşəkar elanlar qrupu',
      participantCount: 148,
      lastActivity: '2026-08-28T03:00:00Z',
      status: 'active',
      authorized: true,
      authorizedAt: '2026-08-28T00:00:00Z',
      isRealtorOnlyGroup: true,
      searchMode: 'both',
    },
    {
      id: 'wa-group-002',
      name: 'Bina Alqı-Satqı & Kirayə Elanları',
      description: 'Mənzillər və müştəri sorğuları',
      participantCount: 92,
      lastActivity: '2026-08-28T02:15:00Z',
      status: 'active',
      authorized: true,
      authorizedAt: '2026-08-28T00:00:00Z',
      isRealtorOnlyGroup: false,
      searchMode: 'both',
    },
    {
      id: 'wa-group-003',
      name: 'Ailə və Dostlar Çatı',
      description: 'Şəxsi qrup',
      participantCount: 14,
      lastActivity: '2026-08-27T20:00:00Z',
      status: 'inactive',
      authorized: false,
      isRealtorOnlyGroup: false,
      searchMode: 'both',
    },
  ],
};

const STORE_PATH = resolve(process.cwd(), 'data/connections.json');

export function getConnectionsStore(): ConnectionsState {
  try {
    if (existsSync(STORE_PATH)) {
      const raw = readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as ConnectionsState;
      return {
        accounts: { ...DEFAULT_STATE.accounts, ...parsed.accounts },
        whatsappGroups: parsed.whatsappGroups || DEFAULT_STATE.whatsappGroups,
      };
    }
  } catch {
    // Fall back to default
  }
  return DEFAULT_STATE;
}

export function saveConnectionsStore(state: ConnectionsState): void {
  try {
    mkdirSync(dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

export function updateAccountConnection(
  platform: SocialPlatform,
  updates: Partial<SocialAccountConnection>
): SocialAccountConnection {
  const state = getConnectionsStore();
  const existing = state.accounts[platform] || {
    platform,
    status: 'disconnected',
    enabledSurfaces: getMaxSafePresetSurfaces(platform),
    purpose: 'both',
    maxSafePreset: true,
  };

  const updated: SocialAccountConnection = {
    ...existing,
    ...updates,
  };

  state.accounts[platform] = updated;
  saveConnectionsStore(state);
  return updated;
}

export function updateAccountSearchConfig(
  platform: SocialPlatform,
  enabledSurfaces: SearchSurfaceMode[],
  purpose: SearchPurpose,
  maxSafePreset = false
): SocialAccountConnection {
  const state = getConnectionsStore();
  const existing = state.accounts[platform];
  if (!existing) throw new Error(`Platform ${platform} not found`);

  existing.enabledSurfaces = enabledSurfaces;
  existing.purpose = purpose;
  existing.maxSafePreset = maxSafePreset;

  saveConnectionsStore(state);
  return existing;
}

export function updateWhatsAppGroupConsent(
  groupId: string,
  authorized: boolean,
  isRealtorOnlyGroup?: boolean,
  searchMode?: SearchPurpose
): WhatsAppGroupData | undefined {
  const state = getConnectionsStore();
  const group = state.whatsappGroups.find((g) => g.id === groupId);
  if (!group) return undefined;

  group.authorized = authorized;
  if (authorized && !group.authorizedAt) {
    group.authorizedAt = new Date().toISOString();
  } else if (!authorized) {
    group.authorizedAt = undefined;
  }

  if (typeof isRealtorOnlyGroup === 'boolean') {
    group.isRealtorOnlyGroup = isRealtorOnlyGroup;
  }
  if (searchMode) {
    group.searchMode = searchMode;
  }

  saveConnectionsStore(state);
  return group;
}
