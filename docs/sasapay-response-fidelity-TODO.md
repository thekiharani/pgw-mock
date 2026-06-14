# SasaPay stub endpoints — response-fidelity follow-up

**Status:** paused on 2026-06-14, pending official SasaPay docs. Requests are done;
response bodies are still generic placeholders.

## Context

To make the mock a true drop-in (`api.safaricom.co.ke` → `<mock>/mpesa`,
`sandbox.sasapay.app` → `<mock>/sasapay`), every official endpoint must resolve at
the gateway-prefixed path. M-Pesa is fully faithful (real handlers + tests). For
SasaPay, the previously-missing official endpoints were scaffolded as stubs.

Agreed validation strategy ("Both"):

- **Requests** — authoritative source is the Laravel package
  `norialabs/packages/laravel/laravel-payments` (`src/SasaPayClient.php`): method,
  GET query params, and SDK-injected payment defaults.
- **Responses** — authoritative source is the official SasaPay docs.

## Done

- All 31 SasaPay stub endpoints exist at the correct drop-in paths (v1 + WaaS),
  grouped under the `SasaPay` tag in the OpenAPI docs.
- HTTP **methods** taken from the SDK (corrected 3 earlier guesses):
  - v1 `/payments/check-balance/` → **GET** + `MerchantCode` query
  - WaaS `/customers/` → **GET**
  - WaaS `/customer-details/` → **POST**
- **Request schemas** added (Zod), requiring the SDK-guaranteed fields and
  passing the rest through:
  - v1 payment endpoints require `MerchantCode` + `Amount` (payment defaults + `withAmount`).
  - status/verify endpoints require a reference identifier.
  - GET query params validated + echoed: `check-balance?MerchantCode`,
    `sub-counties?county_id`, WaaS `merchant-balances?merchantCode`,
    `nearest-agent?Longitude&Latitude`.
- Related pre-existing bug fixed: `generateToken()` lacked a unique claim, so two
  token requests in the same second collided on the `UNIQUE` `mock_access_tokens.token`
  column → 500. Fixed by adding a random `jti` (`src/utils/generators.ts`).

## Pending (the actual follow-up)

Replace the **generic success envelopes** in the stub handlers with the real
response bodies from the SasaPay docs. Stub handlers live in:

- `src/routes/sasapay/index.ts` — v1 stub block (helpers `v1Stub` / `v1List`).
- `src/routes/sasapay/waas.ts` — WaaS stub block (uses `responsePayload`).

Endpoints whose responses are still placeholders:

**v1:** card-payments, approved, remittances/remittance-payments, transactions/fund-movement,
payments/request-payment/status, check-balance, transactions/verify, payments/b2c/beneficiary,
payments/register-ipn-url, lipa-fare, transactions, utilities, utilities/bill-query,
payments/bulk-payments/status, accounts/{business-types,countries,sub-counties,industries,available-bill-number},
accounts/merchant-onboarding.

**WaaS:** customers, customer-details, customer-details/update, sub-wallets, transactions,
transactions/status, transactions/verify, merchant-balances, channel-codes, nearest-agent, utilities.

Also revisit, once docs are in hand:

- Tighten request schemas from `.passthrough()` to exact field lists where the docs
  define them (esp. fund-movement, register-ipn-url, merchant-onboarding, customer-details,
  sub-wallets — currently minimal/permissive).
- Confirm reference-data GETs (countries, industries, business-types, sub-counties)
  should return real reference data vs. empty `data: []`.

## Why it's blocked / how to resume

The SasaPay docs are **not machine-readable** by the available tools:

- `developer.sasapay.app` is a JS-rendered SPA — WebFetch only returns the page title.
- `docs.sasapay.app` (older mirror) refuses connections.
- No `llms.txt` / OpenAPI exposed; WebSearch only returns paraphrased summaries.

To resume, provide responses in a fetchable form (any one):

1. A **Postman collection** or **OpenAPI/Swagger** export from the SasaPay portal
   (single file, all request + response examples) at a local path.
2. **Raw response JSON** pasted per endpoint.
3. Reconstruct per-endpoint via WebSearch (lossy, not guaranteed exhaustive).

Doc entry point given: https://developer.sasapay.app/docs/getting-started?country=ke
