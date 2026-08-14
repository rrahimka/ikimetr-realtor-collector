# Collector Local MVP Completion — Design

Status: derived from the verified state of commit `3f8db30` on branch
`safety/qwen-collector-2026-08-12`. This document only specifies the missing
work needed to reach the local MVP; the architecture is already defined in
`docs/superpowers/specs/2026-08-12-realtor-collector-design.md`.

## Boundaries

The local MVP is a single-user, loopback-only administration panel plus a
polling worker that collect, normalise, classify, deduplicate and review
artificial fixture contacts into a local SQLite database.

Included: core logic, SQLite schema/migrations/repositories, fixture and
mock connectors, worker queue, deterministic deduplication, local auth,
CSRF, rate limiting, server validation, CSV import/export, search/filter,
contact detail, run history, RU/AZ essential UI text, unit/integration/smoke
tests, and run documentation.

Excluded: real mass collection, TikTok/Instagram/WhatsApp execution, real
users, real personal data, CAPTCHA/robots.txt/auth bypass, production
deployment, payments, mobile, AI dedup, and any cosmetic redesign.

## Demo scenario

1. `pnpm install`; 2. copy `.env.example` → `.env` and set the local password
and session secret; 3. `pnpm db:migrate`; 4. `pnpm dev`; 5. open
`http://127.0.0.1:3099`, log in; 6. create a `test_fixture` source via the
demo flow and enqueue a run, or import the Google Maps CSV fixture;
7. watch the worker process the run; 8. see contacts appear; 9. search and
filter them; 10. open a contact to see evidence; 11. re-run/import to observe
idempotent dedup; 12. export CSV; 13. stop services.

## Current components (verified)

- `packages/core`: phone extraction/normalisation, deterministic classification,
  Zod contracts, SSRF/DNS network policy. 21 tests.
- `packages/database`: `0000_initial.sql` migration (8 tables), `createDatabase`,
  `createRepositories` (sources/keywords/runs/contacts/reviews/audit/dashboard),
  `migrate.ts`. 4 tests.
- `packages/connectors`: safe fetch, robots-aware Cheerio crawler, Apify config
  primitives, Google Maps CSV parser. 7 tests (external HTTP mocked).
- `apps/worker`: polling claim loop, fixture gating, normalisation,
  classification, persistence, cancellation, abandoned-run recovery. 3 tests.
- `apps/web`: Next.js panel (Dashboard/Sources/Keywords/Contacts/Runs/Review/
  Login), API handlers, HMAC session cookie, CSRF, rate limiting, CSV escaping,
  Google Maps import. 5 security tests + 1 Playwright smoke test.
- Smoke: `apps/web/smoke/run.mjs` + `smoke.spec.ts`; full pipeline passes.

## Missing components (this milestone)

1. `packages/database/src/schema.ts` lists only `sources`, `runs`, `contacts`,
   `evidence`; the migration also defines `keywords`, `contact_merges`,
   `audit_events`, `apify_usage`. Complete the Drizzle definitions so the typed
   schema matches the real database.
2. Contact search supports `q` but no filters; add `type`, `platform`,
   `verificationStatus`, `isForeign` filters to `contacts.list` and the API/UI.
3. No per-contact detail view; add `GET /contacts/[id]` route and a page that
   shows the contact and its `evidenceFor` rows.
4. Google Maps CSV import returns only `imported`; add an accepted/rejected
   report with per-row rejection reasons and a documented size/type limit.
5. No seed data; add a documented, idempotent demo seed (default keywords and
   one `test_fixture` source) behind a dedicated command.
6. UI text is Russian only; add Azerbaijani for the essential labels/actions
   used by the demo scenario (language toggle, default Russian).
7. `README.md` and `AGENTS.md` are missing; write run/verify/demo docs.

## Data model

Already established by `0000_initial.sql`: `sources`, `keywords`, `runs`
(status `queued|running|completed|failed|cancelled`, unique partial index
`one_active_run_per_source`), `contacts` (unique `normalized_phone`),
`evidence` (unique `fingerprint`), `contact_merges`, `audit_events`,
`apify_usage`. No separate listing table — contacts are the directory entity.

## Flow

`fixture`/`website`/`google_maps_query` source → worker claims `queued` run →
connector returns `ConnectorResult.items` → each item is normalised
(`extractPhones`/E.164) and classified (`classifyEvidence`) → idempotent
`contacts.persistEvidence` (upsert by phone, `INSERT OR IGNORE` evidence by
fingerprint) → run finished with counters. CSV import reuses the same
`persistEvidence` path. Dedup key is the normalised E.164 phone; weak matches
are never auto-merged.

## Package interfaces

- `@ikimetr/core`: `extractPhones`, `classifyEvidence`, `SourceInput`,
  `EvidenceInput`, `Classification`, `assertSafeUrl`.
- `@ikimetr/database`: `createDatabase`, `createRepositories`,
  `migrate` (`db:migrate`).
- `@ikimetr/connectors`: `crawlWebsite`, `createApifyConnector`,
  `parseGoogleMapsCsv`, `ConnectorResult`.
- `apps/worker`: `createConnectorRunner` + poll loop (`start`).
- `apps/web`: Next routes + `lib/{auth,csrf,csv,db,http,rate-limit}`.

## Security

Local password auth with HMAC session cookie; mutating routes require CSRF
pair; per-client in-memory rate limiting; Zod validation on every mutating
route; CSV cells escaped against formula injection; import size limited to
5 MB; secrets only from env; no secrets logged; loopback bind by default.

## Error handling

Connector errors fail only their run (`needs_review=1`); worker recovers
abandoned runs on startup; cancelled runs are cooperative; API errors return
neutral JSON messages without stack traces; per-request logs exclude secrets.

## Test strategy

Unit tests per package (existing); integration tests for repositories on a
temporary SQLite file; one Playwright smoke test for the end-to-end pipeline;
`pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm test:smoke`
must all exit 0.

## Readiness criteria

- `schema.ts` matches `0000_initial.sql`.
- Contacts filter + detail work and are covered by a repository/unit test.
- CSV import returns accepted/rejected counts with reasons.
- Demo seed is idempotent and documented.
- Essential UI text exists in RU and AZ.
- `README.md` lets a new user run and demo the MVP without guessing.
- All checks exit 0; `git diff --check` clean; no secrets in git.

## Excluded

Real data collection, social platform execution, external network in tests,
production deployment, and non-collector İkiMetr features.
