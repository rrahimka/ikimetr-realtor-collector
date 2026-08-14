# Handoff — 2026-08-14 checkpoint

## Repository state

- Path: `/mnt/c/Users/9305r/Desktop/ikimetr-realtor-collector`
- Branch: `safety/qwen-collector-2026-08-12` (pushed to `origin/safety/qwen-collector-2026-08-12`)
- HEAD: `91be78e` — `docs: add README and AGENTS`
- Working tree clean.

## Environment (WSL Ubuntu)

- Node `v24.19.0` (nvm: `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"`).
- pnpm `11.21.0` (corepack).
- `node_modules/.bin/vitest` present (workspace relink done).

## Verified (all exit 0)

- `pnpm test` — 42 tests (9 files).
- `pnpm typecheck` — 5 packages.
- `pnpm lint` — no errors/warnings.
- `pnpm build` — next build + worker tsc.
- `pnpm test:smoke` — 1 passed.
- `git diff --check` — clean.

## Completed this milestone (commits)

- `e3cd4eb` docs: specify and plan local MVP completion.
- `5a4dbec` fix(database): complete drizzle schema to match migration.
- `052618b` feat(database,web): add contact filters and detail view.
- `2bb607a` feat(database): add idempotent demo seed.
- `91be78e` docs: add README and AGENTS.

## Key facts

- `packages/database/src/schema.ts` now mirrors all 8 tables in
  `drizzle/0000_initial.sql`.
- `contacts.list(search, filters)` supports type/platform/verificationStatus/
  isForeign filters.
- New `GET /api/contacts/[id]` + `/contacts/[id]` detail page (evidence list).
- New `pnpm db:seed` (idempotent demo keywords + `test_fixture` source).
- README.md documents install/run/demo/verify; AGENTS.md sets agent policy.

## Next task

Optional polish, not required for the local MVP: RU/AZ i18n dictionary for the
remaining UI labels, generic contacts CSV import with accepted/rejected report,
and a documented clean-demo script that runs migrate+seed against a temporary
DB. Core MVP is complete and verified.
