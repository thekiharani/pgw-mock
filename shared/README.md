# shared/

Plain TypeScript types and constants shared between `api/` and `dashboard/`.

These are **not** a published package. Each app references this directory via a
TS path alias (`@shared/*` → `../shared/*`) configured in its own `tsconfig`.
There is no build step and no cross-package linking — the source is consumed
directly. Keep everything here framework-agnostic (no Node-only or DOM-only
imports) so both a Node API and a browser bundle can use it.
