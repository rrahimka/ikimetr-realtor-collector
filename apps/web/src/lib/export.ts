import ExcelJS from 'exceljs';
import { isAzerbaijanMobileNumber } from '@ikimetr/core';
import { contactsCsv } from './csv';

export interface CanonicalContactExportRow {
  id: number;
  normalizedPhone: string;
  originalPhone: string;
  isForeign: boolean;
  type: string;
  name?: string | null;
  agency?: string | null;
  city?: string | null;
  username?: string | null;
  platform?: string | null;
  confidence: number;
  verificationStatus: string;
  firstSeenAt: string;
  lastSeenAt: string;
  sources?: string[];
  evidenceCount?: number;
}

export function isEligibleProductionContact(contact: { normalizedPhone: string; isForeign?: boolean }): boolean {
  if (contact.isForeign) return false;
  if (!contact.normalizedPhone.startsWith('+994')) return false;
  if (contact.normalizedPhone.includes('fixture') || contact.normalizedPhone.includes('invalid')) return false;
  return true;
}

export function isEligibleWhatsAppMobile(phone: string): boolean {
  return isAzerbaijanMobileNumber(phone);
}

export function toWhatsAppDirectLink(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

/**
 * Generates XLSX Buffer for all eligible canonical contacts.
 */
export async function generateContactsXlsx(
  contacts: CanonicalContactExportRow[],
  evidenceByContactId?: Record<number, Array<{ platform: string; sourceUrl: string; username?: string | null }>>
): Promise<Buffer> {
  const eligible = contacts.filter(isEligibleProductionContact);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'İkimetr Realtor Collector';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Realtors', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.columns = [
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Agency', key: 'agency', width: 25 },
    { header: 'City', key: 'city', width: 15 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Platforms', key: 'platforms', width: 25 },
    { header: 'Telegram', key: 'telegram', width: 20 },
    { header: 'Instagram', key: 'instagram', width: 20 },
    { header: 'TikTok', key: 'tiktok', width: 20 },
    { header: 'Facebook', key: 'facebook', width: 20 },
    { header: 'Website Sources', key: 'website', width: 25 },
    { header: 'Evidence Count', key: 'evidenceCount', width: 15 },
    { header: 'WhatsApp Direct Link', key: 'whatsappUrl', width: 35 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'First Seen', key: 'firstSeen', width: 22 },
    { header: 'Last Seen', key: 'lastSeen', width: 22 },
  ];

  // Header style
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F2937' },
  };

  for (const c of eligible) {
    const evList = evidenceByContactId ? (evidenceByContactId[c.id] || []) : [];
    const platforms = Array.from(new Set([c.platform, ...evList.map(e => e.platform)].filter(Boolean))) as string[];

    const tgUser = evList.find(e => e.platform === 'telegram')?.username || (c.platform === 'telegram' ? c.username : '');
    const igUser = evList.find(e => e.platform === 'instagram')?.username || (c.platform === 'instagram' ? c.username : '');
    const tkUser = evList.find(e => e.platform === 'tiktok')?.username || (c.platform === 'tiktok' ? c.username : '');
    const fbUser = evList.find(e => e.platform === 'facebook')?.username || (c.platform === 'facebook' ? c.username : '');
    const webSources = evList.filter(e => !['telegram', 'instagram', 'tiktok', 'facebook'].includes(e.platform)).map(e => e.platform).join(', ');

    const isMobile = isEligibleWhatsAppMobile(c.normalizedPhone);
    const whatsappUrl = isMobile ? toWhatsAppDirectLink(c.normalizedPhone) : '';

    const row = worksheet.addRow({
      phone: c.normalizedPhone,
      name: c.name || '',
      agency: c.agency || '',
      city: c.city || 'Bakı',
      type: c.type,
      platforms: platforms.join(', '),
      telegram: tgUser ? `@${tgUser.replace(/^@/, '')}` : '',
      instagram: igUser ? `@${igUser.replace(/^@/, '')}` : '',
      tiktok: tkUser ? `@${tkUser.replace(/^@/, '')}` : '',
      facebook: fbUser ? fbUser : '',
      website: webSources,
      evidenceCount: evList.length || c.evidenceCount || 1,
      whatsappUrl,
      status: c.verificationStatus,
      firstSeen: c.firstSeenAt,
      lastSeen: c.lastSeenAt,
    });

    // Format phone cell as text explicitly
    row.getCell('phone').numFmt = '@';
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generates plain TXT list of normalized phone numbers (one per line).
 */
export function generatePhonesTxt(contacts: CanonicalContactExportRow[]): string {
  const eligible = contacts.filter(isEligibleProductionContact);
  const uniquePhones = Array.from(new Set(eligible.map(c => c.normalizedPhone)));
  return uniquePhones.join('\n');
}

/**
 * Generates plain TXT list of direct WhatsApp links (one per line).
 */
export function generateWhatsAppLinksTxt(contacts: CanonicalContactExportRow[]): string {
  const eligible = contacts.filter(c => isEligibleProductionContact(c) && isEligibleWhatsAppMobile(c.normalizedPhone));
  const uniqueLinks = Array.from(new Set(eligible.map(c => toWhatsAppDirectLink(c.normalizedPhone))));
  return uniqueLinks.join('\n');
}

export { contactsCsv };

import type { LeadRecord } from '@ikimetr/core';

/**
 * Generates XLSX Buffer for Lead Records.
 */
export async function generateLeadsXlsx(leads: LeadRecord[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'İkimetr Lead Intelligence';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Leads', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.columns = [
    { header: 'Intent', key: 'intent', width: 18 },
    { header: 'Username / Name', key: 'name', width: 22 },
    { header: 'Public Phone', key: 'phone', width: 18 },
    { header: 'WhatsApp Link', key: 'whatsappUrl', width: 32 },
    { header: 'Platform', key: 'platform', width: 14 },
    { header: 'Surface', key: 'surface', width: 18 },
    { header: 'City', key: 'city', width: 12 },
    { header: 'District', key: 'district', width: 16 },
    { header: 'Metro', key: 'metro', width: 16 },
    { header: 'Property Type', key: 'propertyType', width: 16 },
    { header: 'Rooms', key: 'rooms', width: 10 },
    { header: 'Budget Min', key: 'budgetMin', width: 14 },
    { header: 'Budget Max', key: 'budgetMax', width: 14 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Confidence', key: 'confidence', width: 16 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Intent Excerpt', key: 'excerpt', width: 45 },
    { header: 'Source URL', key: 'sourceUrl', width: 35 },
    { header: 'First Seen', key: 'firstSeen', width: 22 },
    { header: 'Last Seen', key: 'lastSeen', width: 22 },
    { header: 'Expires At', key: 'expiresAt', width: 22 },
  ];

  // Header style
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A8A' },
  };

  for (const l of leads) {
    const hasMobile = l.normalizedPhone ? isEligibleWhatsAppMobile(l.normalizedPhone) : false;
    const whatsappUrl = hasMobile && l.normalizedPhone ? toWhatsAppDirectLink(l.normalizedPhone) : '';

    const row = worksheet.addRow({
      intent: l.leadType.toUpperCase(),
      name: l.username ? `@${l.username.replace(/^@/, '')}` : (l.displayName || ''),
      phone: l.normalizedPhone || l.publicPhone || '',
      whatsappUrl,
      platform: l.sourcePlatform,
      surface: l.sourceSurface,
      city: l.city || 'Bakı',
      district: l.district || '',
      metro: l.metro || '',
      propertyType: l.propertyType || '',
      rooms: l.rooms ?? '',
      budgetMin: l.budgetMin ?? '',
      budgetMax: l.budgetMax ?? '',
      currency: l.currency,
      confidence: `${l.confidenceLevel.toUpperCase()} (${(l.confidence * 100).toFixed(0)}%)`,
      status: l.status,
      excerpt: l.intentExcerpt,
      sourceUrl: l.sourceUrl,
      firstSeen: l.firstSeenAt,
      lastSeen: l.lastSeenAt,
      expiresAt: l.expiresAt,
    });

    if (l.normalizedPhone) {
      row.getCell('phone').numFmt = '@';
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generates CSV string for Lead Records.
 */
export function generateLeadsCsv(leads: LeadRecord[]): string {
  const headers = [
    'intent',
    'username',
    'display_name',
    'public_phone',
    'normalized_phone',
    'whatsapp_url',
    'platform',
    'surface',
    'city',
    'district',
    'metro',
    'property_type',
    'rooms',
    'budget_min',
    'budget_max',
    'currency',
    'confidence_level',
    'confidence_score',
    'status',
    'intent_excerpt',
    'source_url',
    'first_seen_at',
    'last_seen_at',
    'expires_at',
  ];

  const escapeCsv = (val: string | number | boolean | null | undefined) => {
    if (val === null || val === undefined) return '""';
    const s = typeof val === 'string' ? val : String(val);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const rows = leads.map((l) => {
    const hasMobile = l.normalizedPhone ? isEligibleWhatsAppMobile(l.normalizedPhone) : false;
    const whatsappUrl = hasMobile && l.normalizedPhone ? toWhatsAppDirectLink(l.normalizedPhone) : '';

    return [
      escapeCsv(l.leadType),
      escapeCsv(l.username),
      escapeCsv(l.displayName),
      escapeCsv(l.publicPhone),
      escapeCsv(l.normalizedPhone),
      escapeCsv(whatsappUrl),
      escapeCsv(l.sourcePlatform),
      escapeCsv(l.sourceSurface),
      escapeCsv(l.city || 'Bakı'),
      escapeCsv(l.district),
      escapeCsv(l.metro),
      escapeCsv(l.propertyType),
      escapeCsv(l.rooms),
      escapeCsv(l.budgetMin),
      escapeCsv(l.budgetMax),
      escapeCsv(l.currency),
      escapeCsv(l.confidenceLevel),
      escapeCsv(l.confidence),
      escapeCsv(l.status),
      escapeCsv(l.intentExcerpt),
      escapeCsv(l.sourceUrl),
      escapeCsv(l.firstSeenAt),
      escapeCsv(l.lastSeenAt),
      escapeCsv(l.expiresAt),
    ].join(',');
  });

  return '\uFEFF' + [headers.join(','), ...rows].join('\n');
}
