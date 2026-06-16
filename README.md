# Noria Payments API Mock (Fastify)

Fastify/TypeScript mock payments gateway for local development, sandboxing, and staging integrations. A faithful port of the FastAPI `payments-api-mock-py` service.

It exposes mock flows for:

- OAuth token generation (Daraja v1/v2)
- M-Pesa-style STK, C2B, B2C, B2B, reversal, account balance, transaction status, QR, tax remittance, B2B Express USSD push, and Standing Orders
- SasaPay-style auth, C2B (incl. wallet OTP), B2C, B2B, bulk, channels, account verify, and transaction status
- SasaPay WaaS onboarding, confirmation, KYC, wallet operations, payments, and reference data
- Daraja Bill Manager
- Mock scenario controls and callback delivery inspection

## Repository layout

Two independent apps in one repo (not a monorepo / pnpm workspace), plus a
shared types directory consumed via a TS path alias:

```
api/         Fastify mock gateway + management API (this service)
dashboard/   Vite + React + TanStack + shadcn admin UI  (see Phase 4)
shared/      Plain TS types shared by both, imported as @shared/* (../shared)
```

Each app installs, builds, and runs on its own. Run API commands from `api/`:

```bash
cd api && pnpm install && pnpm dev
```

### Root scripts (run both apps)

The root `package.json` orchestrates the two apps (it shells into each via
`pnpm --dir` — no workspace linking, still independent):

```bash
pnpm install:all   # install api/ and dashboard/
pnpm dev           # API (:4200) + dashboard (:3200) in parallel (concurrently)
pnpm build         # build dashboard/dist, then the api bundle
pnpm start         # serve the bundled build on :4200 (Fastify serves the SPA + API)
```

In `dev` the dashboard (`:3200`) proxies `/api` → the API (`:4200`). `start`
runs the API with `SERVE_DASHBOARD=true` so a single origin serves both.

### Console access & collaboration

The console is multi-tenant. Each merchant (its M-Pesa paybill + SasaPay till)
is a **resource** owned by the user who created it; sign-in is email-OTP only.

- A signed-in user sees and manages **only the merchants they belong to** — the
  way the Daraja / SasaPay portals work. Creating a merchant makes you its
  `owner`.
- Per-merchant roles: `owner` (full control + delete), `admin` (edit + manage
  members), `member` (rotate credentials + view), `viewer` (read-only).
- Owners/admins can **invite collaborators** by email with a role. The invite
  email carries an accept link (`DASHBOARD_URL/invite/<token>`); the invitee
  signs in via OTP — creating their account if new — and auto-joins. With
  `MAIL_DRIVER=console` the link prints to the server log.
- A user with the **global** role `admin` (seeded `admin@noria.co.ke`) is a
  platform admin and sees/manages every merchant. Admins get an extra **Admin**
  nav section: an **Overview** dashboard (platform-wide totals + recent
  transactions) and **Users** management (search users, promote/demote the
  platform-admin role, and grant/revoke any user's per-merchant access).

Seeded console users: `admin@noria.co.ke` (platform admin), `ops@noria.co.ke`
(owns/co-admins a few merchants), `viewer@noria.co.ke` (viewer on one).

## Stack

- Node 24 · TypeScript (ESM) · pnpm
- **Fastify 5** web framework
- **Zod** + `fastify-type-provider-zod` for request validation
- **Drizzle ORM** (typed queries) on **PostgreSQL** (`pg`)
- **dbmate** for migrations + seeding (raw SQL)
- **Vitest** for tests (Fastify `inject`)

## Requirements

- Node 24+, pnpm 11+
- A PostgreSQL 14+ database
- `dbmate` on PATH (`brew install dbmate`) for migrations

## Quick start

```bash
cd api
pnpm install
cp .env.example .env          # adjust DATABASE_URL to your PostgreSQL
pnpm db:up                    # create schema + seed 250 merchants
pnpm dev                      # starts on http://127.0.0.1:4200
```

## Environment

Configuration is read from environment variables or `.env` (loaded automatically).

```env
APP_HOST=0.0.0.0
APP_PORT=4200
LOG_LEVEL=INFO
SERVICE_URL=http://127.0.0.1:4200
STRICT_PROVIDER_AUTH=true
STRICT_PROVIDER_VALIDATION=true
RELAXED_WAAS_KYC=false
MOCK_CALLBACK_DELAY_SECONDS=0
DASHBOARD_URL=http://localhost:3200   # base for invite accept links (defaults to AUTH_BASE_URL)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/pgw_mock
```

`DATABASE_URL` takes precedence; otherwise the URL is assembled from `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`. A SQLAlchemy-style `+driver` suffix is stripped automatically.

### Mock modes

Defaults are **strict** (contract-faithful):

- `STRICT_PROVIDER_AUTH=true` — bearer tokens must be issued by the mock token endpoints, unexpired, and scoped to the provider/endpoint (a WaaS token can't call SasaPay v1 routes, etc.). Daraja-shaped 401 envelopes are returned for `/mpesa/*` and `/oauth/*`.
- `STRICT_PROVIDER_VALIDATION=true` — Daraja-required fields are enforced (STK, C2B, B2C, B2B, reversal, status, balance). C2B Register URL requires HTTPS callbacks + `ResponseType` and rejects repeat registrations. Reversal validates the original transaction and prevents double-reversal.
- `RELAXED_WAAS_KYC=false` — WaaS Business KYC enforces per-business-type documents.

Set any flag to `false` for permissive local development. STK password validation additionally requires `MPESA_PASSKEY`; B2C/B2B/etc. security-credential validation requires `MPESA_SECURITY_CREDENTIAL`.

## Shortcode capability model

Each M-Pesa shortcode carries explicit capabilities in `merchants.meta.mpesa`:

```json
{ "kind": "TILL" | "PAYBILL", "capabilities": ["c2b", "b2c", "b2b"] }
```

- `kind` drives the valid STK `TransactionType` / C2B `CommandID` pairing (`TILL` → Buy Goods, `PAYBILL` → Pay Bill).
- `capabilities` is any non-empty subset of `c2b`, `b2c`, `b2b` — **one shortcode can bundle 1, 2, or all 3**. Operations are gated per capability:
  - `c2b` → STK push, C2B simulate, C2B register URL, QR
  - `b2c` → B2C payment
  - `b2b` → B2B payment
  - `reversal` → requires `b2c` or `b2b`
  - transaction status / account balance → any onboarded shortcode

Capability mismatches return the Daraja `400.002.02` envelope. Missing metadata defaults to a `PAYBILL` with all three capabilities.

**SasaPay** tills are full-service: every SasaPay merchant carries all three capabilities (`meta.sasapay.capabilities = ["c2b","b2c","b2b"]`) and SasaPay routes are not capability-gated. Only M-Pesa shortcodes restrict to a 1–3 subset.

### Seeded shortcodes

| Range         | Kind         | Capabilities                                                  |
| ------------- | ------------ | ------------------------------------------------------------- |
| 884000–884049 | TILL         | c2b                                                           |
| 885000–885049 | PAYBILL      | b2c, b2b                                                      |
| 886000–886049 | PAYBILL      | c2b                                                           |
| 887000–887049 | PAYBILL      | c2b, b2c, b2b (integrated; first 10 are named demo merchants) |
| 888000–888049 | SasaPay till | —                                                             |

## Database & migrations (dbmate)

```bash
pnpm db:up         # apply migrations (schema + seed)
pnpm db:down       # roll back the latest migration
pnpm db:new name   # scaffold a new migration
```

Migrations live in `db/migrations/`. The schema and the 250-merchant seed are separate raw-SQL migrations. Drizzle (`src/db/schema.ts`) is the typed query layer only.

## Mock control API

Create a scenario override:

```bash
curl -X POST http://127.0.0.1:4200/mock/scenarios \
  -H 'Content-Type: application/json' \
  -d '{"provider":"mpesa","flow":"stk","selectorType":"reference","selectorValue":"ORDER001","resultCode":"1037"}'
```

Inspect callback deliveries:

```bash
curl http://127.0.0.1:4200/mock/callback-deliveries
```

Scenario resolution priority: persisted DB scenario → `X-Mock-Result-Code` request header → amount-based code. Re-delivering the same callback event for a transaction is idempotent once delivered.

## Health endpoints

- `GET /healthz` — liveness
- `GET /readyz` — readiness (DB connectivity)

## Development commands

```bash
pnpm dev       # tsx watch
pnpm build     # esbuild -> single-file ESM dist/index.js (no source maps)
pnpm typecheck # tsc --noEmit (src + tests)
pnpm start     # node dist/index.js
pnpm test     # Vitest (requires a PostgreSQL test DB; see vitest.config.ts)
pnpm lint     # eslint + prettier --check
pnpm fmt      # prettier --write + eslint --fix
```

Tests run against a `pgw_mock_test` database (`TEST_DATABASE_URL`, default `postgresql://admin_444888:pass_444888@127.0.0.1:5452/pgw_mock_test` — the shared `noria_postgres` container); the global setup runs `dbmate up` against it and each test resets fixtures.

## Docker

`compose.yml` runs **only the app** and joins the existing external `norialabs`
network, reusing the PostgreSQL (and Redis, when needed) containers already
running there — it does not start its own database. Migrations run on start via
`RUN_MIGRATIONS=true`.

```bash
# the shared network must already exist (created by the platform stack):
#   docker network create norialabs   # one-time, if missing
docker compose up --build
```

In compose it connects to the existing `noria_postgres` container on the network
(in-network `noria_postgres:5432`); credentials/db come from `.env`
(`DB_USER`/`DB_PASSWORD`/`DB_NAME`, default db `pgw_mock`). The app is published
on host port `${HOST_PORT:-4300}` (container `4200`).

The image is a **single service that serves both**: the Dockerfile builds the
dashboard (`dashboard/dist`) and the API bundle, and the runtime serves the SPA
from `/app/public` (`SERVE_DASHBOARD=true`) with a history fallback to
`index.html` for client routes, alongside the API under `/api`, `/mpesa`,
`/sasapay`, etc. Set `AUTH_BASE_URL`/`AUTH_TRUSTED_ORIGINS` to the public origin
so the BetterAuth session cookie is same-origin.

From the host (e.g. `pnpm dev`, `pnpm db:up`) reach the same PostgreSQL via its
published port — `127.0.0.1:5452` — as configured in `.env`.

> This service uses PostgreSQL only; it has no Redis dependency, so nothing Redis
> is started or required.

## Notes

- This is a mock gateway, not a real payment processor; some auth flows are intentionally fake.
- Response payloads mirror upstream-style APIs even where naming is inconsistent across providers.
- Process-local state (bill-manager invoices/opt-ins, standing orders, WaaS wallet ledger) resets on restart — same as the source service.
