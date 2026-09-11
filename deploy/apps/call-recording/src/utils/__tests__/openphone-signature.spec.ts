import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { verifyOpenPhoneSignature } from 'src/utils/openphone-signature';

const SIGNING_KEY = Buffer.from('test-signing-key-bytes').toString('base64');
const NOW = 1_757_600_000_000;

const sign = (rawBody: string, timestamp: number, key = SIGNING_KEY) =>
  `hmac;1;${timestamp};${crypto
    .createHmac('sha256', Buffer.from(key, 'base64'))
    .update(`${timestamp}.${rawBody}`)
    .digest('base64')}`;

// Deliberately not what JSON.stringify(JSON.parse(...)) would produce: the
// number keeps its trailing zero. A verifier that re-serializes the parsed body
// computes a different digest and rejects this genuine delivery.
const RAW_BODY =
  '{"id":"EV1","type":"call.recording.completed","data":{"object":{"id":"AC1","duration":30.0}}}';

const verify = (overrides: Partial<Parameters<typeof verifyOpenPhoneSignature>[0]>) =>
  verifyOpenPhoneSignature({
    rawBody: RAW_BODY,
    signatureHeader: sign(RAW_BODY, NOW),
    signingKey: SIGNING_KEY,
    now: NOW,
    ...overrides,
  });

describe('verifyOpenPhoneSignature', () => {
  it('accepts a valid signature over the raw body', () => {
    expect(() => verify({})).not.toThrow();
  });

  it('verifies the raw bytes, not a re-serialized body', () => {
    expect(JSON.stringify(JSON.parse(RAW_BODY))).not.toBe(RAW_BODY);
    expect(() => verify({})).not.toThrow();
  });

  it('rejects a tampered body', () => {
    expect(() => verify({ rawBody: RAW_BODY.replace('AC1', 'AC2') })).toThrow(
      /invalid/,
    );
  });

  it('rejects a signature made with another key', () => {
    const otherKey = Buffer.from('some-other-key').toString('base64');

    expect(() =>
      verify({ signatureHeader: sign(RAW_BODY, NOW, otherKey) }),
    ).toThrow(/invalid/);
  });

  it('rejects a timestamp outside the five-minute window', () => {
    const stale = NOW - 6 * 60 * 1000;

    expect(() => verify({ signatureHeader: sign(RAW_BODY, stale) })).toThrow(
      /invalid/,
    );
  });

  it('accepts a second-resolution timestamp', () => {
    const seconds = Math.floor(NOW / 1000);

    expect(() =>
      verify({ signatureHeader: sign(RAW_BODY, seconds) }),
    ).not.toThrow();
  });

  it('accepts any valid entry in a comma-separated header', () => {
    const otherKey = Buffer.from('rotated-out-key').toString('base64');
    const header = `${sign(RAW_BODY, NOW, otherKey)},${sign(RAW_BODY, NOW)}`;

    expect(() => verify({ signatureHeader: header })).not.toThrow();
  });

  it('fails closed when the header, raw body or key is missing', () => {
    expect(() => verify({ signatureHeader: undefined })).toThrow(/header/);
    expect(() => verify({ rawBody: undefined })).toThrow(/raw body/);
    expect(() => verify({ signingKey: undefined })).toThrow(/not configured/);
  });
});
