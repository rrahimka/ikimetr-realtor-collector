import { NextResponse } from 'next/server';import { getRepositories } from '../../../../lib/db';import { requireApi,apiError } from '../../../../lib/http';
type C={params:Promise<{id:string}>};
export async function GET(_request:Request,{params}:C){try{await requireApi();const{id}=await params;const contact=getRepositories().contacts.get(Number(id));if(!contact)throw new Error('contact not found');const evidence=getRepositories().contacts.evidenceFor(contact.normalizedPhone);return NextResponse.json({contact,evidence});}catch(e){return apiError(e);}}
