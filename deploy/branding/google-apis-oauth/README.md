# Separate Google OAuth client for Gmail and Calendar

Lets "Sign in with Google" keep a minimal-scope consent screen while the
Gmail/Calendar connection uses its own client carrying the mail scopes.

## Why

Twenty reads one credential pair for both flows:

```js
// google-apis-oauth-common.auth.strategy.js (upstream)
clientID:     twentyConfigService.get('AUTH_GOOGLE_CLIENT_ID'),
clientSecret: twentyConfigService.get('AUTH_GOOGLE_CLIENT_SECRET'),
callbackURL:  twentyConfigService.get('AUTH_GOOGLE_APIS_CALLBACK_URL'),
```

The callback URL is already per-flow; only the credentials are shared. Adding
`gmail.readonly` / `gmail.compose` / `gmail.send` to the sign-in client would
show a restricted-scope consent screen to everyone who signs in, which is why
prod deliberately ran a minimal-scope client — and why every mailbox sat at
`FAILED_INSUFFICIENT_PERMISSIONS`: consent succeeded, the token carried no Gmail
scope, the API returned 403.

## What it patches

Four call sites, all on the Google APIs side:

| File | Role |
|---|---|
| `auth/strategies/google-apis-oauth-common.auth.strategy.js` | consent + code exchange |
| `auth/services/google-apis-service-availability.service.js` | availability check on that token |
| `connected-account/refresh-tokens-manager/.../google-api-refresh-tokens.service.js` | access-token refresh |
| `connected-account/oauth2-client-manager/.../google-oauth2-client.provider.js` | client used for Gmail/Calendar calls |

Each becomes `process.env.AUTH_GOOGLE_APIS_<VAR> || <original>`.

**All four have to move together.** The consent flow issues the token and the
other three refresh it and call the APIs with it, so patching only consent hands
out tokens from the new client and then refreshes them with the old one —
`invalid_client` about an hour later, and a silent death identical to the one
this fixes.

`auth/strategies/google.auth.strategy.js` (sign-in) is deliberately **not**
patched, and the build asserts it still reads the shared pair.

## Configuration

```
AUTH_GOOGLE_APIS_CLIENT_ID=<the mail client>
AUTH_GOOGLE_APIS_CLIENT_SECRET=<its secret>
```

Server only — the worker refreshes tokens too, so set it on both. Unset means
both flows share one client, exactly as upstream behaves.

The new GCP client needs redirect URI
`https://crm.pinionpartners.co/auth/google-apis/get-access-token`
(match `AUTH_GOOGLE_APIS_CALLBACK_URL`) and a consent screen listing the scopes
from `get-google-apis-oauth-scopes.js`:

```
gmail.readonly · gmail.compose · gmail.send · calendar.events
email · profile · profile.emails.read
```

That scope list is hard-coded upstream, not conditional on
`MESSAGING_PROVIDER_GMAIL_ENABLED` / `CALENDAR_PROVIDER_GOOGLE_ENABLED`, so the
client must be approved for all of them even if only sending is wanted.
`gmail.readonly` and `gmail.compose` are Google **restricted** scopes, which is
a heavier verification tier than the rest — check Google's current OAuth
verification requirements before committing to a timeline.

## After changing the client

Existing refresh tokens were issued by the old client and cannot be refreshed by
the new one. Every user must reconnect in Settings → Accounts. Nothing is lost
in doing so: as of 2026-09-13 all 18 connected accounts were already broken.

## Verifying

```bash
# the patch is in the image
docker compose exec -T server grep -c AUTH_GOOGLE_APIS_CLIENT_ID \
  /app/packages/twenty-server/dist/engine/core-modules/auth/strategies/google-apis-oauth-common.auth.strategy.js

# sign-in was left alone
docker compose exec -T server grep -c AUTH_GOOGLE_APIS_CLIENT_ID \
  /app/packages/twenty-server/dist/engine/core-modules/auth/strategies/google.auth.strategy.js   # expect 0
```

Then connect one mailbox and confirm `core."messageChannel"` leaves
`FAILED_INSUFFICIENT_PERMISSIONS`:

```sql
select handle, "syncStatus", "syncStage" from core."messageChannel" mc
  join core."connectedAccount" ca on ca.id = mc."connectedAccountId";
```

## On upgrade

The build fails if a call site moved. Do not work around it: re-read the four
files upstream, confirm the credential reads are still one each, and re-fit.
Check too whether upstream has added its own per-flow credentials, which would
make this patch unnecessary.
