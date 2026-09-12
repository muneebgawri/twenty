# Upgrading Twenty (self-hosted)

Written while upgrading staging from v2.2.0 to v2.39.5 on 2026-09-12.

## Do not set ENCRYPTION_KEY before the first boot on v2.5+

Upstream's upgrade guide says to set a dedicated `ENCRYPTION_KEY` **before**
upgrading. Doing that **silently corrupts every secret** stored before v2.5.

Why: the v2.5 backfill reads pre-v2.5 rows with the legacy AES-CTR path, and
that path uses only the *primary* key — `ENCRYPTION_KEY` when set, otherwise
`APP_SECRET`. It never tries `FALLBACK_ENCRYPTION_KEY`. Old rows were encrypted
with `APP_SECRET`, and AES-CTR has no integrity tag, so decrypting with the
wrong key does not fail: it returns garbage, which the backfill then re-encrypts.

What it looks like afterwards: OAuth tokens, app variables and signing keys
decrypt to binary junk. A logic function whose app variable is corrupted dies
before its own code runs, e.g.

    TypeError [ERR_INVALID_ARG_VALUE]: The property 'options.env['SOME_KEY']'
    must be a string without null bytes.

There is no way back without a database restore: the plaintext is gone.

**Correct order**

1. Upgrade with `ENCRYPTION_KEY` unset, so `APP_SECRET` stays the primary key.
   The backfill decrypts correctly and re-encrypts into the `enc:v2` envelope.
2. Then move to a dedicated key:
   - `ENCRYPTION_KEY=<new>` and `FALLBACK_ENCRYPTION_KEY=<the APP_SECRET value>`
   - restart, then `yarn command:prod secret-encryption:rotate --dry-run`
   - run it for real; a re-run should report `rotated=0`
   - remove `FALLBACK_ENCRYPTION_KEY` and restart.

Setting `ENCRYPTION_KEY` changes the session-cookie secret, so everyone is
signed out once.

## Other notes from the 2.2 -> 2.39 upgrade

- **Back up first.** `pg_dumpall` plus copies of `.env` and `docker-compose.yml`.
  The only fix for a bad secret backfill is restoring the dump.
- **Cross-version upgrades are supported from v1.23**, so 2.2 -> 2.39 in one
  step is fine. Migrations ran for about 4 minutes on a small database; a large
  one takes longer. Budget more than the usual restart window.
- **Postgres 15+ is required from v2.34.**
- **`docker compose up -d server worker` gives up on the worker** while the
  server is still booting (it waits for health). Start the server, wait for
  healthy, then start the worker.
- **`callRecording` became a standard object in v2.10.** An app-defined object
  with that name is renamed to `callRecordingOld` ("Call Recording (Old)")
  during the upgrade. Apps that wrote to it must be reworked to use the
  standard object (see `deploy/apps/call-recording`).
- **Check the branding overlay's patch counts after each upgrade.** New
  upstream strings appear; the build prints how many were replaced and fails if
  the front-component patch no longer matches exactly one site.
- **Verify before and after with a schema check.** Validating the GraphQL
  operations another service sends (Herald) against the old and new schemas
  catches renamed or removed fields without touching production.
