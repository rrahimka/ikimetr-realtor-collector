import { NextResponse } from 'next/server';import { requireApi,apiError } from '../../../lib/http';
export async function POST(){try{await requireApi(true);const r=NextResponse.json({ok:true});r.cookies.delete('collector_session');r.cookies.delete('csrf_token');return r;}catch(e){return apiError(e);}}
