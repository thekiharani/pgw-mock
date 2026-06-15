# Engineering conventions

Conventions every change in this repo must follow. Keep this file short and
authoritative; update it when a convention changes.

## Comments

- Minimal, necessary comments only. Do not narrate what the code already says.
- Comment the non-obvious: why a workaround exists, an external contract, a
  subtle invariant. Never add section banners or restate signatures.

## Database

- **PKs and FKs are UUID v7**, stored as `VARCHAR(36)`. Generate with `uuid7()`
  from `@/utils/generators`.
- **Every other `VARCHAR` length is a power of two** (16, 32, 64, 128, 256,
  512, 1024, ...). The only exception is the `VARCHAR(36)` id/fk columns above.
- Use `TEXT` **only** for truly unbounded columns (opaque tokens, long free
  text, serialized blobs). Never use `TEXT` for values with a known bound.
- **Table names are plural** (`users`, `sessions`, `merchants`, `transactions`).

## Migrations (dbmate)

- Edit the existing migration files in place and re-migrate from scratch
  (`pnpm db:drop && pnpm db:up`). Do **not** add separate ALTER migrations to
  evolve an existing table.
- Group migrations by related tables — one domain per file (e.g. `merchants`,
  `transactions`, `auth`). Never bundle the whole schema into one file.
- Keep the Drizzle models in `src/db/schema.ts` in sync with the SQL.

## Repository layout

Two independent apps (not a monorepo / workspace) plus shared types:

- `api/` — Fastify service (mock gateways + management API).
- `dashboard/` — Vite + React admin UI.
- `shared/` — framework-agnostic TS types, imported as `@shared/*` (→ `../shared`).

Each app installs, builds, and runs on its own. Run commands from inside the
relevant app directory.
