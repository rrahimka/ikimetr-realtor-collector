import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSessionToken,sessionCookieOptions } from '../../../lib/auth';
import { createCsrfToken } from '../../../lib/csrf';

export async function POST(request:Request){const body=z.object({password:z.string().min(1)}).safeParse(await request.json().catch(()=>null));const expected=process.env.LOCAL_AUTH_PASSWORD??'';if(!body.success||!expected)return NextResponse.json({error:'Invalid credentials'},{status:401});const a=Buffer.from(body.data.password),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:'Invalid credentials'},{status:401});const response=NextResponse.json({ok:true});response.cookies.set('collector_session',createSessionToken(process.env.SESSION_SECRET??''),sessionCookieOptions(false));response.cookies.set('csrf_token',createCsrfToken(),{httpOnly:false,sameSite:'strict',path:'/',secure:false,maxAge:86400});return response;}
