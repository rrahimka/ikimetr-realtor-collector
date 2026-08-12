import { describe, expect, it } from 'vitest';
import { NetworkPolicyError, assertSafeUrl } from './network-policy.js';

describe('assertSafeUrl', () => {
  it.each([
    'file:///etc/passwd',
    'ftp://example.com/file',
    'http://localhost/path',
    'http://127.0.0.1/path',
    'http://[::1]/path',
    'http://169.254.169.254/latest/meta-data',
  ])('blocks unsafe target %s', async (input) => {
    await expect(assertSafeUrl(input, () => Promise.resolve(['93.184.216.34']))).rejects.toBeInstanceOf(NetworkPolicyError);
  });

  it('blocks hostnames resolving to private IPs', async () => {
    await expect(assertSafeUrl('https://internal.example', () => Promise.resolve(['10.0.0.4']))).rejects.toThrow('blocked IP');
  });

  it('allows public HTTP targets after checking every resolved address', async () => {
    await expect(assertSafeUrl('https://example.com/listings', () => Promise.resolve(['93.184.216.34']))).resolves.toEqual(
      new URL('https://example.com/listings'),
    );
  });
});
