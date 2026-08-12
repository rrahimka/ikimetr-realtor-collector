export interface ConnectorEvidence { sourceUrl: string; locationType: 'profile'|'listing'|'post'|'comment'; excerpt: string; rawPhone: string; name?: string; agency?: string; username?: string; platform: string; fingerprint: string }
export interface ConnectorResult { items: ConnectorEvidence[]; pagesChecked: number; estimatedItems: number }
export interface CrawlOptions { startUrl: string; maxPages: number; maxDepth: number; delayMs: number; maxBytes?: number; timeoutMs?: number }
