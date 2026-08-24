import { NextResponse } from 'next/server';
import { CONTACTS_CSV_TEMPLATE } from '../../../../lib/csv';
import { importContactsCsv } from '../../../../lib/csv-import';
import { getRepositories } from '../../../../lib/db';
import { requireApi, apiError } from '../../../../lib/http';

const MAX_BYTES = 5_000_000;

export async function GET() {
  try {
    await requireApi();
    return new Response(CONTACTS_CSV_TEMPLATE, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="template.csv"' } });
  } catch (e) { return apiError(e); }
}

export async function POST(request: Request) {
  try {
    await requireApi(true);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Error('CSV file is required');
    if (file.size > MAX_BYTES) throw new Error('CSV file must be under 5 MB');
    const report = importContactsCsv(getRepositories(), await file.text(), `Contacts CSV ${new Date().toISOString()}`);
    return NextResponse.json(report);
  } catch (e) { return apiError(e); }
}
