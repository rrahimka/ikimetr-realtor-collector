export type BinaStopRequest = 'cancelled' | 'kill_switch' | false;

export interface ConnectorEvidence {
  sourceUrl: string;
  locationType: 'profile' | 'listing' | 'post' | 'comment';
  excerpt: string;
  rawPhone: string;
  name?: string;
  agency?: string;
  city?: string;
  username?: string;
  platform: string;
  fingerprint: string;
  explicitSellerType?: 'agency' | 'agent' | 'owner' | 'unknown';
}

export interface ConnectorResult {
  items: ConnectorEvidence[];
  pagesChecked: number;
  estimatedItems: number;
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
