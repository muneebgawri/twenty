import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  timingSafeEqualHex,
  verifyHeraldSignature,
} from '../webhook-signature';

const SECRET = 'a-shared-secret';
const sign = (body: string) =>
  createHmac('sha256', SECRET).update(body).digest('hex');

describe('verifyHeraldSignature', () => {
  const body = JSON.stringify({
    event: 'email.opened',
    data: { recipient: 'lead@example.com' },
    timestamp: '2026-09-23T12:00:00.000Z',
  });

  it('accepts a signature Herald would produce', async () => {
    expect(await verifyHeraldSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a body that changed by one character', async () => {
    const tampered = body.replace('lead@', 'mark@');
    expect(await verifyHeraldSignature(tampered, sign(body), SECRET)).toBe(false);
  });

  it('rejects the wrong secret', async () => {
    expect(await verifyHeraldSignature(body, sign(body), 'other')).toBe(false);
  });

  it('rejects a missing signature or an unconfigured secret', async () => {
    // An unset secret must FAIL, never pass. Treating "no secret" as "no check
    // needed" would leave the route open to anyone who found the URL.
    expect(await verifyHeraldSignature(body, undefined, SECRET)).toBe(false);
    expect(await verifyHeraldSignature(body, sign(body), '')).toBe(false);
  });

  it('is case-insensitive about the hex, as senders differ', async () => {
    expect(
      await verifyHeraldSignature(body, sign(body).toUpperCase(), SECRET),
    ).toBe(true);
  });

  it('verifies the RAW body, not a re-serialised one', async () => {
    // Key order survives a round-trip here, but spacing does not -- and this
    // is the shape of the bug that has been reintroduced once already.
    const reserialised = JSON.stringify(JSON.parse(body), null, 2);
    expect(await verifyHeraldSignature(reserialised, sign(body), SECRET)).toBe(
      false,
    );
  });
});

describe('timingSafeEqualHex', () => {
  it('matches equal strings and rejects unequal ones', () => {
    expect(timingSafeEqualHex('abc123', 'abc123')).toBe(true);
    expect(timingSafeEqualHex('abc123', 'abc124')).toBe(false);
    expect(timingSafeEqualHex('abc', 'abcd')).toBe(false);
    expect(timingSafeEqualHex('', '')).toBe(true);
  });
});
