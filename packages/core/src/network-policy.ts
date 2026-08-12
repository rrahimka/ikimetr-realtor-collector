import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export class NetworkPolicyError extends Error { override name = 'NetworkPolicyError' }
export type AddressResolver = (hostname: string) => Promise<string[]>;
const defaultResolver: AddressResolver = async (hostname) => (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);

function isBlocked(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try { parsed = ipaddr.parse(address); } catch { return true; }
  if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) parsed = parsed.toIPv4Address();
  return parsed.range() !== 'unicast';
}

export async function assertSafeUrl(input: string | URL, resolver: AddressResolver = defaultResolver): Promise<URL> {
  let url: URL;
  try { url = new URL(input); } catch { throw new NetworkPolicyError('invalid URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new NetworkPolicyError('only HTTP(S) URLs are allowed');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) throw new NetworkPolicyError('localhost is blocked');
  const addresses = ipaddr.isValid(hostname) ? [hostname] : await resolver(hostname);
  if (addresses.length === 0) throw new NetworkPolicyError('DNS returned no addresses');
  if (addresses.some(isBlocked)) throw new NetworkPolicyError('target resolves to a blocked IP');
  url.username = ''; url.password = '';
  return url;
}
