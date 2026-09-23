/**
 * Verify Herald's outbound webhook signature.
 *
 * Herald signs `JSON.stringify({ event, data, timestamp })` with the
 * endpoint's secret and sends the hex digest in `X-Webhook-Signature`.
 *
 * THE BYTES MATTER. The HMAC must be computed over the body exactly as it
 * arrived, not over a re-serialised object: JSON.stringify makes no promise
 * about key order or number formatting across runtimes, so a round-trip can
 * produce a different string and a signature that never matches. PR #1
 * reintroduced precisely this bug in the OpenPhone webhook after the deployed
 * version had already fixed it, which is why it is spelled out here.
 */
export const timingSafeEqualHex = (a: string, b: string): boolean => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  // Constant time over the whole string: a length-only check would leak, and
  // an early return on the first differing character leaks more.
  let differences = 0;
  for (let index = 0; index < a.length; index += 1) {
    differences |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return differences === 0;
};

export const verifyHeraldSignature = async (
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): Promise<boolean> => {
  if (!signatureHeader || !secret || typeof rawBody !== 'string') {
    return false;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(rawBody),
  );
  const expected = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqualHex(expected, signatureHeader.trim().toLowerCase());
};

export const HERALD_SIGNATURE_HEADER = 'x-webhook-signature';
