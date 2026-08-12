import { randomBytes,timingSafeEqual } from 'node:crypto';
export const createCsrfToken=()=>randomBytes(24).toString('base64url');
export function verifyCsrf(cookie:string|undefined,header:string|undefined):void{if(!cookie||!header){throw new Error('CSRF token missing');}const a=Buffer.from(cookie);const b=Buffer.from(header);if(a.length!==b.length||!timingSafeEqual(a,b))throw new Error('CSRF token mismatch');}
