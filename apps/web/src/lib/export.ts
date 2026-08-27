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
