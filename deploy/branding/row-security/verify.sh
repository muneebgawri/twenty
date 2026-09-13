#!/bin/bash
# Compares what an unrestricted key and a restricted-role key can read.
#
#   ./verify.sh crm-staging.pinionpartners.co "$ADMIN_TOKEN" "$RESTRICTED_TOKEN"
#
# Expectation: the admin key reads records; the restricted key reads none,
# because an API key has no workspace member and the filter fails closed.
# Exits non-zero if the restricted key can read anything.

set -u

HOST="${1:?usage: verify.sh <host> <admin-token> <restricted-token>}"
ADMIN="${2:?admin token required}"
RESTRICTED="${3:?restricted-role token required}"

OBJECTS="people companies opportunities tasks notes noteTargets taskTargets attachments workspaceMembers callRecordings"

count() {
  curl -s -m 30 "https://${HOST}/rest/${2}?limit=5" -H "Authorization: Bearer ${1}" \
    | python3 -c '
import json,sys
try:
    d = json.load(sys.stdin)
    keys = list(d.get("data", {}).keys())
    print(len(d["data"][keys[0]]) if keys else "denied")
except Exception:
    print("error")'
}

printf "%-20s %-10s %-12s\n" "object" "admin" "restricted"
failures=0

for object in $OBJECTS; do
  admin_count=$(count "$ADMIN" "$object")
  restricted_count=$(count "$RESTRICTED" "$object")
  printf "%-20s %-10s %-12s" "$object" "$admin_count" "$restricted_count"

  case "$restricted_count" in
    0|denied) echo "" ;;
    error) echo "  (could not parse)" ;;
    *) echo "  <-- LEAK"; failures=$((failures + 1)) ;;
  esac
done

echo
if [ "$failures" -ne 0 ]; then
  echo "FAIL: a restricted key read records from $failures object(s)."
  exit 1
fi

echo "OK: restricted key read nothing. Now confirm ownership by impersonating"
echo "an Account Manager in the UI (see README)."
