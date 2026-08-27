import { NextResponse } from 'next/server';
import { getRepositories } from '../../../../lib/db';
import { generateLeadsXlsx, generateLeadsCsv } from '../../../../lib/export';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'xlsx';
    const leadType = searchParams.get('leadType') || undefined;
    const status = searchParams.get('status') || undefined;
    const confidenceLevel = searchParams.get('confidenceLevel') || undefined;
    const sourcePlatform = searchParams.get('sourcePlatform') || undefined;

    const repos = getRepositories();
    const leads = repos.leads.list({
      leadType,
      status,
      confidenceLevel,
      sourcePlatform,
    });

    if (format === 'csv') {
      const csv = generateLeadsCsv(leads);
      return new Response(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="leads.csv"',
        },
      });
    }

    // Default XLSX
    const buffer = await generateLeadsXlsx(leads);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="azerbaijan-real-estate-leads.xlsx"',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
