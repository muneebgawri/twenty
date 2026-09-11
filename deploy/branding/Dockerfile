# Pinion CRM branding overlay on top of the official Twenty image.
# Builds a thin layer that patches branded strings + drops in Pinion icons.
#
# Build:  docker build --build-arg TWENTY_VERSION=v2.2.0 -t twentycrm/twenty:v2.2.0-pinion .
# Used by /opt/twenty/docker-compose.yml (image: line points at the -pinion tag).
#
# Text patches are applied via sed and manifest.json is replaced. The icon
# ladder is rasterized from pinion-favicon.svg in the icon-gen stage below.
#
# Upgrade workflow on a new Twenty release:
#   1. Bump TWENTY_VERSION arg + Twenty's official image tag in docker-compose
#   2. Re-run this build — Dockerfile re-pulls upstream + re-applies overlay
#   3. docker compose up -d --force-recreate server worker
#   4. Smoke-test the public-facing email templates + browser tab title
#
# Maintenance: sed expressions in email-patches.sed may drift if Twenty refactors
# string IDs; verify each upgrade with `grep -c "Twenty"` before/after.

ARG TWENTY_VERSION=v2.2.0

# ============================================================================
# Stage A: rasterize pinion-favicon.svg into the full Android + iOS PNG ladder
# Twenty's manifest.json + index.html reference fixed filenames per device family.
# ============================================================================
FROM alpine:3.19 AS icon-gen
RUN apk add --no-cache imagemagick librsvg
COPY pinion-favicon.svg /work/pinion-favicon.svg
RUN mkdir -p /out/android /out/ios && \
    for size in 48 72 96 144 192 512; do \
      convert -density 600 -background none /work/pinion-favicon.svg \
        -resize ${size}x${size} \
        /out/android/android-launchericon-${size}-${size}.png; \
    done && \
    for size in 16 20 29 32 40 50 57 58 60 64 72 76 80 87 100 114 120 128 144 152 167 180 192 256 512 1024; do \
      convert -density 600 -background none /work/pinion-favicon.svg \
        -resize ${size}x${size} \
        /out/ios/${size}.png; \
    done

# ============================================================================
# Stage B: Pinion overlay on Twenty
# ============================================================================
FROM twentycrm/twenty:${TWENTY_VERSION}

# 1. index.html — patch only the branded strings; keep version-hashed asset refs intact
RUN sed -i \
      -e 's|<title>Twenty</title>|<title>Pinion CRM</title>|' \
      -e 's|content="A modern open-source CRM"|content="Pinion CRM - Pinion Newswire customer relationship platform"|g' \
      -e 's|content="Twenty"|content="Pinion CRM"|g' \
      -e 's|content="https://raw.githubusercontent.com/twentyhq/twenty/main/docs/static/img/social-card.png"|content="/images/icons/android/android-launchericon-512-512.png"|g' \
      -e 's|<!-- BEGIN: Twenty Config -->|<!-- BEGIN: Pinion Config -->|' \
      -e 's|<!-- END: Twenty Config -->|<!-- END: Pinion Config -->|' \
      /app/packages/twenty-server/dist/front/index.html

# 2. manifest.json — full replace (no version-hashed refs inside)
COPY manifest.json /app/packages/twenty-server/dist/front/manifest.json

# 3. Email templates + i18n strings — apply sed patches across multiple bundles.
#
# Three locations need patching, discovered iteratively 2026-05-08:
#   a) twenty-emails/dist/index.mjs — the React Email bundle (body templates)
#   b) twenty-emails/dist/locales/generated/*.{js,mjs} — Lingui locale strings
#      consumed by the email body. Twenty bundles BOTH .js (CJS) and .mjs (ESM)
#      variants per locale; the runtime picks ESM, so patching only .js misses
#      the loaded copy.
#   c) twenty-server/dist/engine/core-modules/i18n/locales/generated/*.{js,mjs}
#      — server-side i18n strings that build email SUBJECTS (the body comes
#      from twenty-emails, but the subject is constructed in the server's
#      WorkspaceInvitationService and other email-sending services). Missed
#      this initially; subject "Join your team on Twenty" survived even after
#      twenty-emails patches landed.
#
# Patch all .js + .mjs files in both locale directories — English sed is
# harmless on other-language files (strings won't match).
COPY email-patches.sed /tmp/pinion-email-patches.sed
RUN find /app/packages/twenty-emails/dist \
      /app/packages/twenty-server/dist/engine/core-modules \
      \( -name "*.js" -o -name "*.mjs" \) \
      ! -name "*.js.map" \
      -exec sed -i -f /tmp/pinion-email-patches.sed {} +

# 4. Stage-2: Pinion icons rasterized from the SVG in Stage A
COPY --from=icon-gen /out/android/ /app/packages/twenty-server/dist/front/images/icons/android/
COPY --from=icon-gen /out/ios/     /app/packages/twenty-server/dist/front/images/icons/ios/

# 5. Bug fix: app front-component widgets render "No Data" on record pages.
#
# FrontComponentWidgetRenderer only accepts a configuration whose __typename is
# "FrontComponentConfiguration". Record pages are fed from the flat metadata
# store, whose configurations carry configurationType but no __typename, so
# every app widget on a record page (e.g. the OpenPhone call-recording player)
# falls through to the "No Data" placeholder. Still present on upstream main as
# of 2026-09. This also accepts configurationType === "FRONT_COMPONENT".
#
# The bundle is minified, so identifiers are matched generically. The build fails
# unless exactly one site is patched: if an upgrade moves or fixes this code,
# re-check upstream and drop or adjust the patch instead of shipping silently.
RUN set -eu; \
    cd /app/packages/twenty-server/dist/front/assets; \
    pattern='!([A-Za-z_$][A-Za-z0-9_$]*)\(([A-Za-z_$][A-Za-z0-9_$]*),"FrontComponentConfiguration"\)\)return'; \
    files=$(grep -lE "$pattern" -- *.js || true); \
    count=$(grep -ohE "$pattern" -- *.js | wc -l); \
    if [ "$count" -ne 1 ]; then \
      echo "front-component widget patch: expected 1 match, found $count" >&2; exit 1; \
    fi; \
    sed -i -E "s/$pattern/!(\1(\2,\"FrontComponentConfiguration\")||\2?.configurationType===\"FRONT_COMPONENT\"))return/" $files; \
    grep -qF '?.configurationType==="FRONT_COMPONENT"))return' $files; \
    echo "front-component widget patch applied to $files"

# Marker — Docker image label so we can tell at a glance that the overlay
# is applied. (Non-root user inside the image can't write to /app, so we
# use LABEL metadata instead of a marker file.)
# Inspect with: docker image inspect <tag> --format '{{.Config.Labels}}'
LABEL co.pinion.branding-stage="stage2"
LABEL co.pinion.branding-applied-on="2026-05-08"
LABEL co.pinion.patches="front-component-widget-typename"
