# İkiMetr Realtor Collector — Local MVP

Local-only administration panel and worker that collect, normalise, classify,
deduplicate and review **artificial fixture contacts** into a local SQLite
database. This MVP never contacts real people, real listing sites, or social
platforms.

## Boundaries

Included: core phone/classification logic, SQLite schema and repositories,
fixture/mock connectors, worker queue, deterministic dedup, local auth, CSRF,
rate limiting, server validation, CSV import/export, search/filter, contact
detail, run history, RU/AZ essential UI text, and unit/integration/smoke tests.

Excluded: real mass collection, TikTok/Instagram/WhatsApp execution, real
users, real personal data, CAPTCHA/robots.txt/auth bypass, production
deployment, payments, mobile, AI dedup.

## Requirements

- WSL2 Ubuntu (recommended), Windows host with WSL installed.
- Node.js `>= 22` (verified with `v24.19.0`).
- pnpm `11.21.0` (via corepack: `corepack prepare pnpm@11.21.0 --activate`).

```bash
# activate Node inside WSL (if using nvm)
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
cd /mnt/c/Users/9305r/Desktop/ikimetr-realtor-collector
```

## Install

```bash
pnpm install --frozen-lockfile
```

## Environment

```bash
cp .env.example .env
```

Set at minimum in `.env`:

```dotenv
DATABASE_URL=./data/collector.db
LOCAL_AUTH_PASSWORD=<strong local password>
SESSION_SECRET=<random secret, at least 16 characters>
```

The artificial local-demo fixture is disabled by default. Enable only that
fixture for a demo by starting the services with:

```bash
ALLOW_TEST_CONNECTOR=true pnpm dev
```

Alternatively, set `ALLOW_TEST_CONNECTOR=true` in the local `.env`. This flag
enables only the artificial `test_fixture`; it does not enable real external
sources.

`pnpm dev` loads the root `.env` automatically — no need to `source .env` or
`export` variables beforehand. A relative `DATABASE_URL` resolves against
`packages/database`, so web, worker, migrate and seed all open the same file
(`packages/database/data/collector.db`); use an absolute path to override it.

Optional social collection (disabled in this MVP): `APIFY_TOKEN`,
`INSTAGRAM_ENABLED`, `TIKTOK_ENABLED` and related actor IDs.

## Prepare the database

```bash
pnpm db:migrate   # creates packages/database/data/collector.db and applies the schema
pnpm db:seed      # optional: seeds demo keywords and a fixture source
```

## Run

From the repository root (no prior `source .env` / `export` needed):

```bash
pnpm dev
```

This loads the root `.env` and starts both services:

- Web panel: `http://127.0.0.1:3000`
- Worker: polls the queue and processes runs.

## Local login

Open `http://127.0.0.1:3000`, enter the password from `LOCAL_AUTH_PASSWORD`.

## Demo scenario

1. `pnpm install --frozen-lockfile`, `cp .env.example .env`,
   `pnpm db:migrate`, `pnpm db:seed`.
2. `ALLOW_TEST_CONNECTOR=true pnpm dev`, log in.
3. On **Sources**, create a `test_fixture` source with locator
   `fixture://contacts` (or reuse the seeded one) and enqueue a run.
4. On **Runs**, watch the worker move it `queued → running → completed`.
5. On **Contacts**, the fixture contact (`+994501234567`, Aysel Məmmədova)
   appears. Search, filter by type/status/origin, open the detail to see
   evidence.
6. Re-run or re-import to observe idempotent dedup (no duplicate contact).
7. Export CSV from Contacts, or import a Google Maps CSV from **Sources →
   Google Maps CSV import**.
8. Stop services with `Ctrl+C`.

## Language

The panel is available in Russian (default) and Azerbaijani. Use the `RU / AZ`
toggle in the sidebar; the choice is stored in an `HttpOnly` cookie and persists
across pages. Internal enum values (run status, contact type, verification
status) are shown as localised labels while the stored database values stay
unchanged.

## CSV

- Export: `Contacts → CSV экспорт` (UTF-8 with BOM, formula-injection safe:
  leading `= + - @` are prefixed with `'`).
- Import: `Contacts → Импорт CSV контактов` upload form. The same endpoint
  serves a downloadable template (`GET /api/import/contacts`).

Import format (header row required; `phone` is the only mandatory column):

```csv
phone,name,agency,username,platform,source_url,location_type,excerpt
0501234567,Aysel Məmmədova,Bakı Emlak,,website,https://fixture.invalid/1,listing,"Bakı əmlakçı, mənzil satışı"
```

Rules:

- Maximum file size 5 MB; UTF-8; `.csv`.
- `phone` is normalised to E.164 via the existing core code.
- Optional columns: `name`, `agency`, `username`, `platform`, `source_url`,
  `location_type` (`profile|listing|post|comment`), `excerpt`.
- The import is idempotent: re-importing the same phone does not create a new
  contact.

The report shows:

- `total` — data rows in the file;
- `accepted` — new contacts created;
- `rejected` — invalid rows (with a per-row reason, e.g. `invalid phone`);
- `duplicates` — rows whose normalised phone already existed.

Google Maps CSV import (gosom format) remains available from the Sources page.

## Tests and verification

```bash
pnpm test        # unit/integration tests (vitest)
pnpm typecheck   # tsc --noEmit across the workspace
pnpm lint        # eslint across the workspace
pnpm build       # next build + tsc
pnpm test:smoke  # end-to-end Playwright pipeline (worker + web + browser)
```

All of the above must exit `0` before a release commit.

## Package structure

- `packages/core` — phone extraction/normalisation, classification, contracts,
  SSRF/DNS network policy.
- `packages/database` — SQLite migration, Drizzle schema, repositories, seed.
- `packages/connectors` — safe fetch, robots-aware crawler, Apify primitives,
  Google Maps CSV parser.
- `apps/web` — Next.js panel and API routes.
- `apps/worker` — polling worker and connector runner.

## Troubleshooting

- `node: command not found` in WSL → activate nvm as shown above.
- `pnpm` missing → `corepack prepare pnpm@11.21.0 --activate`.
- Native module build errors on Windows → run inside WSL; Windows Application
  Control blocks some downloaded native modules.
- `worker` exits immediately → check `.env` (`DATABASE_URL`), then run
  `pnpm db:migrate`.

## Known limitations

- Social adapters are configuration primitives only; without `APIFY_TOKEN` they
  report `Не настроено`.
- Crawlee/Playwright JS-page fallback for generic websites is not implemented;
  the crawler is Cheerio-first.
- UI is minimal (Russian default, Azerbaijani for essential labels) and
  desktop-oriented.
- No real data collection is performed anywhere in this MVP.
