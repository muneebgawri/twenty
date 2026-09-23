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
  // Full URLs, not a base plus a path this function knows. The whole point of
  // the branded host is that the URL in the email is short and first-party --
  // https://track.pinionnewswire.com/o rather than a long API path on someone
  // else's domain -- so the shape has to be configuration, not code.
  const openBase = (process.env.HERALD_TRACKING_OPEN_URL ?? '').trim();
  const clickBase = (process.env.HERALD_TRACKING_CLICK_URL ?? '').trim();
  const tenantId = process.env.HERALD_TENANT_ID ?? '';

  if (!secret || !openBase || !tenantId) {
    return { configured: false };
  }

  const body = payload.body ?? {};
  const recipient = (body.recipient ?? '').trim().toLowerCase();
  if (recipient.length === 0) {
    return { configured: true, error: 'recipient required' };
  }

  const messageRef = body.messageRef ?? '';
  const sentBy = body.sentBy;
  // Minted here rather than taken from the caller: the send is moments away,
  // and a client clock that is wrong would classify every open as a pre-fetch
  // or none of them.
  const sentAt = new Date().toISOString();

  const mint = (destinationUrl?: string) =>
    signHs256(
      {
        kind: 'ext',
        tenantId,
        recipient,
        messageRef,
        ...(sentBy ? { sentBy } : {}),
        sentAt,
        ...(destinationUrl ? { destinationUrl } : {}),
      },
      secret,
    );

  const join = (url: string, token: string) =>
    `${url}${url.includes('?') ? '&' : '?'}t=${token}`;

  const openUrl = join(openBase, await mint());

  // One token per destination: the URL is inside the signature, so a single
  // shared token could be pointed anywhere by editing the query string.
  const clickUrls: Record<string, string> = {};
  for (const destination of body.destinations ?? []) {
    if (/^https?:\/\//i.test(destination) && clickBase.length > 0) {
      clickUrls[destination] = join(clickBase, await mint(destination));
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
