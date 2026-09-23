#!/bin/bash
# Build the Pinion-branded Twenty image and deploy it.
#
# Run from the VPS at /opt/twenty-branding/. Idempotent — re-runs on each Twenty
# upgrade. Doesn't touch DB or the worker container's config; only the server
# image tag.
#
# Args:
#   $1  TWENTY_VERSION  (default: v2.2.0)
#   $2  REVISION        (optional) overlay revision, e.g. 2 -> v2.2.0-pinion.2.
#                       Use a new revision whenever the overlay changes so the
#                       previous image stays on disk for a one-line rollback.
#
# Flags:
#   --update        fast-forward the checkout to OVERLAY_REF before building
#   --build-dirty   build from the working tree even though it has uncommitted
#                   changes; the image is stamped <sha>-dirty
#
# Env:
#   OVERLAY_REF     what the checkout should match (default: origin/main)

set -euo pipefail

ARGS=()
ALLOW_DIRTY=0
ALLOW_BEHIND=0
for a in "$@"; do
  case "$a" in
    --update)      ALLOW_BEHIND=1 ;;
    --build-dirty) ALLOW_DIRTY=1 ;;
    --*)           echo "unknown flag: $a" >&2; exit 2 ;;
    *)             ARGS+=("$a") ;;
  esac
done

TWENTY_VERSION="${ARGS[0]:-v2.2.0}"
REVISION="${ARGS[1]:-}"
OVERLAY_REF="${OVERLAY_REF:-origin/main}"
PINION_SUFFIX="${TWENTY_VERSION}-pinion${REVISION:+.${REVISION}}"
PINION_TAG="twentycrm/twenty:${PINION_SUFFIX}"
COMPOSE_FILE="/opt/twenty/docker-compose.yml"

cd "$(dirname "$0")"

# ---------------------------------------------------------------------------
# Is this tree the source of truth, or a copy of one?
#
# This directory used to be a hand-made copy of deploy/branding/, and it drifted
# in both directions. 2026-09-21: the box had a google-apis-oauth stage the repo
# did not, and syncing the repo over it dropped that patch from two builds.
# 2026-09-24: rules.js on the box was two commits behind, so a build would have
# shipped a stale ruleset. Neither showed up anywhere — the image builds, boots,
# passes its health check, and serves traffic with the difference in it.
#
# It is a git checkout now, so the tree either matches a commit or says why not.
# Note what this deliberately does NOT do: it never discards local work. A blind
# `git reset --hard` here is precisely what caused the 2026-09-21 loss. Dirty
# means stop and let a human decide; --build-dirty proceeds and brands the image
# so the decision is not forgotten.
# ---------------------------------------------------------------------------
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "REFUSING TO BUILD — $(pwd) is not a git checkout."
  echo "The overlay must be built from a tree git can account for. Clone it:"
  echo "    git clone --filter=blob:none --sparse https://github.com/muneebgawri/twenty.git /opt/twenty-overlay"
  echo "    git -C /opt/twenty-overlay sparse-checkout set deploy/branding"
  exit 1
fi

echo "=== Checking the overlay tree against ${OVERLAY_REF} ==="
git fetch --quiet origin || echo "  (fetch failed — checking against the last known ${OVERLAY_REF})"

DIRTY="$(git status --porcelain -- .)"
if [ -n "${DIRTY}" ]; then
  if [ "${ALLOW_DIRTY}" = 1 ]; then
    echo "  building from a DIRTY tree (--build-dirty). The image will be stamped -dirty:"
    echo "${DIRTY}" | sed 's/^/    /'
  else
    echo "REFUSING TO BUILD — uncommitted changes in $(pwd):"
    echo "${DIRTY}" | sed 's/^/    /'
    echo
    echo "Commit and push them, or pass --build-dirty to build them as-is."
    echo "This script will not discard your work for you."
    exit 1
  fi
fi

if git rev-parse --verify --quiet "${OVERLAY_REF}" >/dev/null; then
  BEHIND="$(git rev-list --count "HEAD..${OVERLAY_REF}" -- . || echo 0)"
  if [ "${BEHIND}" != "0" ]; then
    if [ "${ALLOW_BEHIND}" = 1 ]; then
      echo "  fast-forwarding to ${OVERLAY_REF} (--update)"
      git merge --ff-only "${OVERLAY_REF}"
    else
      echo "REFUSING TO BUILD — ${BEHIND} commit(s) behind ${OVERLAY_REF} in this directory:"
      git log --oneline "HEAD..${OVERLAY_REF}" -- . | sed 's/^/    /'
      echo
      echo "Pass --update to fast-forward first, or set OVERLAY_REF to build an older ref."
      exit 1
    fi
  fi
fi

OVERLAY_SHA="$(git rev-parse --short=12 HEAD)"
[ -n "${DIRTY}" ] && OVERLAY_SHA="${OVERLAY_SHA}-dirty"
OVERLAY_BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "  overlay ${OVERLAY_SHA}"

echo
echo "=== Building ${PINION_TAG} from ${TWENTY_VERSION} ==="
docker build \
  --build-arg TWENTY_VERSION="${TWENTY_VERSION}" \
  --build-arg OVERLAY_SHA="${OVERLAY_SHA}" \
  --build-arg OVERLAY_BUILT_AT="${OVERLAY_BUILT_AT}" \
  -t "${PINION_TAG}" \
  .

echo
echo "=== Verifying overlay labels ==="
docker image inspect "${PINION_TAG}" --format '{{json .Config.Labels}}' | python3 -m json.tool

echo
echo "=== Verifying email patches landed (overriding entrypoint to avoid DB init) ==="
echo "Twenty references remaining in email bundle (should be small, only URL/asset strings):"
docker run --rm --entrypoint /bin/sh "${PINION_TAG}" \
  -c 'grep -c "Twenty" /app/packages/twenty-emails/dist/index.mjs' || true
echo "Pinion CRM references in email bundle (should be > 10):"
docker run --rm --entrypoint /bin/sh "${PINION_TAG}" \
  -c 'grep -c "Pinion CRM" /app/packages/twenty-emails/dist/index.mjs' || true

ENV_FILE=/opt/twenty/.env
PREV_TAG="$(sudo grep -E '^TAG=' "${ENV_FILE}" | cut -d= -f2-)"
PREV_BASE="${PREV_TAG%%-pinion*}"

# ---------------------------------------------------------------------------
# Did this build LOSE a patch the running image has?
#
# Every overlay lands as /app/pinion-<name>. The set in the new image must be a
# superset of the set in the one it replaces — a patch that silently disappears
# is the worst kind of regression, because the image builds, boots, passes its
# health check and serves traffic with a feature quietly gone.
#
# 2026-09-21: exactly that happened. google-apis-oauth was deployed to this box
# from an unmerged branch, so /opt/twenty-branding/Dockerfile had the stage and
# the git repo did not. Syncing the repo's Dockerfile over it to add a different
# patch dropped the Google one from pinion.14 and .15, and nothing noticed for
# two builds. It was dormant (its env vars are unset) so nothing broke, which is
# precisely why it would have stayed lost.
# ---------------------------------------------------------------------------
patches_in() {
  docker run --rm --entrypoint sh "$1" -c 'ls -d /app/pinion-* 2>/dev/null | xargs -n1 basename' 2>/dev/null | sort
}

# PREV_TAG is the bare tag from .env ("v2.39.5-pinion.15"), not a reference docker can
# resolve. The first version of this check passed it to `docker image inspect` as-is, which
# always failed, so the guard skipped every time and said so in one line nobody reads. A
# check that silently does nothing is the failure it exists to prevent.
PREV_IMAGE="twentycrm/twenty:${PREV_TAG}"

if docker image inspect "${PREV_IMAGE}" >/dev/null 2>&1; then
  echo
  echo "=== Checking no overlay was lost against ${PREV_IMAGE} ==="
  MISSING="$(comm -23 <(patches_in "${PREV_IMAGE}") <(patches_in "${PINION_TAG}"))"
  if [ -n "${MISSING}" ]; then
    echo "REFUSING TO DEPLOY — these overlays are in ${PREV_IMAGE} but not in ${PINION_TAG}:"
    echo "${MISSING}" | sed 's/^/    /'
    echo "Someone's patch is missing from the Dockerfile. Find it before shipping."
    exit 1
  fi
  patches_in "${PINION_TAG}" | sed 's/^/    ok  /'
else
  echo "(${PREV_IMAGE} not present locally — skipping the lost-overlay check)"
fi

# ---------------------------------------------------------------------------
# Does this deploy need Twenty's migration cycle?
#
# The entrypoint runs cache:flush -> upgrade -> cache:flush -> cron:register
# BEFORE the server binds :3000. On this database that is 5+ minutes during
# which the site returns 502. An overlay-only revision (same Twenty version,
# new -pinion.N) changes no schema and no workspace metadata, so that cycle is
# pure downtime for nothing. A version bump genuinely needs it.
#
# 2026-09-15: this cost a real outage. pinion.7 was an overlay-only change, ran
# the full cycle, tripped the compose health gate, and was misread as a broken
# image — the rollback then paid the same 5 minutes over again.
# ---------------------------------------------------------------------------
if [ "${TWENTY_VERSION}" = "${PREV_BASE}" ]; then
  MIGRATIONS="skip"
  echo "=== Overlay-only deploy (${PREV_TAG} -> ${PINION_SUFFIX}, same ${TWENTY_VERSION}) ==="
  echo "    Skipping the migration cycle: restart is seconds, not minutes."
else
  MIGRATIONS="run"
  echo "=== VERSION BUMP: ${PREV_BASE} -> ${TWENTY_VERSION} ==="
  echo "    Running the full migration cycle. EXPECT 5+ MINUTES OF 502s."
  echo "    Read deploy/UPGRADE.md first if you have not."
fi

# The resting value must always be false, so a later run that needs migrations
# gets them even if this one is interrupted.
restore_migrations_flag() {
  sudo sed -i -E "s|^DISABLE_DB_MIGRATIONS=.*|DISABLE_DB_MIGRATIONS=false|" "${ENV_FILE}" || true
}
trap restore_migrations_flag EXIT

set_env_var() {
  local key="$1" value="$2"
  if sudo grep -qE "^${key}=" "${ENV_FILE}"; then
    sudo sed -i -E "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
  else
    echo "${key}=${value}" | sudo tee -a "${ENV_FILE}" >/dev/null
  fi
}

echo
echo "=== Updating ${ENV_FILE} TAG → ${PINION_SUFFIX} ==="
sudo cp "${ENV_FILE}" "${ENV_FILE}.pre-pinion-$(date -u +%Y%m%dT%H%M%SZ)"
set_env_var TAG "${PINION_SUFFIX}"
[ "${MIGRATIONS}" = "skip" ] && set_env_var DISABLE_DB_MIGRATIONS true
sudo grep -E '^(TAG|DISABLE_DB_MIGRATIONS)=' "${ENV_FILE}" | sed 's/^/  /'

# ---------------------------------------------------------------------------
# Wait for the server to actually serve, and say what it is doing while we wait.
#
# Compose's own gate is `retries: 20` at 5s = 100 seconds, far short of a
# migrating boot, so `docker compose up` reports "dependency failed to start"
# on a deploy that is merely slow. We do not use it: the server is brought up
# alone, polled here, and the worker started only once the server answers.
# ---------------------------------------------------------------------------
READY_DEADLINE="${READY_DEADLINE:-900}"

wait_for_server() {
  local waited=0
  while [ "${waited}" -lt "${READY_DEADLINE}" ]; do
    if docker compose exec -T server curl -sf -m 5 http://localhost:3000/healthz >/dev/null 2>&1; then
      echo "  server answering /healthz after ${waited}s"
      return 0
    fi
    # Not ready. Say which entrypoint step is running so a human can tell
    # "working through migrations" from "wedged".
    local step
    step="$(docker compose exec -T server ps -o args 2>/dev/null \
            | grep -oE 'dist/command/command [a-z:]+' | head -1 | awk '{print $2}')"
    echo "  [${waited}s/${READY_DEADLINE}s] not ready${step:+ — running ${step}}"
    sleep 15
    waited=$((waited + 15))
  done
  return 1
}

echo
echo "=== Starting server on ${PINION_SUFFIX} ==="
cd /opt/twenty
docker compose up -d --force-recreate --no-deps server

if wait_for_server; then
  echo
  echo "=== Server healthy — starting worker ==="
  docker compose up -d --force-recreate --no-deps worker
else
  echo
  echo "!!! Server did not answer /healthz within ${READY_DEADLINE}s — ROLLING BACK to ${PREV_TAG}"
  set_env_var TAG "${PREV_TAG}"
  restore_migrations_flag
  docker compose up -d --force-recreate --no-deps server
  if wait_for_server; then
    echo "!!! Rolled back to ${PREV_TAG}; service restored. ${PINION_SUFFIX} left on disk to debug."
  else
    echo "!!! ROLLBACK ALSO FAILED. The problem is NOT the image — check db/redis and"
    echo "!!! 'docker compose logs server'. Do not keep recreating: each recreate"
    echo "!!! restarts the boot cycle and extends the outage."
  fi
  exit 1
fi

echo
echo "=== Verifying the running container ==="
docker compose exec -T server sh -c 'node -e "require(\"/app/pinion-row-security/rules\");console.log(\"  row-security rules load OK\")"' || {
  echo "  !!! row-security module failed to load — restricted roles would silently lose their filter"
  exit 1
}
docker inspect "$(docker compose ps -q server)" \
  --format '  overlay-stage={{index .Config.Labels "co.pinion.branding-stage"}}'
curl -s -o /dev/null -w '  public https %{http_code}\n' -m 20 https://crm.pinionpartners.co/

echo
echo "=== Done. Still worth an eyeball: ==="
echo "  - browser tab title should read 'Pinion CRM' at https://crm.pinionpartners.co"
echo "  - send a test invite and confirm the email says 'Pinion CRM'"
