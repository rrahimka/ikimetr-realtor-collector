# IKimetr Realtor Collector — MVP Design

## Scope

The product is a local-only administration application for collecting publicly
posted professional real-estate contacts. It does not contact people, bypass
access controls, or use data from the neighbouring `ikimetr` project. The MVP
supports generic permitted websites, Apify-backed Instagram/TikTok/Google Maps
sources, and Google Maps CSV imports.

## Architecture

The repository is a strict TypeScript pnpm workspace:

- `apps/web`: Next.js UI and route handlers, bound to `127.0.0.1` by default.
- `apps/worker`: a separate polling process that atomically claims SQLite jobs.
- `packages/core`: phone extraction/normalisation, deterministic classification,
  deduplication primitives, and shared Zod contracts.
- `packages/database`: Drizzle schema, migrations, connection factory, and
  repositories for sources, jobs, contacts, evidence, reviews, and audit events.
- `packages/connectors`: adapters that return one internal evidence shape.

SQLite is the durable coordination boundary. A source can have at most one
queued or running job. On startup the worker marks abandoned running jobs as
failed for review. Cancellation is cooperative and checked between pages and
before writes.

## Data model

Sources contain a type, language, locator, crawl limits, enabled state, and a
kill switch. Runs contain lifecycle counters and errors. Contacts are keyed by
normalised E.164 phone number and retain the first/last seen timestamps. Each
observation is stored as immutable evidence with source URL, location type,
text excerpt, original phone, platform metadata, and a stable fingerprint.

Shared agency numbers are represented by multiple evidence/person associations,
not duplicate contact rows. Manual merges create reversible merge records and
audit events; undo restores the previous review state without deleting evidence.

## Collection flow

The API validates mutations with Zod, checks local authentication, CSRF, and
rate limits, then enqueues work. The worker claims a job and delegates to the
source adapter. Adapter output is normalised and classified by transparent
versioned rules before an idempotent transaction persists contacts and evidence.
Connector failures affect only their run and never stop other sources.

The generic website adapter checks `robots.txt`, enforces same-host traversal,
depth/page/response-size/time limits, parses HTML with Cheerio first, and only
uses Playwright when the response indicates a JavaScript shell. Every initial
URL and redirect is restricted to HTTP(S), DNS-resolved, and rejected if any
address is loopback, private, link-local, multicast, unspecified, or reserved.
Test-only dependency injection permits the local fixture origin when
`NODE_ENV=test`; production policy never permits it.

## External adapters

Apify is optional. Missing `APIFY_TOKEN` is reported as `not_configured` in the
UI and fails only that requested run. Actor IDs are configurable and default to
the required public actors. Before starting a run, each adapter fetches the
actor input schema through the official client/API and validates the generated
input. Schema incompatibility produces a configuration error instead of guessed
input. Result and estimated-item caps are mandatory; a configured monthly USD
budget blocks runs after the recorded estimate reaches the cap. Tokens are
never persisted or logged. Instagram and TikTok have independent environment
kill switches.

Google Maps supports an optional Apify actor and a CSV import compatible with
`gosom/google-maps-scraper`. CSV rows are mapped to the common evidence format,
normalised, and idempotently persisted.

## Security

Local authentication uses an environment-provided password and HMAC session
secret. Successful login creates an `HttpOnly`, `SameSite=Strict` cookie.
Mutating routes require a matching CSRF cookie/header pair. An in-memory,
per-client rate limiter protects API routes. React rendering escapes external
text; collected HTML is parsed as data and never executed by application code.
Secrets, SQLite data, exports, logs, Playwright profiles, and environment files
are ignored by Git.

## UI

The UI uses a compact server-rendered admin shell with pages for Dashboard,
Sources, Keywords, Contacts, Runs, and Review. Route handlers expose the CRUD,
queue, cancellation, merge/undo/review, CSV-import, and CSV-export actions. The
dashboard aggregates sources, runs, unique contacts, recent contacts, failures,
and active jobs. Forms show configuration status and estimated item caps before
external runs.

## Error handling

Expected adapter/configuration errors are saved on the run and shown in the UI.
Access denial, robots exclusion, CAPTCHA/block detection, response limits, DNS
changes, and redirect policy failures stop only the current adapter. Database
transactions prevent partial contact/evidence writes. API errors use stable
JSON codes without secrets or internal stack traces.

## Verification

Vitest covers phone parsing, invalid numbers, multi-number extraction,
idempotency, agency sharing, reversible merges, classification in AZ/RU/EN and
mixed text, SSRF and redirects, evidence persistence, cancellation, absent
Apify configuration, and Google Maps CSV import. External HTTP calls are mocked.
A Playwright smoke test runs a test-only fixture connector through the real UI:
create source, run it, wait for the worker, see the contact, and export CSV.
Completion requires migrations, unit/integration tests, strict typecheck,
ESLint, production build, and the smoke test to pass.

## Explicit decisions

- The application is single-user and local; no account-management UI is added.
- SQLite polling is preferred over an additional queue service for this MVP.
- Playwright fallback is conservative and never used to bypass blocks.
- Automated outreach, contact verification by message/call, and paid AI are out
  of scope.
