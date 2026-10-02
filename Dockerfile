FROM node:24.19.0-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates python3 && rm -rf /var/lib/apt/lists/*
# Railway supports cache mounts only. Use the image's trusted CA bundle and
# keep credentials and custom proxy certificates outside the deployment image.
RUN npm install -g pnpm@11.19.0
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN python3 scripts/install-prisma-engine.py
ENV PRISMA_SCHEMA_ENGINE_BINARY=/app/.data/tools/schema-engine
# No live database or provider credentials are required by the build.
RUN pnpm build && cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/

FROM base AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 PRISMA_SCHEMA_ENGINE_BINARY=/app/.data/tools/schema-engine
# Keep Prisma CLI, migrations and worker executable in the same production image.
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["node", ".next/standalone/server.js"]
