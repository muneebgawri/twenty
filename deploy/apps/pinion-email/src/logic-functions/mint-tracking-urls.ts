import { signHs256 } from 'src/utils/jwt';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';

type MintRequest = {
  recipient?: string;
  messageRef?: string;
  sentBy?: string;
  /** Click tracking only: the links to wrap, in the order they appear. */
  destinations?: string[];
};

/**
 * Mints Herald tracking URLs for a message Twenty is about to send.
 *
 * Server side because the signing key cannot go to a browser. The composer
 * knows the recipient and the sender; only this has the secret.
 *
 * Authenticated: an open route would let anyone mint tokens and manufacture
 * tracking events for addresses they chose.
 *
 * Returns nothing at all when tracking is not configured, rather than throwing.
 * A composer that cannot build a pixel must still be able to send the email --
 * tracking is the optional part.
 */
const handler = async (payload: RoutePayload<MintRequest>) => {
  const secret = process.env.EXTERNAL_TRACKING_TOKEN_SECRET ?? '';
  const base = (process.env.HERALD_TRACKING_BASE_URL ?? '').replace(/\/+$/, '');
  const tenantId = process.env.HERALD_TENANT_ID ?? '';

  if (!secret || !base || !tenantId) {
    return { configured: false };
  }

  const body = payload.body ?? {};
  const recipient = (body.recipient ?? '').trim().toLowerCase();
  if (recipient.length === 0) {
    return { configured: true, error: 'recipient required' };
  }

  const messageRef = body.messageRef ?? '';
  const sentBy = body.sentBy;

  const mint = (destinationUrl?: string) =>
    signHs256(
      {
        kind: 'ext',
        tenantId,
        recipient,
        messageRef,
        ...(sentBy ? { sentBy } : {}),
        ...(destinationUrl ? { destinationUrl } : {}),
      },
      secret,
    );

  const openUrl = `${base}/public/track/ext/open?t=${await mint()}`;

  // One token per destination: the URL is inside the signature, so a single
  // shared token could be pointed anywhere by editing the query string.
  const clickUrls: Record<string, string> = {};
  for (const destination of body.destinations ?? []) {
    if (/^https?:\/\//i.test(destination)) {
      clickUrls[destination] =
        `${base}/public/track/ext/click?t=${await mint(destination)}`;
    }
  }

  return { configured: true, openUrl, clickUrls };
};

export default defineLogicFunction({
  universalIdentifier: '5f8c2b1e-6a34-4d90-bc57-e1029d4a7f36',
  name: 'mint-tracking-urls',
  description: 'Signs Herald tracking URLs for an outgoing message',
  timeoutSeconds: 15,
  handler,
  httpRouteTriggerSettings: {
    path: '/pinion/mint-tracking',
    httpMethod: 'POST',
    // Authenticated on purpose: see the note above.
    isAuthRequired: true,
  },
});
