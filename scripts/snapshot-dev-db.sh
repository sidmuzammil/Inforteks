#!/usr/bin/env bash
# Preserve only the isolated development database for a cloud filesystem snapshot.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p .data
snapshot_tmp=$(mktemp .data/database-snapshot.XXXXXX)
trap 'rm -f "$snapshot_tmp"' EXIT
docker exec inforteks-postgres pg_dump -U inforteks -d inforteks --no-owner --no-acl > "$snapshot_tmp"
mv "$snapshot_tmp" .data/database-snapshot.sql
printf '%s\n' 'Development database snapshot saved privately in .data/database-snapshot.sql.'
