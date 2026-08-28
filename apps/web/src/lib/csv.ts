export function csvCell(value: unknown): string {
  const v = value;
  if (v !== null && v !== undefined && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return '""';
  let text = String(v ?? '');  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
interface ContactCsvFields {
  name?: unknown;
  type?: unknown;
  originalPhone?: unknown;
  normalizedPhone?: unknown;
  agency?: unknown;
  username?: unknown;
  platform?: unknown;
  verificationStatus?: unknown;
  confidence?: unknown;
  originGroups?: unknown;
  firstSeenAt?: unknown;
  lastSeenAt?: unknown;
}

export function contactsCsv<T extends ContactCsvFields>(rows: T[]): string {
  const canonical = new Map<string, ContactCsvFields>();
  for (const row of rows) {
    const phone = typeof row.normalizedPhone === 'string' ? row.normalizedPhone : '';
    const previous = canonical.get(phone);
    if (!previous) {
      canonical.set(phone, row);
      continue;
    }
    const origins = new Set([
      ...(Array.isArray(previous.originGroups) ? previous.originGroups.filter((value): value is string => typeof value === 'string') : []),
      ...(Array.isArray(row.originGroups) ? row.originGroups.filter((value): value is string => typeof value === 'string') : []),
    ]);
    canonical.set(phone, { ...previous, ...row, originGroups: Array.from(origins) });
  }
  const columns: Array<[string, (row: ContactCsvFields) => unknown]> = [
    ['name', (row) => row.name],
    ['professional_type', (row) => row.type === 'agency' ? 'AGENCY' : row.type === 'agent' ? 'REALTOR' : 'UNKNOWN'],
    ['original_phone', (row) => row.originalPhone],
    ['normalized_phone', (row) => row.normalizedPhone],
    ['agency', (row) => row.agency],
    ['username', (row) => row.username],
    ['platform', (row) => row.platform],
    ['verification_status', (row) => row.verificationStatus],
    ['confidence', (row) => Math.round(Number(row.confidence ?? 0) * 100)],
    ['origin_groups', (row) => row.originGroups],
    ['first_seen_at', (row) => row.firstSeenAt],
    ['last_seen_at', (row) => row.lastSeenAt],
  ];
  return [
    `\uFEFF${columns.map(([header]) => csvCell(header)).join(',')}`,
    ...Array.from(canonical.values()).map((row) =>
      columns
        .map(([, value]) => {
          let val = value(row);
          if (Array.isArray(val)) val = val.join('; ');
          return csvCell(val);
        })
        .join(',')
    ),
  ].join('\r\n');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1]! === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip CR */ }
    else field += c;
  }
  row.push(field); rows.push(row);
  return rows.filter((r) => !(r.length === 1 && (r[0] ?? '').trim() === ''));
}

export function parseContactsCsv(text: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const grid = parseCsv(text.replace(/^\uFEFF/, ''));
  if (grid.length === 0) return { headers: [], rows: [] };
  const headers = grid[0]!.map((h) => h.trim().toLowerCase());
  const rows = grid.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] ?? '').trim(); });
    return obj;
  });
  return { headers, rows };
}

export const CONTACTS_CSV_TEMPLATE = ['phone,name,agency,username,platform,source_url,location_type,excerpt', '0501234567,Aysel Məmmədova,Bakı Emlak,,website,https://fixture.invalid/1,listing,"Bakı əmlakçı, mənzil satışı"'].join('\n');
