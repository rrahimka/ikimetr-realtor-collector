import { NextResponse } from 'next/server';import { getRepositories } from '../../../lib/db';import { requireApi,apiError } from '../../../lib/http';
export async function GET(request:Request){try{await requireApi();const q=new URL(request.url).searchParams.get('q')??'';return NextResponse.json(getRepositories().contacts.list(q));}catch(e){return apiError(e);}}
