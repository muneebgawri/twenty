# CRM feature pack

This branch adds the requested CRM wishlist features to Twenty.

## Included

- **Scheduled email** — choose a local date/time in the composer. The request is
  queued on the messaging queue and sent through the selected connected account.
- **Email signatures** — signatures are saved per connected account in the
  browser and appended safely to both HTML and plain-text email bodies.
- **Delivery, open, and click tracking** — provider acceptance is recorded as
  `SENT`; a signed tracking pixel records opens; signed redirect URLs record link
  clicks. Counts and the latest status appear under outgoing messages.
- **My leads** — a standard Person table view filtered to records created by the
  current workspace member.
- **OpenPhone / Quo** — a Person command starts click-to-call through the
  operating system `tel:` handler. The call-recording app receives signed
  `call.recording.completed` webhooks, copies audio into Twenty storage, and
  links the recording to a Person by primary phone number.

## Deployment notes

1. Install dependencies and run the normal Twenty metadata/database upgrade so
   the new standard Message fields and Person view are synchronized into each
   workspace.
2. Ensure the messaging worker is running; scheduled messages use the existing
   `messaging-queue` BullMQ queue.
3. `SERVER_URL` must be a public HTTPS URL for tracking links and pixels.
4. Deploy the `packages/twenty-apps/internal/call-recording` app and set its
   `OPENPHONE_WEBHOOK_SIGNING_KEY` environment variable to the base64 signing
   secret shown in OpenPhone / Quo.
5. Configure an OpenPhone / Quo `call.recording.completed` webhook with the
   deployed `openphone-webhook` function URL.
6. Set OpenPhone / Quo as the operating system's default `tel:` handler for
   desktop click-to-call.

## Behavior and limitations

- `SENT` means the connected provider accepted the message. True mailbox-level
  delivery depends on provider-specific delivery webhooks, which Gmail,
  Microsoft, and generic SMTP do not expose through one common mechanism.
- Open detection depends on the recipient allowing remote images. Mail privacy
  proxies may prefetch or mask opens. Click counts remain reliable for links
  that pass through the signed redirect.
- Scheduled email attachments remain in Twenty temporary email storage until
  the job sends successfully.
- Email signatures are per browser profile and connected account. They do not
  yet roam between browsers.

## Verification performed

- TypeScript syntax transpilation passed for all 33 modified `.ts` / `.tsx`
  files.
- A full dependency-aware Nx build could not be run in the review workspace
  because the provided archive does not include dependencies and package
  downloads are blocked by the workspace network policy.
