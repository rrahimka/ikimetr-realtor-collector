import { describe, it, expect } from 'vitest';
import { scanResultToConnectorResult } from './telegram-mtproto-connector';
import type { TelegramAuthorizedScanResult } from './telegram-authorized';

describe('telegram-mtproto-connector', () => {
  describe('scanResultToConnectorResult', () => {
    it('converts scan results with realtor evidence to ConnectorResult', () => {
      const scanResult: TelegramAuthorizedScanResult = {
        scannedCount: 5,
        realtorEvidence: [
          {
            sourceUrl: 'https://t.me/c/12345/100',
            locationType: 'comment',
            excerpt: 'Makler ilə əlaqə: 050 123 45 67',
            rawPhone: '050 123 45 67',
            platform: 'telegram',
            fingerprint: 'tg-auth:12345:100:0501234567',
            username: 'test_realtor',
            explicitSellerType: 'agency',
          },
        ],
        leadCandidates: [],
        skippedPrivateDmCount: 0,
        skippedUnrelatedCount: 2,
        aggregatedGroupMessages: 3,
      };

      const result = scanResultToConnectorResult(scanResult);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.sourceUrl).toBe('https://t.me/c/12345/100');
      expect(result.items[0]!.platform).toBe('telegram');
      expect(result.items[0]!.fingerprint).toBe('tg-auth:12345:100:0501234567');
      expect(result.pagesChecked).toBe(1);
      expect(result.estimatedItems).toBe(1);
    });

    it('returns empty items when no realtor evidence found', () => {
      const scanResult: TelegramAuthorizedScanResult = {
        scannedCount: 10,
        realtorEvidence: [],
        leadCandidates: [],
        skippedPrivateDmCount: 0,
        skippedUnrelatedCount: 8,
        aggregatedGroupMessages: 2,
      };

      const result = scanResultToConnectorResult(scanResult);
      expect(result.items).toHaveLength(0);
      expect(result.pagesChecked).toBe(1);
      expect(result.estimatedItems).toBe(0);
    });
  });

  describe('scanResultToConnectorResult lead carrying', () => {
    it('carries client leads onto the ConnectorResult instead of dropping them', () => {
      const scanResult: TelegramAuthorizedScanResult = {
        scannedCount: 2,
        realtorEvidence: [],
        leadCandidates: [
          {
            leadType: 'buyer',
            status: 'new',
            sourcePlatform: 'telegram',
            sourceSurface: 'message_text',
            sourceUrl: 'https://t.me/c/12345/101',
            externalId: '101',
            intentExcerpt: 'Kirayə ev axtarıram',
            confidence: 0.6,
            confidenceLevel: 'medium',
            signals: ['rent_intent'],
          },
          {
            leadType: 'seller',
            status: 'new',
            sourcePlatform: 'telegram',
            sourceSurface: 'message_text',
            sourceUrl: 'https://t.me/c/12345/102',
            externalId: '102',
            intentExcerpt: 'Evimi satıram',
            confidence: 0.7,
            confidenceLevel: 'medium',
            signals: ['sale_intent'],
          },
        ],
        skippedPrivateDmCount: 0,
        skippedUnrelatedCount: 0,
        aggregatedGroupMessages: 2,
      };

      const result = scanResultToConnectorResult(scanResult);
      expect(result.leads).toHaveLength(2);
      expect(result.leads!.map((l) => l.leadType)).toEqual(['buyer', 'seller']);
      expect(result.leads![0]!.sourcePlatform).toBe('telegram');
    });
  });

  describe('fetchTelegramAuthorizedMessages validation', () => {
    it('rejects a positive chatId (private DM peer)', async () => {
      const { fetchTelegramAuthorizedMessages } = await import('./telegram-mtproto-connector');
      await expect(
        fetchTelegramAuthorizedMessages({} as never, { chatId: 12345 }),
      ).rejects.toThrow('telegram_private_chat_rejected');
    });

    it('rejects zero and non-numeric chatIds', async () => {
      const { fetchTelegramAuthorizedMessages } = await import('./telegram-mtproto-connector');
      await expect(
        fetchTelegramAuthorizedMessages({} as never, { chatId: 0 }),
      ).rejects.toThrow('telegram_private_chat_rejected');
      await expect(
        fetchTelegramAuthorizedMessages({} as never, { chatId: Number.NaN }),
      ).rejects.toThrow('telegram_private_chat_rejected');
    });
  });
});
