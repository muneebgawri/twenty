import {
  HERALD_SIGNATURE_HEADER,
  verifyHeraldSignature,
} from 'src/utils/webhook-signature';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';

type HeraldWebhookBody = {
  event?: string;
  timestamp?: string;
  data?: {
    source?: string;
    recipient?: string;
    messageRef?: string;
    sentBy?: string | null;
    automated?: boolean;
    automatedReason?: string;
    userAgent?: string | null;
    url?: string | null;
    openedAt?: string;
    clickedAt?: string;
  };
};

const KIND_BY_EVENT: Record<string, string> = {
  'email.opened': 'OPENED',
  'email.clicked': 'CLICKED',
};

/**
 * Receives Herald's open/click webhook and files one row per event.
 *
 * Public and unauthenticated by necessity -- Herald posts server to server --
 * so the HMAC is the only thing standing between this and anyone who finds the
 * URL. It is verified over the RAW body, and a missing secret FAILS rather
 * than skipping the check.
 *
 * `forwardedRequestHeaders` is not optional. Twenty drops every request header
 * unless it is listed, so without it the signature header is simply absent and
 * every delivery is rejected -- a failure that looks like Herald signing
 * wrongly rather than like a missing line here. call-recording documents the
 * same trap.
 */
const handler = async (payload: RoutePayload<HeraldWebhookBody>) => {
  // Application variables reach a logic function as environment variables --
  // the same way call-recording reads its OpenPhone signing key. The
  // front-component getApplicationVariable() helper is not available here.
  const secret = process.env.HERALD_TRACKING_WEBHOOK_SECRET ?? '';

  const rawBody = payload.rawBody ?? '';
  const signature = payload.headers?.[HERALD_SIGNATURE_HEADER];

  if (!(await verifyHeraldSignature(rawBody, signature, secret))) {
    return { ok: false, reason: 'bad signature' };
  }

  const body: HeraldWebhookBody =
    payload.body ?? (rawBody.length > 0 ? JSON.parse(rawBody) : {});

  const kind = KIND_BY_EVENT[body.event ?? ''];
  const recipient = body.data?.recipient;

  // Herald sends these events for its own campaign mail too. Only the ones
  // this app minted tokens for belong here; the rest are already reported in
  // Herald and filing them again would double-count.
  if (!kind || !recipient || body.data?.source !== 'twenty') {
    return { ok: true, ignored: true };
  }

  const core = new CoreApiClient();

  await core.mutation({
    createEmailTrackingEvent: {
      __args: {
        data: {
          kind,
          recipient,
          messageRef: body.data?.messageRef ?? '',
          // Scopes the row to the AM who sent the message. Without it
          // rules.js has nothing to bind OWN('sentBy') to and the event is
          // invisible to the only person entitled to see it.
          sentById: body.data?.sentBy ?? null,
          // Recorded, not filtered. Herald labels a fetch it believes is a
          // proxy or a pre-fetch; what a report does with that is a separate
          // decision, and a misjudged fetch is still a fact worth keeping.
          automated: body.data?.automated === true,
          automatedReason: body.data?.automatedReason ?? '',
          userAgent: body.data?.userAgent ?? '',
          occurredAt:
            body.data?.openedAt ?? body.data?.clickedAt ?? body.timestamp ?? new Date().toISOString(),
          url: body.data?.url ?? '',
        },
      },
      id: true,
    },
  } as any);

  // NOT surfaced on the contact's Timeline, and not for want of trying.
  //
  // defineTimelineActivityType returns a validation wrapper --
  // {success, config, errors, warnings} -- and twenty-sdk 2.39.0 cannot
  // consume it either way: default-export the wrapper and the manifest builder
  // validates the wrapper itself, failing with "TimelineActivityType must have
  // a universalIdentifier" and no filename; export `.config` and the build
  // passes but the type is silently absent from the manifest. Every other
  // define* entity in this app is unwrapped for you.
  //
  // Without a registered type, createTimelineActivity has nothing to reference,
  // so the call is left out rather than added inside a try/catch that would
  // fail on every event forever and tell nobody. The "Email tracking" tab on
  // the Person page carries this information in the meantime.

  return { ok: true };
};

export default defineLogicFunction({
  universalIdentifier: 'deb72ad1-ad99-4978-ae4b-4f109c38cdec',
  name: 'herald-tracking-webhook',
  description: 'Files an email open or click reported by Herald',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/herald/tracking',
    httpMethod: 'POST',
    isAuthRequired: false,
    // Without this the signature header never arrives and every delivery is
    // rejected. See the note in the handler.
    forwardedRequestHeaders: [HERALD_SIGNATURE_HEADER],
  },
});
