/**
 * Per-user email signatures, stored as USER_VARIABLE key-value pairs.
 *
 * Kept server-side rather than in the browser: a signature that lives in
 * localStorage is per-device, vanishes when the cache is cleared, and cannot be
 * applied to anything the server sends on the user's behalf — a scheduled email
 * dispatched hours later has no browser to read it from.
 *
 * Signatures are per connected account, not per user: someone sending from both
 * a personal mailbox and a shared outreach mailbox wants a different sign-off on
 * each.
 *
 * One row per account rather than one map under a single key. A single map made
 * every save a read-modify-write of every account's signature, so two saves
 * overlapping — two mailboxes on the settings page, each with its own Save
 * button — silently dropped whichever landed first. Separate keys make the two
 * writes touch different rows, and the only remaining race is two saves of the
 * *same* account, where last-write-wins is the behaviour you want anyway.
 */
export const EMAIL_SIGNATURE_KEY_PREFIX = 'EMAIL_SIGNATURE:';

export type EmailSignatureKey =
  `${typeof EMAIL_SIGNATURE_KEY_PREFIX}${string}`;

/** The user-var key holding one connected account's signature. */
export const buildEmailSignatureKey = (
  connectedAccountId: string,
): EmailSignatureKey => `${EMAIL_SIGNATURE_KEY_PREFIX}${connectedAccountId}`;

/**
 * The connected account a signature key belongs to, or undefined when the key
 * is some other user variable entirely.
 */
export const parseEmailSignatureKey = (key: string): string | undefined =>
  key.startsWith(EMAIL_SIGNATURE_KEY_PREFIX)
    ? key.slice(EMAIL_SIGNATURE_KEY_PREFIX.length)
    : undefined;

/** connectedAccountId → signature text. */
export type EmailSignaturesByConnectedAccountId = Record<string, string>;

export type EmailSignatureKeyValueType = Record<EmailSignatureKey, string>;

/**
 * Cap on a single signature. Long enough for a block with a legal footer, short
 * enough that the key-value row stays small and a paste accident cannot bloat
 * every outgoing message.
 */
export const EMAIL_SIGNATURE_MAX_LENGTH = 2000;
