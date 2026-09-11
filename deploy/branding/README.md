# Pinion CRM branding overlay

Production runs the stock `twentycrm/twenty` image with a thin layer on top.
**It is not built from this fork's source.** This directory is the only thing
needed to rebuild the image production uses (`twentycrm/twenty:v2.2.0-pinion`).

The overlay:
- changes "Twenty" to "Pinion CRM" in the browser title, the OG/Twitter meta
  tags, the PWA manifest, email bodies and email subjects
- replaces the favicon and the PWA icon ladder with icons rasterized from
  `pinion-favicon.svg`

It does not change the in-app top-left logo. That logo is compiled into the
React bundle and would need a source build.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Stage A rasterizes the SVG into the Android and iOS PNG sizes. Stage B is `FROM twentycrm/twenty:${TWENTY_VERSION}` plus the sed patches and COPYs. |
| `email-patches.sed` | String patches for the `twenty-emails` bundle, its locale files, and the server's i18n locale files (the server builds email subjects). |
| `manifest.json` | PWA manifest named Pinion CRM. It replaces the upstream file outright. |
| `pinion-favicon.svg` | Master icon file. |
| `build-and-deploy.sh` | Build, verify, point `/opt/twenty/.env` `TAG` at the new tag, then recreate the server and worker. |

## Rebuild or upgrade

Run this on the CRM host, from a copy of this directory:

```bash
bash build-and-deploy.sh v2.2.0      # or the new upstream version
```

The script rebuilds from the new upstream tag and re-applies every patch.
Upstream changes can break the overlay without any error, so check these after
each upgrade:

- **Email strings.** If Twenty rewords its text, `email-patches.sed` stops
  matching and the old text comes back. Compare
  `grep -c "Twenty"` and `grep -c "Pinion CRM"` on
  `/app/packages/twenty-emails/dist/index.mjs`. The script prints both counts.
- **index.html.** Upstream may add new branded `<meta>` tags. Add sed
  expressions for them in the Dockerfile.
- **manifest.json.** Upstream may add new icon paths.

Twenty's upgrade commands refuse to downgrade. Take a database snapshot before
you point `TAG` at a new version.

## Verify

```bash
docker image inspect twentycrm/twenty:v2.2.0-pinion \
  --format '{{index .Config.Labels "co.pinion.branding-stage"}}'   # stage2
```

In a browser, the tab title should read "Pinion CRM". Send a test invite and
check that its subject and body say "Pinion CRM".

## Rollback

`build-and-deploy.sh` backs up `.env` before it changes `TAG` (the backup is
`.env.pre-pinion-<timestamp>`). To roll back, restore that file and run
`docker compose up -d --force-recreate --no-deps server worker`.
