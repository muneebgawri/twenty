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

set -euo pipefail

TWENTY_VERSION="${1:-v2.2.0}"
REVISION="${2:-}"
PINION_SUFFIX="${TWENTY_VERSION}-pinion${REVISION:+.${REVISION}}"
PINION_TAG="twentycrm/twenty:${PINION_SUFFIX}"
COMPOSE_FILE="/opt/twenty/docker-compose.yml"

echo "=== Building ${PINION_TAG} from ${TWENTY_VERSION} ==="
cd "$(dirname "$0")"
docker build \
  --build-arg TWENTY_VERSION="${TWENTY_VERSION}" \
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

echo
echo "=== Updating /opt/twenty/.env TAG → ${PINION_SUFFIX} ==="
ENV_FILE=/opt/twenty/.env
if sudo grep -qE "^TAG=${PINION_SUFFIX}\$" "${ENV_FILE}"; then
  echo "  TAG already set to ${PINION_SUFFIX}, no edit needed"
else
  sudo cp "${ENV_FILE}" "${ENV_FILE}.pre-pinion-$(date -u +%Y%m%dT%H%M%SZ)"
  sudo sed -i -E "s|^TAG=.*|TAG=${PINION_SUFFIX}|" "${ENV_FILE}"
  echo "  updated; backup saved as ${ENV_FILE}.pre-pinion-*"
  echo "  new TAG line:"
  sudo grep "^TAG=" "${ENV_FILE}"
fi

echo
echo "=== Restarting server + worker with new image ==="
cd /opt/twenty
docker compose up -d --force-recreate --no-deps server worker

echo
echo "=== Done. Wait ~3 minutes for Twenty's first-boot cycle, then verify: ==="
echo "  - browser tab title should read 'Pinion CRM' at https://crm.pinionpartners.co"
echo "  - send a test invite via Twenty UI and confirm email subject + body say 'Pinion CRM'"
echo "  - check the running image carries the overlay label (expects stage2):"
echo "      docker inspect \$(docker compose -f ${COMPOSE_FILE} ps -q server) --format '{{index .Config.Labels \"co.pinion.branding-stage\"}}'"
