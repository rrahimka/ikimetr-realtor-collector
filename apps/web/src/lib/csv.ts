export function csvCell(value: unknown): string {
  const v = value;
  if (v !== null && v !== undefined && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return '""';
  let text = String(v ?? '');  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function contactsCsv(rows: Array<Record<string, unknown>>): string {
  const keys = ['name', 'type', 'originalPhone', 'normalizedPhone', 'agency', 'username', 'platform', 'verificationStatus', 'confidence', 'firstSeenAt', 'lastSeenAt'];
  return [`\uFEFF${keys.map(csvCell).join(',')}`, ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(','))].join('\r\n');
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
