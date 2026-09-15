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

## Deploys: why a slow boot looked like a broken image (2026-09-15)

An overlay-only revision (`pinion.6` → `pinion.7`, same Twenty version) took
crm.pinionpartners.co down for about ten minutes. Nothing was wrong with the
image.

**What happens on every `docker compose up --force-recreate`:** the container
entrypoint runs `cache:flush` → `command:prod upgrade` → `cache:flush` →
`cron:register:all` *before* the server binds `:3000`. On this database that is
5+ minutes of 502s. Each step spawns its own Node process, so the logs go quiet
and the container reports `Running=true, ExitCode=0, Restarts=0` throughout —
indistinguishable from healthy at a glance, and indistinguishable from wedged.

**Why it read as a failure:** the compose healthcheck was `interval: 5s,
retries: 20` — a 100-second budget. Boot blew through it, the container was
marked `unhealthy`, the worker's `depends_on` gave up, and `docker compose up`
exited with `dependency failed to start: container twenty-server-1 is
unhealthy`. That message describes a crash. This was not a crash.

**What made it worse:** rolling back. The rollback recreates the container,
which restarts the same boot cycle, paying the outage a second time. The
rollback "failing" the same way is in fact the clearest evidence the image is
*not* the problem — if a known-good tag fails identically, look at the
environment, not the artifact.

Three fixes, all in place:

1. `start_period: 600s` on the server healthcheck in
   `/opt/twenty/docker-compose.yml`. Failures inside that window no longer
   count, so a migrating boot is not reported as unhealthy. **This file lives
   only on the VPS** — re-apply it if the compose file is ever replaced.
2. `build-and-deploy.sh` no longer relies on compose's gate. It starts the
   server alone, polls `/healthz` itself for up to `READY_DEADLINE` (900s),
   prints which entrypoint step is running each time it checks, and starts the
   worker only once the server answers. If the deadline passes it rolls back to
   the previous TAG automatically and says so.
3. `build-and-deploy.sh` skips the migration cycle for overlay-only revisions
   (`DISABLE_DB_MIGRATIONS=true` when the base Twenty version is unchanged), so
   a branding or row-security change restarts in seconds. A version bump still
   runs the full cycle and warns that it will. The flag is reset to `false` on
   exit, so an interrupted run cannot leave migrations disabled for the next
   upgrade.

**Rule of thumb:** before concluding a deploy failed, run
`docker compose exec server ps -o args` and look for
`dist/command/command <step>`. If a step is running, it is working, and
recreating the container only restarts the clock.
