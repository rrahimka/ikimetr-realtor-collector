import { describe,expect,it,vi } from 'vitest';
import { createSessionToken,verifySessionToken,sessionCookieOptions } from './auth.js';
import { verifyCsrf } from './csrf.js';
import { createRateLimiter } from './rate-limit.js';
import { csvCell } from './csv.js';

describe('local API security',()=>{
  it('signs expiring session tokens and rejects tampering',()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-08-12T00:00:00Z'));const token=createSessionToken('secret-secret-secret-secret');expect(verifySessionToken(token,'secret-secret-secret-secret')).toBe(true);expect(verifySessionToken(`${token}x`,'secret-secret-secret-secret')).toBe(false);vi.advanceTimersByTime(86_400_001);expect(verifySessionToken(token,'secret-secret-secret-secret')).toBe(false);vi.useRealTimers();});
  it('requires secure session cookie settings',()=>{expect(sessionCookieOptions(false)).toMatchObject({httpOnly:true,sameSite:'lax',path:'/',secure:false});});
  it('requires equal CSRF header and cookie',()=>{expect(()=>verifyCsrf('a','b')).toThrow('CSRF');expect(()=>verifyCsrf('same','same')).not.toThrow();});
  it('limits requests inside a window',()=>{const limit=createRateLimiter({limit:2,windowMs:1000});expect(limit('local',0)).toBe(true);expect(limit('local',1)).toBe(true);expect(limit('local',2)).toBe(false);expect(limit('local',1001)).toBe(true);});
  it('neutralizes spreadsheet formulas in CSV exports',()=>{expect(csvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');expect(csvCell('hello, world')).toBe('"hello, world"');});
});
