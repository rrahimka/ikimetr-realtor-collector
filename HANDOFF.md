# Handoff — 2026-08-24 checkpoint (RU/AZ polish)

## Current fix

- Completed the remaining RU/AZ UI localisation in the existing central dictionary, including navigation, page headings, classification reasons, CSV validation messages, and distinct export/import-template copy.
- Contact, evidence, and run timestamps now use one server-side formatter with the `Asia/Baku` time zone and deterministic `DD.MM.YYYY, HH:mm` output.
- The contact import template downloads as `template.csv`; `contacts.csv` remains the export report and the CSV schema/API are unchanged.
- The smoke flow now checks rejected/accepted login, RU/AZ persistence after reload, fixture deduplication and evidence, contact filtering, review verification, export, localised invalid-CSV handling, and template-based idempotent import.
- Controlled smoke on a fresh temporary SQLite database passed 2 tests with external HTTP and WebSocket requests blocked.

## Previous checkpoint: explicit local fixture opt-in

- Branch: `safety/qwen-collector-2026-08-12`.
- `test_fixture` is now gated solely by the explicit
  `ALLOW_TEST_CONNECTOR=true` opt-in; it remains blocked when the variable is
  absent or `false`.
- The smoke worker no longer depends on `NODE_ENV=test`, and the smoke pipeline
  repeats the fixture run to verify phone deduplication.
- `.env.example` defaults the opt-in to `false`; README documents the exact
  local-demo command and that the flag does not enable external sources.
- Targeted worker tests: 7 passed, including explicit enable/disable, the
  artificial contact, normalized `+994501234567`, and no network access.
- Controlled `ALLOW_TEST_CONNECTOR=true pnpm dev` with a temporary SQLite DB:
  web Ready, worker started, two runs completed, one Aysel Məmmədova contact,
  deduplication confirmed, and both processes stopped cleanly.

## Previous checkpoint: shared database path and root `.env` loading

## Repository state

- Path: `/mnt/c/Users/9305r/Desktop/ikimetr-realtor-collector`
- Branch: `safety/qwen-collector-2026-08-12` (pushed to `origin/safety/qwen-collector-2026-08-12`)

## Environment (WSL Ubuntu)

- Node `v24.19.0` (nvm: `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"`).
- pnpm `11.21.0`.

## What this milestone fixes

Manual `pnpm dev` used to crash the worker with
`TypeError: Cannot open database because the directory does not exist`,
because a relative `DATABASE_URL` (`./data/collector.db`) resolved against each
process's own `process.cwd()` (migrate/seed → `packages/database`, worker →
`apps/worker`, web → `apps/web`), so they looked at different databases, and
the root `.env` was never loaded by the `concurrently` dev script.

- `packages/database/src/client.ts` now exports `resolveDatabasePath()`: `:memory:`
  and absolute paths pass through; relative paths resolve against the database
  package directory (never `cwd`). `createDatabase()` also creates the parent
  directory and applies the same resolver, so migrate/seed/web/worker all open
  one shared database.
- New root launcher `scripts/dev.mjs` loads the root `.env` (without overriding
  already-set variables) and then runs `concurrently` for web + worker. The root
  `dev` script is now `node scripts/dev.mjs`, so `pnpm dev` works with no manual
  `source .env` / `export`.
- `apps/web/src/lib/db.ts`, `packages/database/src/migrate.ts` and `seed.ts`
  were simplified to use the single resolver.

## Verified (all exit 0)

- `pnpm test` — 66 passed (14 files, incl. new `client.test.ts` and `scripts/dev.test.mjs`).
- `pnpm typecheck` — 5 packages.
- `pnpm lint` — no errors/warnings.
- `pnpm build` — next build + worker tsc.
- `pnpm test:smoke` — 2 passed.
- `git diff --check` — clean.

A controlled `pnpm dev` run confirmed web reports `Ready` on `127.0.0.1:3000`,
worker reports `Worker started` with no SQLite error, login uses
`LOCAL_AUTH_PASSWORD`, and both processes shut down cleanly on SIGINT/SIGTERM.

## Next task

None required. Optional: document a clean-demo script against a throwaway DB.
