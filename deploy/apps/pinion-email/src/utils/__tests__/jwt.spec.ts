import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { signHs256 } from '../jwt';

const SECRET = 'shared-with-herald';

describe('signHs256', () => {
  it('produces a token the real library verifies', async () => {
    // The point of this test: Herald verifies with `jsonwebtoken`, so agreeing
    // with our own implementation proves nothing.
    const token = await signHs256(
      { kind: 'ext', tenantId: 't1', recipient: 'lead@example.com' },
      SECRET,
    );

    const decoded = jwt.verify(token, SECRET) as Record<string, unknown>;
    expect(decoded.kind).toBe('ext');
    expect(decoded.recipient).toBe('lead@example.com');
  });

  it('is rejected under a different secret', async () => {
    const token = await signHs256({ a: 1 }, SECRET);
    expect(() => jwt.verify(token, 'other')).toThrow();
  });

  it('is base64url, with no padding that would break a query string', async () => {
    const token = await signHs256({ a: 'x'.repeat(10) }, SECRET);
    expect(token).not.toContain('=');
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
    expect(token.split('.')).toHaveLength(3);
  });

  it('refuses to sign with no secret rather than signing with an empty one', async () => {
    await expect(signHs256({ a: 1 }, '')).rejects.toThrow('without a secret');
  });
});
