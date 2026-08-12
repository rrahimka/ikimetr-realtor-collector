# Handoff — 2026-08-12 checkpoint

## Repository state

- Path: `C:\Users\9305r\Desktop\ikimetr-realtor-collector`
- WSL path: `/mnt/c/Users/9305r/Desktop/ikimetr-realtor-collector`
- Branch: `main`
- This is a standalone repository. The neighbouring `ikimetr` project was not
  opened, copied, or used by this implementation.

## Completed and previously verified

- Architecture design and implementation plan in `docs/superpowers/`.
- Strict TypeScript pnpm workspace skeleton and environment/ignore policy.
- `packages/core`: Azerbaijani and foreign phone parsing, extraction,
  deterministic multilingual classification, Zod contracts, and SSRF URL/DNS
  policy. Last clean result: 21/21 tests passed.
- `packages/database`: SQLite migration, Drizzle schema, sources/keywords/runs/
  contacts/evidence/audit repositories, active-run uniqueness, cancellation,
  abandoned-run recovery, idempotent evidence, reversible merges. Last clean
  result before the web checkpoint: 4/4 tests passed.
- `packages/connectors`: manual-redirect safe fetch, response limits,
  robots-aware same-host Cheerio crawler, phone evidence from text/tel/WhatsApp,
  Apify configuration/schema safeguards, and gosom Google Maps CSV parser. Last
  clean result: 7/7 tests passed; all external HTTP was mocked.
- `apps/worker`: separate polling process, fixture gating, normalization,
  classification, persistence, cooperative cancellation, and error isolation.
  Last clean result: 3/3 tests passed.

## Checkpointed but not completed or verified

- `apps/web` contains an in-progress Next.js 16 local panel:
  Dashboard, Sources, Keywords, Contacts, Runs, Review, login, styles, API route
  handlers, HMAC session cookies, CSRF helpers, rate limiting, CSV escaping,
  source/run/contact/review APIs, and Google Maps CSV import.
- Web code has not passed its RED/GREEN test cycle, typecheck, lint, build, or
  browser smoke test. It may contain type, import, or Next.js runtime errors.
- `packages/database/src/repositories.ts` has in-progress additions for keywords,
  dashboard stats, review status, and merge listing. Its earlier 4 tests passed
  before these additions; rerun them after dependency installation.
- Required keyword seeding, Playwright fixture/smoke test, README.md, AGENTS.md,
  final migration run, full validation, and GitHub publication remain undone.
- The generic connector is Cheerio-first and safe, but Crawlee/Playwright JS-page
  fallback is not yet implemented. Social connector execution still needs full
  actor schema retrieval and source-type input mapping; current code provides
  the configuration/schema/budget primitives only.

## Current test state

The latest attempted full test run did not start any suites. The interrupted
web dependency installation left pnpm workspace linking incomplete, so the
direct Vitest CLI could not resolve root import `vitest/config`.

Last clean test evidence from before the web checkpoint:

- Core: 21 passed, 0 failed.
- Database: 4 passed, 0 failed (before current repository additions).
- Connectors: 7 passed, 0 failed.
- Worker: 3 passed, 0 failed.
- Total last individually verified: 35 passed, 0 failed.

## Exact next task

Finish dependency linking first, without deleting project source files:

1. In WSL, install from the project root and let it complete. Prefer moving the
   repository into the WSL ext4 filesystem temporarily for installation/tests,
   or use a Linux virtual store because pnpm linking under `/mnt/c` is very slow.
2. Confirm `pnpm-lock.yaml` contains an `apps/web` importer and that
   `node_modules/.bin/vitest` and the web package links exist.
3. Run `pnpm test`; fix the in-progress web/database errors with TDD.
4. Then complete web smoke coverage, docs/seeds, and run migrate, typecheck,
   lint, build, dev, and Playwright smoke verification.

Suggested WSL setup (Node was downloaded only to `/tmp` in this session and may
not survive a reboot):

```bash
cd /mnt/c/Users/9305r/Desktop/ikimetr-realtor-collector
export PATH=/tmp/ikimetr-node-v24.18.0/bin:$PATH
corepack pnpm install --no-frozen-lockfile
```

If `/mnt/c` linking remains too slow, use a clean WSL-side working copy or a
project-local pnpm configuration whose virtual store is on ext4, then allow the
install command to finish and write the lockfile before testing.

## Intended commands

These are the required final commands; only the earlier package-level tests have
been verified so far:

```bash
pnpm install
pnpm db:migrate
pnpm dev
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:smoke
```

`pnpm dev` is designed to run the web panel and worker together. The web server
binds to `127.0.0.1` by default.

## Environment values

Copy `.env.example` to `.env` and set at minimum:

```dotenv
DATABASE_URL=./data/collector.db
LOCAL_AUTH_PASSWORD=<strong local password>
SESSION_SECRET=<random secret, at least 16 characters>
```

Optional social collection:

```dotenv
APIFY_TOKEN=<Apify token>
INSTAGRAM_ENABLED=true
INSTAGRAM_ACTOR_ID=apify/instagram-scraper
TIKTOK_ENABLED=true
TIKTOK_ACTOR_ID=clockworks/tiktok-scraper
TIKTOK_COMMENTS_ACTOR_ID=<compatible comments actor id>
APIFY_MAX_RESULTS=100
APIFY_MONTHLY_BUDGET_USD=10
```

Without `APIFY_TOKEN`, the application is intended to remain usable and report
social adapters as `Не настроено`.

## Known Windows / WSL / NTFS issues

- Windows Application Control blocks downloaded native `.node` modules in this
  workspace, including Rolldown. Run Node checks in WSL.
- pnpm installs and workspace linking on `/mnt/c` (NTFS/DrvFs) can consume high
  CPU for several minutes with little/no output. Several install commands hit
  the tool's two-minute timeout and continued in the background.
- The last active `pnpm install` was explicitly stopped before this checkpoint.
  No installer, Vitest, or Next process remained running at handoff time.
- A temporary Linux Node 24.18.0 existed at `/tmp/ikimetr-node-v24.18.0` and
  temporary pnpm stores at `/tmp/ikimetr-pnpm-store` and
  `/tmp/ikimetr-virtual-store`. `/tmp` is ephemeral.
- `pnpm-lock.yaml` did not yet have the `apps/web` importer at the final audit;
  the next successful install must update it.

## Security audit at checkpoint

- `.env`, `data/*.db`, exports, logs, Playwright reports/profiles, CSV results,
  and SQLite sidecar files are ignored by `.gitignore`.
- No `.env`, database, result export, log, profile, APIFY token, auth password,
  or session secret value is tracked.
- `.env.example` is tracked intentionally and contains empty secret fields only.
