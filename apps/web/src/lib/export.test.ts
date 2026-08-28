import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  generateContactsXlsx,
  generatePhonesTxt,
  generateWhatsAppLinksTxt,
  isEligibleProductionContact,
  isEligibleWhatsAppMobile,
  toWhatsAppDirectLink,
  type CanonicalContactExportRow,
} from './export';
import type { LeadRecord } from '@ikimetr/core';

describe('Permanent Export Center', () => {
  const sampleContacts: CanonicalContactExportRow[] = [
    {
      id: 1,
      normalizedPhone: '+994501234567',
      originalPhone: '050 123 45 67',
      isForeign: false,
      type: 'agency',
      name: 'Rəşad Əliyev',
      agency: 'EVA Group Əmlak Mərkəzi',
      city: 'Bakı',
      username: 'eva_group_baku',
      platform: 'instagram',
      confidence: 0.95,
      verificationStatus: 'verified',
      firstSeenAt: '2026-08-20T10:00:00Z',
      lastSeenAt: '2026-08-27T12:00:00Z',
    },
    {
      id: 2,
      normalizedPhone: '+994559876543',
      originalPhone: '055-987-65-43',
      isForeign: false,
      type: 'agent',
      name: 'Günel Məmmədova',
      agency: 'Quliyev Estates',
      city: 'Yasamal',
      username: 'gunel_realtor',
      platform: 'tiktok',
      confidence: 0.9,
      verificationStatus: 'unreviewed',
      firstSeenAt: '2026-08-21T10:00:00Z',
      lastSeenAt: '2026-08-27T12:00:00Z',
    },
    {
      id: 3,
      normalizedPhone: '+994124900000', // Fixed line office
      originalPhone: '012 490 00 00',
      isForeign: false,
      type: 'agency',
      name: 'Bina Agency Office',
      agency: 'Grand Real Estate',
      city: 'Bakı',
      platform: 'website',
      confidence: 0.85,
      verificationStatus: 'verified',
      firstSeenAt: '2026-08-15T10:00:00Z',
      lastSeenAt: '2026-08-27T12:00:00Z',
    },
    {
      id: 4,
      normalizedPhone: '+905321112233', // Foreign Turkey
      originalPhone: '+90 532 111 22 33',
      isForeign: true,
      type: 'agent',
      name: 'Istanbul Emlak',
      platform: 'instagram',
      confidence: 0.5,
      verificationStatus: 'rejected',
      firstSeenAt: '2026-08-20T10:00:00Z',
      lastSeenAt: '2026-08-20T10:00:00Z',
    },
    {
      id: 5,
      normalizedPhone: '+994509999999_fixture', // Fixture
      originalPhone: '050 999 99 99',
      isForeign: false,
      type: 'agent',
      name: 'Test Fixture Contact',
      platform: 'fixture',
      confidence: 0.9,
      verificationStatus: 'unreviewed',
      firstSeenAt: '2026-08-01T10:00:00Z',
      lastSeenAt: '2026-08-01T10:00:00Z',
    },
  ];

  const evidenceMap = {
    1: [
      { platform: 'instagram', sourceUrl: 'https://instagram.com/eva_group_baku', username: 'eva_group_baku' },
      { platform: 'telegram', sourceUrl: 'https://t.me/eva_group_official', username: 'eva_group_official' },
      { platform: 'bina.az', sourceUrl: 'https://bina.az/items/123' },
    ],
    2: [
      { platform: 'tiktok', sourceUrl: 'https://tiktok.com/@gunel_realtor', username: 'gunel_realtor' },
      { platform: 'facebook', sourceUrl: 'https://facebook.com/gunel.realtor', username: 'gunel.realtor' },
    ],
  };

  describe('1. Eligibility & Formatting Rules', () => {
    it('filters production vs foreign/fixture contacts', () => {
      expect(isEligibleProductionContact(sampleContacts[0]!)).toBe(true);
      expect(isEligibleProductionContact(sampleContacts[1]!)).toBe(true);
      expect(isEligibleProductionContact(sampleContacts[2]!)).toBe(true);
      expect(isEligibleProductionContact(sampleContacts[3]!)).toBe(false); // Foreign
      expect(isEligibleProductionContact(sampleContacts[4]!)).toBe(false); // Fixture
    });

    it('distinguishes mobile WhatsApp eligibility from fixed lines', () => {
      expect(isEligibleWhatsAppMobile('+994501234567')).toBe(true);
      expect(isEligibleWhatsAppMobile('+994559876543')).toBe(true);
      expect(isEligibleWhatsAppMobile('+994705556677')).toBe(true);
      expect(isEligibleWhatsAppMobile('+994124900000')).toBe(false); // Fixed line (012)
    });

    it('creates correct WhatsApp direct link format without +', () => {
      expect(toWhatsAppDirectLink('+994501234567')).toBe('https://wa.me/994501234567');
      expect(toWhatsAppDirectLink('+994559876543')).toBe('https://wa.me/994559876543');
    });
  });

  describe('2. XLSX Export', () => {
    it('generates valid XLSX with Unicode, proper headers, and text-formatted phones', async () => {
      const buffer = await generateContactsXlsx(sampleContacts, evidenceMap);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(new Uint8Array(buffer).buffer);
      const ws = wb.getWorksheet('Realtors');
      expect(ws).toBeDefined();

      // Header row
      expect(ws?.getRow(1).getCell(1).value).toBe('Phone');
      expect(ws?.getRow(1).getCell(3).value).toBe('Agency');
      expect(ws?.getRow(1).getCell(16).value).toBe('WhatsApp Direct Link');

      // Row count (1 header + 3 eligible contacts = 4 rows)
      expect(ws?.rowCount).toBe(4);

      // Data checks for Row 2 (EVA Group)
      const row2 = ws?.getRow(2);
      expect(row2?.getCell(1).value).toBe('+994501234567');
      expect(row2?.getCell(2).value).toBe('Rəşad Əliyev'); // Azerbaijani Unicode
      expect(row2?.getCell(3).value).toBe('EVA Group Əmlak Mərkəzi');
      expect(row2?.getCell(9).value).toBe('@eva_group_official');
      expect(row2?.getCell(10).value).toBe('@eva_group_baku');
      expect(row2?.getCell(16).value).toBe('https://wa.me/994501234567');

      // Fixed line office check (Row 4) - no WhatsApp URL
      const row4 = ws?.getRow(4);
      expect(row4?.getCell(1).value).toBe('+994124900000');
      expect(row4?.getCell(16).value || '').toBe('');
    });
  });

  describe('3. TXT Exports', () => {
    it('generates plain phone numbers TXT with one valid phone per line', () => {
      const txt = generatePhonesTxt(sampleContacts);
      const lines = txt.split('\n');
      expect(lines.length).toBe(3); // 3 eligible contacts
      expect(lines[0]).toBe('+994501234567');
      expect(lines[1]).toBe('+994559876543');
      expect(lines[2]).toBe('+994124900000');
      expect(txt).not.toContain('+90');
      expect(txt).not.toContain('fixture');
    });

    it('generates plain WhatsApp links TXT only for mobile numbers', () => {
      const txt = generateWhatsAppLinksTxt(sampleContacts);
      const lines = txt.split('\n');
      expect(lines.length).toBe(2); // 2 mobile contacts (fixed line 012 excluded)
      expect(lines[0]).toBe('https://wa.me/994501234567');
      expect(lines[1]).toBe('https://wa.me/994559876543');
    });
  });

  describe('4. Lead Intelligence Exports', () => {
    const sampleLeads: LeadRecord[] = [
      {
        id: 1,
        leadType: 'buyer',
        status: 'new',
        sourcePlatform: 'telegram',
        sourceSurface: 'message_text',
        sourceUrl: 'https://t.me/baku_emlak/101',
        username: 'buyer_almas',
        displayName: 'Almas',
        publicPhone: '050 222 33 44',
        normalizedPhone: '+994502223344',
        intentExcerpt: 'Yasamalda 3 otaqlı mənzil axtarıram',
        city: 'Bakı',
        district: 'Yasamal',
        metro: 'Elmlər Akademiyası',
        propertyType: 'apartment',
        rooms: 3,
        budgetMin: 180000,
        budgetMax: 220000,
        currency: 'AZN',
        confidence: 0.9,
        confidenceLevel: 'high',
        signals: ['buyer:axtariram'],
        isRealtorSender: false,
        firstSeenAt: '2026-08-27T10:00:00Z',
        lastSeenAt: '2026-08-27T10:00:00Z',
        expiresAt: '2026-09-27T10:00:00Z',
      },
      {
        id: 2,
        leadType: 'seller',
        status: 'qualified',
        sourcePlatform: 'telegram',
        sourceSurface: 'message_text',
        sourceUrl: 'https://t.me/baku_emlak/102',
        username: 'owner_vusal',
        displayName: 'Vüsal',
        publicPhone: '055 777 66 55',
        normalizedPhone: '+994557776655',
        intentExcerpt: 'Öz evimdir satıram, Nərimanovda 2 otaq',
        city: 'Bakı',
        district: 'Nərimanov',
        propertyType: 'apartment',
        rooms: 2,
        budgetMin: null,
        budgetMax: 150000,
        currency: 'AZN',
        confidence: 0.85,
        confidenceLevel: 'high',
        signals: ['seller:satiram'],
        isRealtorSender: false,
        firstSeenAt: '2026-08-27T11:00:00Z',
        lastSeenAt: '2026-08-27T11:00:00Z',
        expiresAt: '2026-09-27T11:00:00Z',
      },
    ];

    it('generates Lead XLSX workbook with preserved Unicode and structure', async () => {
      const { generateLeadsXlsx } = await import('./export');
      const buffer = await generateLeadsXlsx(sampleLeads);
      expect(buffer).toBeInstanceOf(Buffer);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(new Uint8Array(buffer).buffer);
      const ws = wb.getWorksheet('Leads');
      expect(ws).toBeDefined();
      expect(ws?.rowCount).toBe(3); // 1 header + 2 leads

      const row2 = ws?.getRow(2);
      expect(row2?.getCell(1).value).toBe('BUYER');
      expect(row2?.getCell(2).value).toBe('@buyer_almas');
      expect(row2?.getCell(3).value).toBe('+994502223344');
      expect(row2?.getCell(4).value).toBe('https://wa.me/994502223344');
      expect(row2?.getCell(8).value).toBe('Yasamal');
      expect(row2?.getCell(11).value).toBe(3);
    });

    it('generates Lead CSV with UTF-8 BOM and correct headers', async () => {
      const { generateLeadsCsv } = await import('./export');
      const csv = generateLeadsCsv(sampleLeads);
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toContain('"buyer"');
      expect(csv).toContain('"buyer_almas"');
      expect(csv).toContain('"seller"');
      expect(csv).toContain('"owner_vusal"');
      expect(csv).toContain('https://wa.me/994502223344');
    });
  });
});
