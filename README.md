# Noria Payments API Mock (Fastify)

Fastify/TypeScript mock payments gateway for local development, sandboxing, and staging integrations. A faithful port of the FastAPI `payments-api-mock-py` service.

It exposes mock flows for:

- OAuth token generation (Daraja v1/v2)
- M-Pesa-style STK, C2B, B2C, B2B, reversal, account balance, transaction status, QR, tax remittance, B2B Express USSD push, and Standing Orders
- SasaPay-style auth, C2B (incl. wallet OTP), B2C, B2B, bulk, channels, account verify, and transaction status
- SasaPay WaaS onboarding, confirmation, KYC, wallet operations, payments, and reference data
- Daraja Bill Manager
- Mock scenario controls and callback delivery inspection

## Stack

- Node 24 · TypeScript (ESM) · pnpm
- **Fastify 5** web framework
- **Zod** + `fastify-type-provider-zod` for request validation
- **Drizzle ORM** (typed queries) on **MySQL** (`mysql2`)
- **dbmate** for migrations + seeding (raw SQL)
- **Vitest** for tests (Fastify `inject`)

## Requirements

- Node 24+, pnpm 11+
- A MySQL 8.x database
- `dbmate` on PATH (`brew install dbmate`) for migrations

## Quick start

```bash
pnpm install
cp .env.example .env          # adjust DATABASE_URL to your MySQL
pnpm db:up                    # create schema + seed 250 merchants
pnpm dev                      # starts on http://127.0.0.1:4002
```

## Environment

Configuration is read from environment variables or `.env` (loaded automatically).

```env
APP_HOST=0.0.0.0
APP_PORT=4002
LOG_LEVEL=INFO
SERVICE_URL=http://127.0.0.1:4002
PAYMENTS_SERVICE_URL=http://127.0.0.1:4001
STRICT_PROVIDER_AUTH=true
STRICT_PROVIDER_VALIDATION=true
RELAXED_WAAS_KYC=false
MOCK_CALLBACK_DELAY_SECONDS=0
DATABASE_URL=mysql://root:root@127.0.0.1:3306/norialabs_payments_gateways
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
curl -X POST http://127.0.0.1:4002/mock/scenarios \
  -H 'Content-Type: application/json' \
  -d '{"provider":"mpesa","flow":"stk","selectorType":"reference","selectorValue":"ORDER001","resultCode":"1037"}'
```

Inspect callback deliveries:

```bash
curl http://127.0.0.1:4002/mock/callback-deliveries
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
pnpm test     # Vitest (requires a MySQL test DB; see vitest.config.ts)
pnpm lint     # eslint + prettier --check
pnpm fmt      # prettier --write + eslint --fix
```

Tests run against a disposable MySQL database (`TEST_DATABASE_URL`, default `mysql://root:root@127.0.0.1:3307/pgw_mock_test`); the global setup runs `dbmate up` against it and each test resets fixtures.

## Docker

```bash
docker compose up --build
```

Brings up MySQL + the app (migrations run on start via `RUN_MIGRATIONS=true`), serving on host port `4102`.

## Notes

- This is a mock gateway, not a real payment processor; some auth flows are intentionally fake.
- Response payloads mirror upstream-style APIs even where naming is inconsistent across providers.
- Process-local state (bill-manager invoices/opt-ins, standing orders, WaaS wallet ledger) resets on restart — same as the source service.
