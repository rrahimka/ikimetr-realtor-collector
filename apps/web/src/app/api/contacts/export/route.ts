import { NextRequest } from 'next/server';
import {
  contactsCsv,
  generateContactsXlsx,
  generatePhonesTxt,
  generateWhatsAppLinksTxt,
} from '../../../../lib/export';
import { getDb, getRepositories } from '../../../../lib/db';
import { requireApi, apiError } from '../../../../lib/http';

import type { OriginGroup } from '@ikimetr/core';

export async function GET(request: NextRequest) {
  try {
    await requireApi();
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';
    const origin = searchParams.get('origin');
    const status = searchParams.get('status');

    const originFilter: OriginGroup | undefined = origin === 'website' || origin === 'social' || origin === 'whatsapp' ? origin : undefined;
    const repos = getRepositories();
    const contacts = repos.contacts.list('', {
      origin: originFilter,
      verificationStatus: status || undefined,
    });
    const db = getDb();

    if (format === 'xlsx') {
      const allEvidence = db.prepare('SELECT contact_id, platform, source_url, raw_phone, excerpt FROM evidence').all() as Array<{
        contact_id: number;
        platform: string;
        source_url: string;
        raw_phone: string;
        excerpt: string;
      }>;

      const evidenceByContactId: Record<number, Array<{ platform: string; sourceUrl: string; username?: string | null }>> = {};
      for (const ev of allEvidence) {
        if (!evidenceByContactId[ev.contact_id]) {
          evidenceByContactId[ev.contact_id] = [];
        }
        let username: string | null = null;
        try {
          const u = new URL(ev.source_url);
          username = u.pathname.replace(/^\/|\/$/g, '').split('/')[0] || null;
        } catch {
          // ignore
        }
        evidenceByContactId[ev.contact_id]!.push({
          platform: ev.platform,
          sourceUrl: ev.source_url,
          username,
        });
      }

      const buffer = await generateContactsXlsx(contacts, evidenceByContactId);
      return new Response(new Uint8Array(buffer), {
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': 'attachment; filename="azerbaijan-realtors.xlsx"',
        },
      });
    }

    if (format === 'phones') {
      const txt = generatePhonesTxt(contacts);
      return new Response(txt, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'content-disposition': 'attachment; filename="phones.txt"',
        },
      });
    }

    if (format === 'whatsapp') {
      const txt = generateWhatsAppLinksTxt(contacts);
      return new Response(txt, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'content-disposition': 'attachment; filename="whatsapp-links.txt"',
        },
      });
    }

    // Default: CSV
    return new Response(contactsCsv(contacts), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="contacts.csv"',
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
