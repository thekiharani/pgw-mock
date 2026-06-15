# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24-slim

# Shared toolchain. tini is copied into the distroless runtime as PID 1.
FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Bundle source, then nft-trace only the deps actually used into /app/api/prod.
# Repo layout is preserved (api/ alongside shared/) so the `@shared/*` -> ../shared
# tsconfig path alias resolves at bundle time.
FROM base AS build
WORKDIR /app/api
COPY api/package.json api/pnpm-lock.yaml* api/pnpm-workspace.yaml ./
COPY api/patches ./patches
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY shared /app/shared
COPY api/tsconfig.json ./
COPY api/scripts ./scripts
COPY api/src ./src
RUN pnpm build && node scripts/trace-prod.mjs

# Build the dashboard SPA (Vite). shared/ sits alongside for the @shared/* alias.
FROM base AS dashboard-build
WORKDIR /app/dashboard
COPY dashboard/package.json dashboard/pnpm-lock.yaml* dashboard/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY shared /app/shared
COPY dashboard/ ./
RUN pnpm build

# API: distroless (Debian/glibc, no shell), nonroot uid 65532.
FROM gcr.io/distroless/nodejs24-debian12 AS runtime
ENV NODE_ENV=production \
    APP_HOST=0.0.0.0 \
    APP_PORT=4200 \
    SERVE_DASHBOARD=true \
    DASHBOARD_DIST=/app/public
WORKDIR /app
COPY --from=base /usr/bin/tini /usr/bin/tini
COPY --link --from=build --chown=65532:65532 /app/api/prod ./
COPY --link --from=dashboard-build --chown=65532:65532 /app/dashboard/dist /app/public
USER 65532:65532
EXPOSE 4200
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:'+(process.env.APP_PORT||4200)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--", "/nodejs/bin/node"]
CMD ["dist/index.js"]

# Migrator: official multi-arch dbmate binary; `--wait` blocks until the DB is up.
FROM ghcr.io/amacneil/dbmate:2 AS dbmate-bin
FROM gcr.io/distroless/static-debian12 AS migrator
COPY --from=dbmate-bin /usr/local/bin/dbmate /usr/local/bin/dbmate
COPY api/db/migrations /db/migrations
ENV DBMATE_MIGRATIONS_DIR=/db/migrations \
    DBMATE_NO_DUMP_SCHEMA=true
WORKDIR /db
ENTRYPOINT ["/usr/local/bin/dbmate"]
CMD ["--wait", "up"]
