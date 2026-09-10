/**
 * Per-user email signatures, stored as a USER_VARIABLE key-value pair.
 *
 * Kept server-side rather than in the browser: a signature that lives in
 * localStorage is per-device, vanishes when the cache is cleared, and cannot be
 * applied to anything the server sends on the user's behalf — a scheduled email
 * dispatched hours later has no browser to read it from.
 *
 * One key holds every account's signature rather than one key per account, so
 * the read path is a single lookup and the user-vars allow list stays a fixed
 * list rather than a prefix match.
 *
 * Signatures are per connected account, not per user: someone sending from both
 * a personal mailbox and a shared outreach mailbox wants a different sign-off on
 * each.
 */
export enum EmailSignatureKeys {
  EMAIL_SIGNATURES = 'EMAIL_SIGNATURES',
}

/** connectedAccountId → signature text. */
export type EmailSignaturesByConnectedAccountId = Record<string, string>;

export type EmailSignatureKeyValueType = {
  [EmailSignatureKeys.EMAIL_SIGNATURES]: EmailSignaturesByConnectedAccountId;
};

/**
 * Cap on a single signature. Long enough for a block with a legal footer, short
 * enough that the key-value row stays small and a paste accident cannot bloat
 * every outgoing message.
 */
export const EMAIL_SIGNATURE_MAX_LENGTH = 2000;
