import { NextResponse } from 'next/server';import { sourceSchema } from '@ikimetr/core';import { getRepositories } from '../../../lib/db';import { requireApi,apiError } from '../../../lib/http';
export async function GET(){try{await requireApi();return NextResponse.json(getRepositories().sources.list());}catch(e){return apiError(e);}}
export async function POST(request:Request){try{await requireApi(true);const input=sourceSchema.parse(await request.json());return NextResponse.json(getRepositories().sources.create(input),{status:201});}catch(e){return apiError(e);}}
