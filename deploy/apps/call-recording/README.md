# OpenPhone call recording (Twenty app)

Adds OpenPhone / Quo calling to Pinion CRM:

- **Call with OpenPhone.** This command appears on a single selected Person.
  It opens a panel with a `tel:` link to the person's primary number, including
  the country code. Clicking the link hands the call to OpenPhone once
  OpenPhone is the computer's default calling app.
- **Recording import.** A public webhook receives OpenPhone's
  `call.recording.completed` event. It verifies the signature, downloads the
  audio into Twenty's file storage, and creates a **Call recording** linked to
  the Person whose primary phone matches.

This app is based on upstream Twenty's `internal/call-recording` app at
v2.2.0, with Shaheer's OpenPhone work from `feature/crm-wishlist` ported onto
it. It builds against `twenty-sdk@2.2.0`, which matches production. It is
deployed to a running server with the SDK CLI, not built into the Docker image.

## Differences from upstream's app

Removed, because they are unused here and not safe to expose:

- `end-recording`. This was a public, unauthenticated endpoint that made the
  server download any URL it was given and attach the file to a call recording.
  It belonged to a meeting-recorder integration that we do not use.
- The seed-data command, which inserted mock call recordings.
- The person-summary command and the AI summarization skill. OpenPhone
  recordings arrive without transcripts, so there is nothing to summarize.

The function role no longer has soft-delete or AI permissions, because the
webhook is a public route.

## Deploy

```bash
yarn install
yarn typecheck && yarn test && yarn lint

# One-time: authenticate against the target server. This needs an API key
# (Settings → APIs & Webhooks) from a role that has the "Applications"
# permission.
yarn twenty remote add --as prod --api-url https://crm.pinionpartners.co --api-key <key>

yarn twenty deploy -r prod     # builds and uploads the tarball
yarn twenty install -r prod    # installs it into the workspace
```

## OpenPhone setup

1. In OpenPhone, go to Settings → Integrations → Webhooks. Create a webhook for
   **`call.recording.completed`** pointing at
   `https://crm.pinionpartners.co/s/openphone/webhook`.
2. Copy the signing key that OpenPhone shows. In Pinion CRM, open
   Settings → Applications → OpenPhone call recording and paste it into
   **OPENPHONE_WEBHOOK_SIGNING_KEY** (stored as a secret).
3. On each rep's computer, set OpenPhone as the default app for `tel:` links.

## Behaviour notes

- **Signature.** The HMAC is computed over the raw request body
  (`event.rawBody`), not a re-serialized one. Deliveries more than five minutes
  from the signed timestamp are rejected. Twenty drops any request header the
  route doesn't list in `forwardedRequestHeaders`, so `openphone-signature` is
  listed. Without that entry every delivery would fail.
- **Duplicates.** OpenPhone retries failed deliveries. A call that is already
  imported (matched by `providerCallId`) returns `duplicate: true` and does not
  create a second record.
- **Person matching.** Twenty stores a number as calling code plus national
  number (`+1` / `5551234567`), while OpenPhone sends E.164 (`+15551234567`).
  The webhook derives the candidate national numbers and confirms each match on
  the full number, so the same digits in a different country do not match.
  Only the primary phone is checked.
- **Why the call button is a link.** Front components run in a Web Worker,
  where `location` is read-only, so a component cannot start a call itself. The
  host renders the component's `<a href="tel:…">` as a real link.
