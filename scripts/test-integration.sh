#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export XDG_DATA_HOME="${XDG_DATA_HOME:-$PWD/.data/xdg-data}" XDG_CACHE_HOME="${XDG_CACHE_HOME:-$PWD/.data/cache}" PNPM_HOME="${PNPM_HOME:-$PWD/.data/pnpm}"
if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  exists="$(docker exec inforteks-postgres psql -U inforteks -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='inforteks_test'")"
  if [[ "$exists" != "1" ]]; then docker exec inforteks-postgres createdb -U inforteks inforteks_test; fi
  export TEST_DATABASE_URL=postgresql://inforteks@127.0.0.1:5432/inforteks_test
fi
export DATABASE_URL="$TEST_DATABASE_URL"
# Never let an inherited production migration URL override the isolated test DB.
export DIRECT_DATABASE_URL="$TEST_DATABASE_URL"
node --input-type=module <<'JS'
const url = new URL(process.env.TEST_DATABASE_URL ?? "");
if (url.pathname !== "/inforteks_test") {
  throw new Error("Integration migrations require the isolated inforteks_test database.");
}
JS
pnpm db:migrate
pnpm exec vitest run
