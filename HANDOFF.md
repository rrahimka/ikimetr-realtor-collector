# Handoff — 2026-08-24 checkpoint (local `pnpm dev` fix)

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
