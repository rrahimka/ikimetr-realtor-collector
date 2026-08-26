import { NextResponse } from 'next/server';
import { getApifyStatus, type ApifyEnvironment } from '@ikimetr/connectors/apify';
import { requireApi, apiError } from '../../../lib/http';
export async function GET(){try{await requireApi();const env:ApifyEnvironment={};const keys=['APIFY_TOKEN','APIFY_MAX_RESULTS','APIFY_MONTHLY_BUDGET_USD','INSTAGRAM_ENABLED','TIKTOK_ENABLED','INSTAGRAM_ACTOR_ID','TIKTOK_ACTOR_ID','TIKTOK_COMMENTS_ACTOR_ID','GOOGLE_MAPS_ACTOR_ID']as const;for(const k of keys){const v=process.env[k];if(v!==undefined)env[k]=v;}return NextResponse.json({apify:getApifyStatus(env),instagramEnabled:process.env.INSTAGRAM_ENABLED==='true',tiktokEnabled:process.env.TIKTOK_ENABLED==='true',maxResults:Number(process.env.APIFY_MAX_RESULTS??100)});}catch(e){return apiError(e);}}
