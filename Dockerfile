# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24-slim

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile=false --prod=false

FROM deps AS build
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production \
    APP_HOST=0.0.0.0 \
    APP_PORT=4002 \
    RUN_MIGRATIONS=false \
    WAIT_FOR_DB=false \
    DB_WAIT_TIMEOUT_SECONDS=60 \
    DB_WAIT_INTERVAL_SECONDS=2

# dbmate for migrations/seeding at startup (optional, gated by RUN_MIGRATIONS).
ARG DBMATE_VERSION=2.21.0
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL "https://github.com/amacneil/dbmate/releases/download/v${DBMATE_VERSION}/dbmate-linux-amd64" -o /usr/local/bin/dbmate \
 && chmod +x /usr/local/bin/dbmate \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Production deps only.
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile=false

COPY --from=build /app/dist ./dist
COPY db ./db
COPY --chmod=755 entrypoint.sh ./

RUN groupadd --system app && useradd --system --gid app --create-home app
USER app:app

EXPOSE 4002
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.APP_PORT||4002)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./entrypoint.sh"]
