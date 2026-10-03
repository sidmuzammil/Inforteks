#!/usr/bin/env bash
set -euo pipefail
# The image briefly runs a socket-only server during initdb, before creating
# POSTGRES_DB. A real TCP query waits for initialization and the target DB.
task_database_container="${1:-inforteks-postgres}"
for attempt in {1..60}; do
  if docker exec "$task_database_container" psql -h 127.0.0.1 -U inforteks -d inforteks -Atqc 'SELECT 1' >/dev/null 2>&1; then
    printf '%s\n' 'Development database accepts queries.'
    exit 0
  fi
  sleep 1
done
printf '%s\n' 'Development database did not become ready within 60 attempts.' >&2
exit 1
