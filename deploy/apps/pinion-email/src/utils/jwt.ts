/**
 * Minimal HS256 signer, matching what Herald's `jsonwebtoken` produces.
 *
 * Hand-rolled because a logic function runs in a constrained runtime and
 * pulling a JWT library in for one `sign` is more surface than the twenty
 * lines it replaces. Verification stays on Herald's side, with the real
 * library, so a mistake here fails closed: a malformed token is simply
 * rejected and no tracking event is recorded.
 */
const base64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const encodeSegment = (value: unknown): string =>
  base64Url(new TextEncoder().encode(JSON.stringify(value)));

export const signHs256 = async (
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> => {
  if (!secret) {
    throw new Error('Cannot sign without a secret');
  }

  // `typ` and `alg` in this order is what jsonwebtoken emits. The header is
  // part of the signed input, so it has to match byte for byte or Herald
  // rejects a token that is otherwise correct.
  const signingInput = `${encodeSegment({ alg: 'HS256', typ: 'JWT' })}.${encodeSegment(payload)}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
};
