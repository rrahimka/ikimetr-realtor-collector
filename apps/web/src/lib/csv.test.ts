import { describe, expect, it } from 'vitest';
import { contactsCsv, csvCell, parseContactsCsv, parseCsv } from './csv';

describe('csv', () => {
  it('escapes spreadsheet formula injection in csvCell', () => {
    expect(csvCell('=SUM(A1)')).toBe("\"'=SUM(A1)\"");
    expect(csvCell('+cmd')).toBe("\"'+cmd\"");
    expect(csvCell('-1')).toBe("\"'-1\"");
    expect(csvCell('@x')).toBe("\"'@x\"");
    expect(csvCell('plain')).toBe('"plain"');
  });

  it('exports UTF-8 BOM and quotes', () => {
    const csv = contactsCsv([{ name: '=A', normalizedPhone: '+994501234567' }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain("'=A");
  });

  it('exports one canonical row per phone with compatible policy fields', () => {
    const csv = contactsCsv([
      { normalizedPhone: '+994501234567', type: 'agent', confidence: 0.96, verificationStatus: 'verified', originGroups: ['website'] },
      { normalizedPhone: '+994501234567', type: 'agent', confidence: 0.96, verificationStatus: 'verified', originGroups: ['website', 'social'] },
    ]);
    const rows = parseCsv(csv.replace(/^\uFEFF/, ''));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(expect.arrayContaining(['professional_type', 'confidence', 'verification_status', 'origin_groups']));
    expect(rows[1]).toEqual(expect.arrayContaining(['REALTOR', '96', 'verified', 'website; social']));
  });

  it('parses quoted fields with commas and newlines', () => {
    const rows = parseCsv('a,b\n"x,y",z\n');
    expect(rows).toEqual([['a', 'b'], ['x,y', 'z']]);
  });

  it('parses contacts csv and normalises headers', () => {
    const { headers, rows } = parseContactsCsv('Phone,Name\n0501234567,A\n');
    expect(headers).toEqual(['phone', 'name']);
    expect(rows[0]).toEqual({ phone: '0501234567', name: 'A' });
  });
});
