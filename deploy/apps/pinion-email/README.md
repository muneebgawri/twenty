# Pinion email (Twenty app)

Step 1 of `deploy/apps/PRD-email-productivity.md`: **per-mailbox email
signatures**. The composer, scheduled send and tracking follow in later steps;
this ships the skeleton they all sit on.

## What it adds

- An app-owned **Email signature** object, keyed by `connectedAccountId`.
- A **Settings** page listing the signed-in user's connected mailboxes, with a
  signature per mailbox.

## Why the signature is not a field on the mailbox

`connectedAccount` is a core TypeORM entity, not an object — it is absent from
`STANDARD_OBJECTS`, so no field can be added to it and there is nowhere in
Twenty for a signature to live. Hence an app-owned object with a plain TEXT
`connectedAccountId`: you cannot declare a relation to a non-object.

The ids come from **`myConnectedAccounts` on the `/metadata` endpoint**, which
returns `ConnectedAccountPublicDTO` (`id`, `handle`, `provider`,
`userWorkspaceId`, `authFailedAt`, `archivedAt`). Neither `connectedAccount`
nor `messageChannel` is queryable on the core endpoint — its root Query is
records-only, with no `currentUser`. Do not go looking there.

`myConnectedAccounts` is gated like `sendEmail`: an API key gets *"This
endpoint requires a user context."* A front component can call it; an API key
and cron cannot. That is why the scheduled-send queue will store
`connectedAccountId` on the row at compose time rather than resolving it when
the mail actually goes out.

## Row security

`emailSignature` is `CREATOR` in `deploy/branding/row-security/rules.js`. An
object **absent** from that map is HIDDEN, so adding it there is not optional —
the settings page would silently show nothing for every Account Manager.

Re-run the coverage check after any change:

```bash
ssh twenty-new 'sudo docker exec twenty-staging-db-1 psql -U postgres -d default \
  -At -c "select \"nameSingular\" from core.\"objectMetadata\" where \"isActive\";"' \
  | node ../../branding/row-security/check-coverage.js
```

## Deploy

```bash
yarn install
yarn typecheck && yarn lint

yarn twenty deploy -r staging
yarn twenty app:install -r staging
```

**Installing the same version twice is refused**, not silently re-applied:
`<uuid>@0.1.0 is already installed in this workspace`. Bump `version` in
`package.json` to ship a change. That is the safer behaviour — it cannot
duplicate an object — but it does mean a forgotten version bump looks like a
deploy that did nothing.

`yarn install` needs the empty `yarn.lock` in this directory. Without it yarn
treats the app as part of the repo-root workspace and refuses to install.

## Verified against staging

Run for real, not against a mock (PRD §3.8 #7):

| Operation | Result |
|---|---|
| `emailSignatures` query | works |
| `createEmailSignature` | works |
| `updateEmailSignature` | works |
| `destroyEmailSignature` | works |
| coverage check | 0 unclassified |
| re-install same version | refused, object not duplicated |

**Not yet verified:** the settings page itself. `myConnectedAccounts` requires
user context, so it cannot be exercised with an API key — it needs a browser
session on staging. Do that before calling step 1 done.
