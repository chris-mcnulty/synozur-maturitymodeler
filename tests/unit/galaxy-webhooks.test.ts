import { describe, expect, it } from 'vitest';
import { signPayload, generateWebhookSecret } from '../../server/routes/galaxy/webhooks';

describe('galaxy webhook signer', () => {
  it('produces deterministic HMAC-SHA256 signature with sha256= prefix', () => {
    const secret = 'test_secret';
    const ts = 1700000000;
    const body = JSON.stringify({ hello: 'world' });
    const sig1 = signPayload(secret, ts, body);
    const sig2 = signPayload(secret, ts, body);
    expect(sig1).toBe(sig2);
    expect(sig1.startsWith('sha256=')).toBe(true);
    expect(sig1.length).toBe('sha256='.length + 64);
  });

  it('changes signature when timestamp or body change', () => {
    const secret = 'test_secret';
    const a = signPayload(secret, 1, JSON.stringify({ a: 1 }));
    const b = signPayload(secret, 2, JSON.stringify({ a: 1 }));
    const c = signPayload(secret, 1, JSON.stringify({ a: 2 }));
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('generates unique gx_-prefixed secrets', () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a.startsWith('gx_')).toBe(true);
    expect(b.startsWith('gx_')).toBe(true);
    expect(a).not.toBe(b);
  });
});
