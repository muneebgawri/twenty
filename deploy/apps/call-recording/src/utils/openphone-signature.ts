import crypto from 'node:crypto';

// OpenPhone signs webhooks with a header of the form
//   openphone-signature: hmac;1;<timestamp-ms>;<base64 digest>
// where digest = HMAC-SHA256(base64decode(signingKey), `${timestamp}.${rawBody}`).
//
// The digest has to be computed over the bytes OpenPhone sent. Re-serializing
// the parsed body (JSON.stringify) only matches while key order and number
// formatting happen to survive the round trip, and fails otherwise.

export const OPENPHONE_SIGNATURE_HEADER = 'openphone-signature';

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export class OpenPhoneSignatureError extends Error {}

type VerifyArgs = {
  rawBody: string | undefined;
  signatureHeader: string | undefined;
  signingKey: string | undefined;
  now?: number;
};

const toMilliseconds = (timestamp: number) =>
  // Documented as milliseconds; accept seconds too rather than rejecting a
  // valid delivery if that ever changes.
  timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;

const digestsMatch = (expected: string, provided: string) => {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  return (
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
};

export const verifyOpenPhoneSignature = ({
  rawBody,
  signatureHeader,
  signingKey,
  now = Date.now(),
}: VerifyArgs): void => {
  if (!signingKey) {
    throw new OpenPhoneSignatureError(
      'OPENPHONE_WEBHOOK_SIGNING_KEY is not configured',
    );
  }

  if (rawBody === undefined) {
    throw new OpenPhoneSignatureError('Request has no raw body to verify');
  }

  if (!signatureHeader) {
    throw new OpenPhoneSignatureError('Missing openphone-signature header');
  }

  const key = Buffer.from(signingKey, 'base64');

  // A header may carry several signatures (e.g. during key rotation),
  // comma-separated. Any one valid signature is enough.
  for (const signature of signatureHeader.split(',')) {
    const [scheme, version, timestamp, providedDigest] = signature
      .trim()
      .split(';');

    if (scheme !== 'hmac' || version !== '1' || !timestamp || !providedDigest) {
      continue;
    }

    const timestampMs = toMilliseconds(Number(timestamp));

    if (
      !Number.isFinite(timestampMs) ||
      Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS
    ) {
      continue;
    }

    const expectedDigest = crypto
      .createHmac('sha256', key)
      .update(`${timestamp}.${rawBody}`)
      .digest('base64');

    if (digestsMatch(expectedDigest, providedDigest)) {
      return;
    }
  }

  throw new OpenPhoneSignatureError('OpenPhone webhook signature is invalid');
};
