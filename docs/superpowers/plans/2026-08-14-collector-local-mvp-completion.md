# Collector Local MVP Completion — Plan

Execution plan for `docs/superpowers/specs/2026-08-14-collector-local-mvp-completion-design.md`.
Each task is independently committable. Test commands use the existing
workspace scripts (`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`,
`pnpm test:smoke`, and per-package `pnpm --filter <pkg> test`).

## Task 1 — Complete typed schema

Files: `packages/database/src/schema.ts`.

Expected: `schema.ts` exports Drizzle definitions for `keywords`,
`contact_merges`, `audit_events`, `apify_usage` mirroring
`packages/database/drizzle/0000_initial.sql`.

Verification: `pnpm --filter @ikimetr/database test` and
`pnpm typecheck` still pass; visually diff the column names/types against the
SQL migration.

Commit: `fix(database): complete drizzle schema to match migration`.

## Task 2 — Contact filters

Files: `packages/database/src/repositories.ts`
(`contacts.list(search, filters)`),
`packages/database/src/repositories.test.ts`,
`apps/web/src/app/api/contacts/route.ts`,
`apps/web/src/app/contacts/page.tsx`.

Expected: `contacts.list` accepts `{ type?, platform?, verificationStatus?,
isForeign? }` and AND-combines them with `q`; the API reads these as query
params; the contacts page renders filter selects.

Failing test first: add a repository test that seeds two contacts and asserts
filtering by `type` and `verificationStatus`.

Verification: `pnpm --filter @ikimetr/database test`, then `pnpm test`,
`pnpm typecheck`, `pnpm lint`.

Commit: `feat(database,web): add contact filters`.

## Task 3 — Contact detail

Files: `apps/web/src/app/contacts/[id]/page.tsx` (new),
`apps/web/src/app/api/contacts/[id]/route.ts` (new).

Expected: `GET /api/contacts/[id]` returns the contact plus
`repos.contacts.evidenceFor(phone)` rows; the page renders contact fields and
the evidence table (source URL, platform, excerpt, discoveredAt), with a
not-found state.

Failing test first: extend the smoke spec or add a unit assertion that the
detail route returns evidence (repository coverage already exists for
`evidenceFor`).

Verification: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.

Commit: `feat(web): add contact detail view`.

## Task 4 — CSV import report

Files: `apps/web/src/app/api/import/google-maps/route.ts`,
`apps/web/src/lib/csv.ts` (helper if needed),
`packages/connectors/src/google-maps-csv.test.ts` (if parser changes).

Expected: import returns `{ imported, rejected, errors: [{ row, reason }] }`;
rows are validated (non-empty normalised phone, size/type limits already
enforced); rejected rows are reported, not silently dropped.

Failing test first: assert the route shape on a fixture CSV with one valid and
one invalid row.

Verification: `pnpm test`, `pnpm typecheck`, `pnpm lint`.

Commit: `feat(web): report accepted and rejected CSV rows`.

## Task 5 — Demo seed

Files: `packages/database/src/seed.ts` (new),
`packages/database/package.json` (`db:seed` script),
root `package.json` (`db:seed` script).

Expected: `pnpm db:seed` idempotently inserts default keywords (AZ/RU demo
terms) and one `test_fixture` source; it uses `INSERT OR IGNORE`/dedup and is
safe to run repeatedly.

Failing test first: repository test asserting `seed` is idempotent.

Verification: `pnpm --filter @ikimetr/database test`, `pnpm typecheck`.

Commit: `feat(database): add idempotent demo seed`.

## Task 6 — RU/AZ essential text

Files: `apps/web/src/lib/i18n.ts` (new, tiny dictionary),
`apps/web/src/app/{page,layout,login,contacts,sources,runs,review,keywords}` +
`components/*` where demo text appears.

Expected: a small `t(key, lang)` dictionary; `lang` from a cookie/local state,
default `ru`; essential labels/buttons/empty/error states translated to `az`.

Failing test first: unit test for the dictionary keys coverage of essential
actions.

Verification: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`,
`pnpm test:smoke`.

Commit: `feat(web): add RU/AZ essential UI text`.

## Task 7 — Documentation

Files: `README.md`, `AGENTS.md`.

Expected: README covers purpose, boundaries, WSL/Node/pnpm requirements,
install, env, DB prep, run web+worker, demo fixture flow, local login, CSV,
tests, smoke, troubleshooting, package structure, limitations; AGENTS.md
defines the agent policy (loopback-only, fixture/mock-only, no real collection,
no secrets, verification commands).

Verification: `git diff --check`; commands in README match `package.json`.

Commit: `docs: add README and AGENTS`.

## Final gate

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`,
`pnpm test:smoke`, `git diff --check`, then `git push origin
safety/qwen-collector-2026-08-12`.
