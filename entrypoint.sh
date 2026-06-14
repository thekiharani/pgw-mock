#!/bin/sh
set -eu

APP_HOST="${APP_HOST:-0.0.0.0}"
APP_PORT="${APP_PORT:-4002}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_WAIT_TIMEOUT_SECONDS="${DB_WAIT_TIMEOUT_SECONDS:-60}"
DB_WAIT_INTERVAL_SECONDS="${DB_WAIT_INTERVAL_SECONDS:-2}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-false}"
WAIT_FOR_DB="${WAIT_FOR_DB:-false}"

wait_for_db() {
  deadline=$(( $(date +%s) + DB_WAIT_TIMEOUT_SECONDS ))
  while ! node -e "require('net').createConnection(${DB_PORT},'${DB_HOST}').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" 2>/dev/null; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "Database ${DB_HOST}:${DB_PORT} not reachable within ${DB_WAIT_TIMEOUT_SECONDS}s" >&2
      exit 1
    fi
    sleep "$DB_WAIT_INTERVAL_SECONDS"
  done
}

if [ "$WAIT_FOR_DB" = "true" ] || [ "$RUN_MIGRATIONS" = "true" ]; then
  wait_for_db
fi

if [ "$RUN_MIGRATIONS" = "true" ]; then
  DBMATE_MIGRATIONS_DIR="${DBMATE_MIGRATIONS_DIR:-./db/migrations}" \
  DBMATE_NO_DUMP_SCHEMA=true \
  dbmate up
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec node dist/index.js
