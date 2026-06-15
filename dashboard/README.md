# dashboard/

Admin console for managing merchants and their Daraja/SasaPay credentials.

Stack: Vite + React + TypeScript, TanStack Router + TanStack Query, shadcn/ui
(Tailwind v4), and the `better-auth` React client for Google + email-OTP sign-in.

Independent of `api/` — own `package.json`, install, and build. Consumes shared
types from `../shared` via the `@shared/*` path alias.

## Develop

```bash
cd dashboard
pnpm install
pnpm dev          # http://localhost:3200
```

The API must be running on `:4200` (`cd api && pnpm dev`). In dev, Vite proxies
`/api` → `http://localhost:4200`, so the browser stays same-origin on `:3200`
and the BetterAuth session cookie works. The API's `AUTH_BASE_URL` /
`AUTH_TRUSTED_ORIGINS` must point at `http://localhost:3200` (the defaults).

For Google sign-in, register the redirect URI
`http://localhost:3200/api/auth/callback/google` in the Google Cloud console.

## Build

```bash
pnpm build        # tsc --noEmit && vite build -> dist/
```

In production the API serves `dist/` as static assets (see Phase 5).
