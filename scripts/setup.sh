#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# The existing checkout is already isolated. Do not create a worktree.
task_root="$PWD"
export XDG_DATA_HOME="${XDG_DATA_HOME:-$task_root/.data/xdg-data}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$task_root/.data/cache}"
export PNPM_HOME="${PNPM_HOME:-$task_root/.data/pnpm}"
mkdir -p "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$PNPM_HOME" .data/uploads
if ! command -v pnpm >/dev/null; then
  npm install --prefix .data/package-manager pnpm@11.19.0
  export PATH="$task_root/.data/package-manager/node_modules/.bin:$PATH"
fi
pnpm install --frozen-lockfile
python3 scripts/install-prisma-engine.py
python3 - <<'PY'
from pathlib import Path
import secrets
p = Path('.env')
if not p.exists():
    p.write_text('DATABASE_URL=postgresql://inforteks@127.0.0.1:5432/inforteks\nBETTER_AUTH_SECRET=' + secrets.token_urlsafe(48) + '\nBETTER_AUTH_URL=http://localhost:3000\nNEXT_PUBLIC_APP_URL=http://localhost:3000\nSTORAGE_DRIVER=local\nUPLOAD_DIR=.data/uploads\nEMAIL_PROVIDER=development\nDEV_PAYMENT_SIMULATOR=true\nOFFLINE_PAYMENTS_ENABLED=false\n')
    p.chmod(0o600)
contents = p.read_text()
if 'PRISMA_SCHEMA_ENGINE_BINARY=' not in contents:
    p.write_text(contents.rstrip() + '\nPRISMA_SCHEMA_ENGINE_BINARY=.data/tools/schema-engine\n')
PY
node --input-type=module <<'JS'
import "dotenv/config";
if (process.env.NODE_ENV === "production") throw new Error("setup.sh is for local development only.");
for (const key of ["DATABASE_URL", "DIRECT_DATABASE_URL"]) {
  if (!process.env[key] && key === "DIRECT_DATABASE_URL") continue;
  const url = new URL(process.env[key] ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/inforteks") {
    throw new Error(`${key} must point to the local inforteks development database before running setup.sh.`);
  }
}
JS
if docker container inspect inforteks-postgres >/dev/null 2>&1; then
  docker start inforteks-postgres >/dev/null
else
  docker compose up -d postgres
fi
bash scripts/wait-dev-db.sh
# Docker processes/volumes may not survive cloud filesystem restoration. Only
# restore a saved development snapshot into an empty local database.
table_count=$(docker exec inforteks-postgres psql -U inforteks -d inforteks -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
if [[ "$table_count" == "0" && -s .data/database-snapshot.sql ]]; then
  docker exec -i inforteks-postgres psql -U inforteks -d inforteks --set ON_ERROR_STOP=1 < .data/database-snapshot.sql > /dev/null
fi
pnpm db:generate
pnpm db:migrate
pnpm db:seed
bash scripts/snapshot-dev-db.sh
printf '%s\n' 'Setup complete. Start the web app with pnpm dev and the worker with pnpm worker.'
