import type { LeadInput } from '@ikimetr/core';

export type BinaStopRequest = 'cancelled' | 'kill_switch' | false;

export interface ConnectorEvidence {
  sourceUrl: string;
  locationType: 'profile' | 'listing' | 'post' | 'comment';
  excerpt: string;
  rawPhone: string;
  name?: string | undefined;
  agency?: string | undefined;
  city?: string | undefined;
  username?: string | undefined;
  platform: string;
  fingerprint: string;
  explicitSellerType?: 'agency' | 'agent' | 'owner' | 'unknown' | undefined;
  whatsappContext?: { approved: boolean; realtorOnly: boolean } | undefined;
}

export interface ConnectorResult {
  items: ConnectorEvidence[];
  pagesChecked: number;
  estimatedItems: number;
  /**
   * Client leads (buyer/seller/realtor_request) discovered by a social or
   * authorized connector. Optional so website connectors are unaffected.
   */
  leads?: LeadInput[] | undefined;
  /**
   * Connector-reported checkpoint id (for Telegram: highest processed message
   * id). The worker only advances the persisted checkpoint when persistence of
   * the run has succeeded.
   */
  checkpointId?: string | undefined;
}

export interface CrawlOptions {
  startUrl: string;
  maxPages: number;
  maxDepth: number;
  delayMs: number;
  maxBytes?: number;
  timeoutMs?: number;
  shouldStop?: () => BinaStopRequest | Promise<BinaStopRequest>;
  shouldProcessUrl?: (url: string) => boolean | Promise<boolean>;
}
