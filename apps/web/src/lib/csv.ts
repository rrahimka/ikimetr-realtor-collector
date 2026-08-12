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
