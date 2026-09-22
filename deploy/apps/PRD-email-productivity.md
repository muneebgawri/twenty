# PRD — Email productivity in Twenty (scheduling, tracking, signatures)

**Status:** approved to build, not started
**Audience:** whoever builds this. Assumes you know React and GraphQL, assumes you know nothing about this Twenty deployment.
**Supersedes:** PR #1 (`feature/crm-wishlist`), which is architecturally incompatible — see §9.

---

## 1. What we are building and why

Account Managers live in Twenty. Three things they need are missing from it:

| # | Feature | What it means |
|---|---------|---------------|
| **A** | **Scheduled send** | Write a reply now, have it leave the mailbox at 8am tomorrow. |
| **B** | **Open/click tracking** | Know whether a sent email was opened, and whether its links were clicked. |
| **C** | **Per-account signatures** | A signature stored per connected mailbox, appended when sending. |

All three send **through the AM's own connected mailbox**, not through a relay. That is the
point: replies must come back to them, and sent mail must appear in their own Sent folder.
This is why "just have Herald send it" is not the answer (§9.3).

### Explicitly out of scope

- Anything that requires building Twenty from source (§2).
- Adding features to Twenty's **native** composer. We ship our own (§4.2), decision taken
  deliberately — patching a minified React bundle is far more fragile across upgrades than
  the server-side patches we already carry.
- "My leads" / personal lead views. PR #1 dropped this for a good reason: ownership in
  production is keyed on `personOwner` (93,001 of 93,479 people), not `createdBy` (5,601),
  and a standard view filter cannot resolve a non-standard field. The view would render
  empty for every AM.

---

## 2. THE CONSTRAINT — read this before designing anything

> **Production does not run this repository's source code.**

It runs the **stock `twentycrm/twenty` image** with a thin patch layer applied on top at
build time. `deploy/branding/` is the entire delta. See `deploy/branding/README.md`.

Practically:

- Editing `packages/twenty-server/**` or `packages/twenty-front/**` **ships nothing**. Those
  directories exist because this is a fork of `twentyhq/twenty`; production never compiles
  them. This is the single reason PR #1 cannot merge.
- There are exactly **two** sanctioned ways to change production behaviour:
  1. **A Twenty app** — installable, declarative, survives upgrades. Always prefer this.
  2. **An overlay patch** — a string-splice into one compiled `dist/**.js` file at image
     build time, with a uniqueness assertion so an upgrade fails loudly instead of silently
     dropping the patch. Use only where an app genuinely cannot reach.

### The overlay patch contract

Every patch under `deploy/branding/<name>/` follows the same shape. Copy it exactly:

```dockerfile
COPY <name> /app/pinion-<name>
RUN set -eu; \
    F=/app/packages/twenty-server/dist/<path to file>; \
    node /app/pinion-<name>/apply-patch.js "$F"; \
    node --check "$F"; \
    cd /app/pinion-<name> && node --test
```

`apply-patch.js` must:
- assert its anchor string appears **exactly once** and `exit 1` otherwise;
- refuse to run twice (check for its own marker);
- keep its logic in a sibling CommonJS module that the splice `require()`s, so the injected
  code is one line and the logic is unit-testable.

Existing examples, in increasing order of complexity: `deploy/branding/row-security/`,
`deploy/branding/google-apis-oauth/`, `deploy/branding/email-gate/`.

**`build-and-deploy.sh` now refuses to deploy an image that has fewer `/app/pinion-*`
modules than the image it replaces.** This exists because on 2026-09-21 a patch deployed
from an unmerged branch was silently dropped from two consecutive builds — the image built,
booted, passed its health check, and served traffic with a feature quietly gone. Do not
disable that check.

---

## 3. Twenty app development — field guide

Everything in this section was established by reading the 2.39 SDK, the two working apps in
this estate, and in several cases by testing against production. **Where something is
unverified, it says so.** Do not treat unverified items as facts; two features depend on
resolving them (§7).

### 3.1 The two working apps to copy from

| App | Where | What it proves |
|---|---|---|
| `pinion-lead-lookup` | `~/Projects/pinion-lead-lookup` | Full-page front component, nav menu item, custom object, custom role, view |
| `call-recording` | `deploy/apps/call-recording/` | Logic function with a **public HTTP route**, record-page tab, fields added to a **standard** object, vitest specs |

Both pin `twenty-sdk@2.39.0` and `twenty-client-sdk@2.39.0`. Match that.

### 3.2 Everything the SDK can declare

Complete list of `define*` exports from `twenty-sdk@2.39.0`:

```
defineAgent                    defineApplication              defineApplicationRole
defineCommandMenuItem          defineConnectionProvider       defineField
defineFrontComponent           defineIndex                    defineLogicFunction
defineNavigationMenuItem       defineObject                   definePageLayout
definePageLayoutTab            definePermissionFlag           definePostInstallLogicFunction
definePreInstallLogicFunction  defineRole                     defineSettingsFrontComponent
defineSkill                    defineTimelineActivityType     defineUninstallLogicFunction
defineView                     defineViewField
```

**There is no `defineWorkflow` and no `defineCronTrigger`.** Cron is a *property of a logic
function*, not a trigger type you declare separately (§3.4).

### 3.3 Front components — what they can and cannot do

- **They run in a Web Worker.** `location` is read-only, so a component cannot navigate the
  browser or start a `tel:` call itself. `call-person-with-openphone.tsx` renders a `tel:`
  anchor for the user to click instead. Design around this early; it is not obvious and it
  will surprise you.
- **They call the API directly** via `new CoreApiClient().query({...}) / .mutation({...})`
  from `twenty-client-sdk`. Hooks like `useRecordId()` come from `twenty-sdk/front-component`.
- **Their token carries USER context.** This is the important one — see §3.6.
- **They can call a logic function.** The REST client routes `/s/...` paths to the functions
  base URL and picks the token by `runAs`; the default is the **user-scoped** token.
- **There is no placement field on the manifest.** Where a component appears is decided from
  the other side — by a page layout tab, a command menu item, a nav menu item, or a settings
  page. Four mounting options, all proven in the two apps above.

**There is no extension point in Twenty's native email composer.** `useSendEmail.ts` and
`useEmailComposerState.ts` read no front-component metadata. An app can only ship *its own*
composer. This is why §4.2 exists.

### 3.4 Logic functions — what they can do

Verified capabilities:

- **Arbitrary outbound HTTP.** Plain `fetch()`. No allowlist, no proxy.
- **Read and write Twenty records**, under the app's role, via `CoreApiClient` /
  `MetadataApiClient`. Permissions come from the app's `defineApplicationRole`.
- **Cron.** A per-minute scheduler walks every logic function with
  `cronTriggerSettings: { pattern }`. **Confirmed live in production** — `truncateStale`
  runs at `0 3 * * *`.
- **Public unauthenticated HTTP routes.** `httpRouteTriggerSettings` with
  `isAuthRequired: false`, served under `/s/<path>`. **Confirmed live in production**: a GET
  to an unregistered path returns a structured `TRIGGER_NOT_FOUND` from the route-trigger
  controller, which proves the controller is mounted and reachable without auth.

Trigger types available on a logic function: `cronTriggerSettings`,
`databaseEventTriggerSettings`, `httpRouteTriggerSettings`, `serverRouteTriggerSettings`,
`toolTriggerSettings`, `workflowActionTriggerSettings`.

**Gotcha:** request headers are **dropped** unless you list them in
`forwardedRequestHeaders`. `call-recording` documents this — without it the webhook's
signature check never sees the signature header and rejects every delivery.

**UNVERIFIED — blocks feature B's click tracking (§7.2):** whether a logic function can
return a custom HTTP status / `Content-Type` / `Location`. 2.39 types a
`LogicFunctionHttpResponse` (`{ __twentyHttpResponse: true, body, status?, headers? }`) but
only for `serverRouteTriggerSettings` handlers, and `ServerRouteTriggerSettings` has no
`path` and no `isAuthRequired` — so we cannot show that route is publicly reachable.

### 3.5 Storage — what an app may own

- **`defineObject`** — app-owned objects, no restrictions. Use freely.
- **An app CAN add fields to a STANDARD object.** Proven: `call-recording` adds a relation
  field to `person` via `objectUniversalIdentifier`. The app owns the field, so it also
  appears inside the app's filtered schema.
- **`message` is a SYSTEM object.** You cannot grant per-object or per-field role
  permissions on it, and it has no record page, so a counter stored there is not
  user-visible without your own UI. Adding app fields to a system object is
  **plausible but untested** — prefer an app-owned object keyed by `headerMessageId`.
- **`connectedAccount` is NOT an object at all.** It is a core TypeORM entity and is absent
  from `STANDARD_OBJECTS`. **You cannot add a signature field to it.** Signatures must live
  in an app-owned object keyed by `connectedAccountId` (§4.3).

### 3.6 Auth — the model that decides this whole design

This is the crux. Read it twice.

| Caller | Token carries | Can call `sendEmail`? |
|---|---|---|
| **Front component** | `workspaceId` **+ `userWorkspaceId` + `userId`** | **Yes** |
| **Logic function** | `workspaceId` + `applicationId` only | **No** |
| **Cron-invoked logic function** | no user, by definition | **No** |

`sendEmail` lives on the **metadata** endpoint (`@MetadataResolver`), *not* the app-filtered
workspace schema — so the `[twentyStandardApplicationId, applicationId]` object filter does
not apply to it, and `sendEmail` is present in the 2.39 client SDK today. It is callable.

The gate is user context. `sendEmail` takes `@AuthUserWorkspaceId()`, and that decorator
throws `ForbiddenException('This endpoint requires a user context. API keys are not
supported.')` when `request.userWorkspaceId` is absent — **during argument resolution,
before the method body runs.** You cannot patch around it by editing the resolver body.

**Consequence:** send-now from our own composer works today with no patch. Send-later does
not, because cron has no user. This is what §4.1 solves.

### 3.7 Row security — do not skip this

`deploy/branding/row-security/rules.js` maps every object to an access mode, and an object
**absent from that map is HIDDEN** (fail closed). `PINION_RESTRICTED_ROLE_IDS` currently
binds only the Account Manager role.

**Any new object this app defines must be added to `rules.js`, or AMs will not see it.**
That includes the scheduled-send queue and the signature store. There is a coverage checker
(`row-security/check-coverage.js`) — run it.

### 3.8 Hard-won gotchas

These cost real time this session. None are documented upstream.

1. **Do not use Twenty's opaque GraphQL cursor for paging.** Over the 87k Bigin-imported
   people that share one `updatedAt`, it encoded on the wrong column and returned the
   identical 200 rows for ever. **Use keyset paging**: `orderBy: [{ id: AscNullsFirst }]`
   with `filter: { id: { gt: lastId } }`.

2. **`emails` is a COMPOSITE — filter into it, don't flatten.** `emails: { primaryEmail: {
   neq: "" } }` works; `emailsPrimaryEmail` (the real Postgres column name) is rejected with
   *"Object person doesn't have any emailsPrimaryEmail field"*.

3. **LINKS fields are validated strictly and fail the WHOLE mutation.** A malformed URL
   returns `INVALID_URL` and nothing in that mutation is written — including any completion
   marker in the same payload, which turns into an infinite retry loop on that record.
   Validate URLs before sending; drop a bad one and keep the rest of the write. Note also
   that Twenty **normalises** stored link URLs — write `https://acme.com`, read back
   `acme.com`.

4. **The Redis metadata cache is not reliably invalidated by writes.** Two instances:
   - A newly created field can be missing from `objects { fields { ... } }` while both the
     `core.fieldMetadata` row and the physical column exist. This breaks "create if absent"
     scripts, which then try to re-create an existing field.
   - A revoked or deleted API key **keeps working** until the cache is evicted.
   Fix: `yarn command:prod cache:flush` inside the server container. **After writing
   metadata through the API, flush before trusting a read-back.**

5. **Rate limits.** ~100 API-key requests/minute per workspace. `QUERY_MAX_RECORDS = 200`
   caps both a `createMany` batch and the rows a single `updateMany` may match. Batch, or a
   few thousand per-record writes will take hours.

6. **`updateMany` applies ONE payload to everything its filter matches.** For per-record
   values, either group records by value (3 verdicts → 3 calls per page) or use
   `createMany(upsert: true)` with ids — but note upsert INSERTS on a miss, which creates
   duplicates if your ids are wrong.

7. **Test the boundary, not the mock.** A feature in this repo was reverted after its tests
   passed against a mocked GraphQL client while the query it depended on did not exist. In
   the same week, two of three query shapes in a new service were wrong for the same reason.
   **Run every query and mutation against a real instance before pinning it in a test.**

---

## 4. Design

### 4.0 Shape

One Twenty app, `pinion-email`, plus **one** overlay patch. Nothing else.

```
deploy/apps/pinion-email/
  src/
    application-config.ts
    objects/
      scheduled-email.ts          app-owned send queue
      email-signature.ts          per connected account
      email-tracking-event.ts     opens and clicks
    roles/default-role.ts
    front-components/
      composer.tsx                our composer (command menu)
      signature-settings.tsx      settings page
    command-menu-items/compose.ts
    logic-functions/
      dispatch-scheduled.ts       cron, every minute
      track-open.ts               public route, no auth
      track-click.ts              public route, no auth
deploy/branding/app-send-email/   the one overlay patch
```

### 4.1 Feature A — scheduled send

**Flow**

1. AM opens our composer (front component, command menu item).
2. Composer writes a `scheduledEmail` record: recipients, subject, body,
   `connectedAccountId`, `sendAt`, and **`onBehalfOfUserWorkspaceId` = the composing user**.
   The front component runs as that user, so this is recorded truthfully, not asserted.
3. A cron logic function runs every minute, finds rows where `sendAt <= now` and
   `status = PENDING`, and calls `sendEmail` passing the stored `onBehalfOfUserWorkspaceId`.
4. On success it sets `status = SENT` and stores the returned message id.

**The overlay patch** (`deploy/branding/app-send-email/`)

Patch `send-email.resolver.js` to take `@AuthUserWorkspaceId({ allowUndefined: true })` —
the decorator already supports that option — and, when the resolved value is undefined,
fall back to an explicit `input.onBehalfOfUserWorkspaceId`.

**The ownership check still runs either way.** `verifyOwnership({ id, userWorkspaceId,
workspaceId })` is called with whichever id was used, so the connected account must genuinely
belong to that user. This is delegation with the delegator recorded, not a bypass.

> **Security note, stated plainly.** This grants the app the ability to send as **any user in
> the workspace**. The delegation chain is honest — a user creates the row, cron sends as
> that user — and an attacker would need write access to the app's objects. But it is a
> wider capability than the app has today. Approved with that understood. Reviewers: keep
> `verifyOwnership` in the patched path. If it ever becomes conditional, the patch is a
> vulnerability.

### 4.2 Feature B — tracking

**Injection.** Only possible for mail sent through *our* composer, because Twenty's
`sendEmail` transmits `input.body` verbatim. Before calling `sendEmail`, the composer:

- appends `<img src="https://crm.pinionpartners.co/s/t/o/<signed-token>" width="1" height="1">`
- rewrites each `<a href>` to `https://crm.pinionpartners.co/s/t/c/<signed-token>`

The token must be an HMAC over `(messageRef, destination)` so a redirect cannot be reused to
point anywhere else. PR #1 got this right and its
`email-tracking.controller.spec.ts` is worth reading before you rewrite it.

**Recording.** Public logic-function routes (`isAuthRequired: false`) write an
`emailTrackingEvent` row. Counters are derived, not incremented in place — PR #1 had a
read-modify-write race that downgraded CLICKED back to OPENED.

**Carry these over from PR #1's review — they are real and were not fixed there:**
- The pixel URL is permanently valid and reaches every recipient, every forward, and every
  mail-privacy proxy. **Rate-limit the public routes**, or one recipient can drive unbounded
  DB writes.
- **Default tracking OFF.** For a UK press-relations CRM, open pixels plus rewriting every
  outbound link is a GDPR/PECR consent question, and link rewriting measurably hurts
  deliverability. Make it an explicit per-send choice.
- Return the GIF even for an unknown token, or you leak record existence to anyone holding
  any valid signature.

**Blocked pending §7.2:** click tracking needs a `302` + `Location`. Open tracking does not
strictly need custom headers (the GET fires regardless; the image merely fails to render),
so **open tracking can ship first**.

### 4.3 Feature C — signatures

Simplest of the three; no unknowns.

- Storage: app-owned `emailSignature` object keyed by `connectedAccountId`. You **cannot**
  add a field to `connectedAccount` (§3.5).
- UI: `defineSettingsFrontComponent`.
- Application: our composer concatenates the signature into `body` before calling
  `sendEmail`. Resolve it **at send time**, not compose time, so a scheduled send hours later
  picks up the current signature. PR #1 got this right after initially storing it in
  localStorage — do not regress it.
- Twenty has **no** signature concept anywhere in its send path. There is nothing to
  integrate with and nothing to conflict with.

---

## 5. Build order

Each step is independently shippable. Do not start the next until the previous is in
production and looked at.

1. **App skeleton + signatures (C).** No patch, no unknowns. Proves the install pipeline,
   the settings component, and the role/`rules.js` wiring end to end.
2. **Our composer, send-now only.** No patch needed — a front component's token already
   carries user context (§3.6). This is the largest UI piece; get it right before adding
   time and tracking.
3. **Open tracking (B, partial).** Public route + app object. Default off.
4. **Run the §7 experiments.** They gate the remaining two.
5. **Scheduled send (A).** The overlay patch plus the cron function.
6. **Click tracking (B, rest).** Only if §7.2 resolves favourably.

---

## 6. Definition of done

- Every GraphQL query and mutation has been run against a real instance and pasted into the
  PR description (§3.8 #7). Tests that only exercise a mock do not count.
- New objects are in `rules.js` and `check-coverage.js` passes.
- The app installs cleanly on **staging** first, and the install is re-run to prove it is
  idempotent.
- `build-and-deploy.sh` reports no lost overlays.
- Tracking defaults to off, and the public routes are rate-limited.
- A scheduled send has been observed actually leaving a real mailbox at the requested time.

---

## 7. Experiments to run FIRST

Both are small, and both decide scope. Do them before writing feature code.

**7.1 — Does a cron logic function have user context in 2.39?**
The 2.39 SDK exposes `LogicFunctionExecutionContext.userWorkspaceId: string | null`, which
hints user context is propagated for *user-initiated* invocations. Cron cannot benefit in
principle, but confirm it empirically. **If it somehow does, feature A needs no patch at
all** and §4.1's security note disappears. Worth an hour.

**7.2 — Can a public logic-function route return a 302 and a custom `Content-Type`?**
Deploy a throwaway app with one `isAuthRequired: false` route returning
`{ __twentyHttpResponse: true, status: 302, headers: { Location: '...' } }`, and a second
returning `Content-Type: image/gif`. `curl -i` both. **This decides click tracking.**

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Overlay patch breaks on a Twenty upgrade | Anchor uniqueness assertion fails the build. This is by design — fix the anchor, never loosen the assertion. |
| Two composers confuse AMs | Ours is reachable only from the command menu and is labelled. Revisit after it is in front of users. |
| Tracking hurts deliverability | Default off, per-send opt-in. |
| Public routes abused | Rate-limit; signed tokens; return the pixel regardless of validity. |
| App can send as any user | Accepted, documented at §4.1. Keep `verifyOwnership` in the patched path. |

---

## 9. Why PR #1 is not the starting point

Keep it open as a **design reference** — parts of it are well engineered, particularly the
server-side signature storage, the pre-enqueue ownership check, and the HMAC-bound redirect.
But it cannot be merged:

1. **It edits fork source that production never builds** (§2). All 45 files are under
   `packages/`; zero under `deploy/`. Every line is unshippable here.
2. **Its OpenPhone third is already obsolete** — `main` carries a complete deployable version
   at `deploy/apps/call-recording/`, and PR #1's copy reintroduces a bug that version
   explicitly fixes (it computes the webhook HMAC over a re-serialised body rather than the
   bytes received). Drop those 6 files regardless.
3. **"Herald sends it instead" does not work.** Checked: of Herald's 18 Gmail sending
   accounts, the 8 that work belong to a different tenant's domain, all 5 Pinion ones are in
   `ERROR`, and **none of the AM mailboxes exist in Herald at all**. Herald cannot send as
   `aaron@`, `kate@`, `jim@` or `jason@pinionpartners.co`.

Also unfixed in PR #1 if anyone revives it: a spec file importing two non-existent paths (so
it has never executed, despite a commit message claiming "42 specs pass"), stale generated
GraphQL types worked around by hand-rolled types, and an unused import that fails lint.

---

## 10. Reference

| Thing | Where |
|---|---|
| Overlay mechanism | `deploy/branding/README.md`, `deploy/branding/Dockerfile` |
| Patch examples | `deploy/branding/{row-security,google-apis-oauth,email-gate}/` |
| App examples | `deploy/apps/call-recording/`, `~/Projects/pinion-lead-lookup` |
| Row-security rules | `deploy/branding/row-security/rules.js` |
| Build + deploy | `deploy/branding/build-and-deploy.sh` |
| Production | `crm.pinionpartners.co`, image `twentycrm/twenty:v2.39.5-pinion.16` |
| Staging | `crm-staging.pinionpartners.co` |
