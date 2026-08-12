import { normalizePhone } from '@ikimetr/core';
import { parse } from 'csv-parse/sync';

export interface GoogleMapsRow { name:string; category:string; rawPhone:string; normalizedPhone:string; website:string; address:string; sourceUrl:string }
export function parseGoogleMapsCsv(csv:string):GoogleMapsRow[]{const rows=parse(csv,{columns:true,skip_empty_lines:true,trim:true}) as Array<Record<string,string>>;const seen=new Set<string>();const output:GoogleMapsRow[]=[];for(const row of rows){const raw=row.phone??row.telephone??'';const phone=normalizePhone(raw);if(!phone.isValid||!phone.normalized||seen.has(phone.normalized))continue;seen.add(phone.normalized);output.push({name:row.title??row.name??'',category:row.category??'',rawPhone:raw,normalizedPhone:phone.normalized,website:row.website??'',address:row.address??'',sourceUrl:row.link??row.google_maps_url??''});}return output;}
