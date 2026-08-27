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
