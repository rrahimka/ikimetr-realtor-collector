# Realtor Collector MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a local web application and worker that collect, normalise, classify, deduplicate, review, and export public Azerbaijani real-estate professional contacts.

**Architecture:** A Next.js app and a polling Node worker share a Drizzle-managed SQLite database. Focused `core`, `database`, and `connectors` packages provide deterministic processing and adapter boundaries; every adapter emits immutable evidence into an idempotent persistence pipeline.

**Tech Stack:** pnpm workspace, strict TypeScript, Next.js, React, Node.js, Drizzle ORM, better-sqlite3, Crawlee, Playwright, Cheerio, Apify Client, Zod, libphonenumber-js, Vitest, ESLint.

## Global Constraints

- Bind the web panel to `127.0.0.1` by default and keep authentication local.
- Never send messages, make calls, bypass CAPTCHA/access controls/robots.txt, or collect non-public contacts.
- Keep secrets only in environment variables; ignore `.env`, data, exports, logs, and Playwright profiles.
- Block localhost, private, loopback, link-local, reserved, and non-HTTP(S) targets before requests and redirects.
- Mock external HTTP in Vitest; permit the local fixture connector only when `NODE_ENV=test`.
- Do not use production mocks or paid AI models.

---

### Task 1: Workspace and deterministic core

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.workspace.ts`, `eslint.config.mjs`, `.gitignore`, `.env.example`
- Create: `packages/core/package.json`, `packages/core/src/index.ts`, `packages/core/src/phones.ts`, `packages/core/src/classification.ts`, `packages/core/src/contracts.ts`, `packages/core/src/network-policy.ts`
- Test: `packages/core/src/*.test.ts`

**Interfaces:**
- Produces: `extractPhones(text, defaultCountry): ExtractedPhone[]`, `classifyEvidence(input): Classification`, `assertSafeUrl(url, resolver): Promise<URL>`, and shared Zod source/evidence contracts.

- [ ] Write tests proving AZ local/international parsing, invalid rejection, multiple-number extraction, foreign marking, AZ/RU/EN/mixed rule classification, and blocked/allowed DNS results.
- [ ] Run `pnpm --filter @ikimetr/core test` and verify missing-module failures.
- [ ] Implement the shared contracts and pure functions. `extractPhones` must return `{ raw, normalized, isForeign, isValid }`; classification must return `{ type, confidence, reasons, ruleVersion, classifiedAt }`.
- [ ] Run core tests and commit the passing vertical slice.

### Task 2: Durable schema and repositories

**Files:**
- Create: `packages/database/package.json`, `packages/database/src/schema.ts`, `packages/database/src/client.ts`, `packages/database/src/repositories.ts`, `packages/database/src/index.ts`
- Create: `packages/database/drizzle/0000_initial.sql`, `packages/database/src/migrate.ts`
- Test: `packages/database/src/repositories.test.ts`

**Interfaces:**
- Consumes: `EvidenceInput` and `Classification` from `@ikimetr/core`.
- Produces: `createRepositories(db)` with source/keyword/run/contact/review/audit methods, including `enqueueRun`, `claimNextRun`, `requestCancellation`, `persistEvidence`, `mergeContacts`, and `undoMerge`.

- [ ] Write repository tests using a temporary SQLite file for exact-number dedupe, shared agency evidence, repeat imports, evidence retention, one-active-run enforcement, cancellation, startup recovery, merges, and undo.
- [ ] Run database tests and verify schema/repository failures.
- [ ] Define tables, indexes, partial unique active-run index, migration runner, and transactional repository methods.
- [ ] Run database tests and migration against a disposable database; commit the passing slice.

### Task 3: Source connectors

**Files:**
- Create: `packages/connectors/package.json`, `packages/connectors/src/types.ts`, `packages/connectors/src/generic-website.ts`, `packages/connectors/src/apify.ts`, `packages/connectors/src/google-maps-csv.ts`, `packages/connectors/src/index.ts`
- Test: `packages/connectors/src/*.test.ts`

**Interfaces:**
- Produces: `ConnectorContext`, `ConnectorResult`, `createConnector(source, env)`, `crawlWebsite(options, deps)`, `createApifyConnector(platform, env, clientFactory)`, and `parseGoogleMapsCsv(csv)`.

- [ ] Write mocked-fetch tests for robots denial, safe redirects, redirect-to-private rejection, response limits, same-domain/depth/page bounds, tel/WhatsApp/text extraction, evidence excerpts, absent Apify token, kill switches, schema mismatch, result caps, and CSV mapping/idempotent fingerprints.
- [ ] Run connector tests and verify failures.
- [ ] Implement Cheerio-first crawling through injected safe fetch, conservative Playwright fallback, official Apify schema lookup/validation, unified actor output normalisation, budgets, and Google Maps CSV parsing.
- [ ] Run connector tests and commit the passing slice.

### Task 4: Worker and processing pipeline

**Files:**
- Create: `apps/worker/package.json`, `apps/worker/src/index.ts`, `apps/worker/src/worker.ts`, `apps/worker/src/process-run.ts`
- Test: `apps/worker/src/worker.test.ts`

**Interfaces:**
- Consumes: `createRepositories`, `createConnector`, `extractPhones`, and `classifyEvidence`.
- Produces: `runWorker({ db, env, signal, pollMs })` and `processRun(runId, dependencies)`.

- [ ] Write tests that enqueue fixture evidence, process it to contacts/evidence/counters, cooperatively cancel between pages, isolate connector errors, and recover abandoned runs.
- [ ] Run worker tests and verify failures.
- [ ] Implement atomic claiming, per-source processing, counters, classification/persistence, cancellation checks, recovery, and graceful shutdown.
- [ ] Run worker tests and commit the passing slice.

### Task 5: Authenticated API and local security

**Files:**
- Create: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/src/lib/auth.ts`, `apps/web/src/lib/csrf.ts`, `apps/web/src/lib/rate-limit.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/middleware.ts`
- Create: `apps/web/src/app/api/**/route.ts`, `apps/web/src/app/login/page.tsx`
- Test: `apps/web/src/lib/*.test.ts`

**Interfaces:**
- Produces route handlers for login/logout, dashboard, sources CRUD/run/kill, keywords CRUD, contacts/search/export, runs/cancel, reviews/merge/undo/verify/reject, Google Maps CSV import, and configuration status.

- [ ] Write tests for signed sessions, `HttpOnly`/`SameSite=Strict`, CSRF mismatch, rate limiting, Zod errors, CSV formula escaping, and secret-free error responses.
- [ ] Run web library tests and verify failures.
- [ ] Implement security helpers and thin route handlers backed by repositories; all mutations require auth, CSRF, validation, and audit writes.
- [ ] Run web tests and commit the passing slice.

### Task 6: Administration UI

**Files:**
- Create: `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/sources/page.tsx`, `apps/web/src/app/keywords/page.tsx`, `apps/web/src/app/contacts/page.tsx`, `apps/web/src/app/runs/page.tsx`, `apps/web/src/app/review/page.tsx`
- Create: `apps/web/src/components/*.tsx`

**Interfaces:**
- Consumes the authenticated API routes and renders safe React text nodes only.

- [ ] Add component/server-render tests for navigation, dashboard metrics, all source types/fields, configuration status, contact filters, run cancellation, review actions, and CSV export link.
- [ ] Run UI tests and verify failures.
- [ ] Implement the responsive local admin shell and progressive-enhancement forms with visible errors and kill switches.
- [ ] Run UI tests and commit the passing slice.

### Task 7: End-to-end fixture and smoke test

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/smoke.spec.ts`, `apps/web/e2e/fixture-server.ts`, `apps/web/e2e/test-connector.ts`
- Modify: root scripts and worker connector selection to enable the fixture only under `NODE_ENV=test` and `ALLOW_TEST_CONNECTOR=true`.

**Interfaces:**
- Produces a Playwright scenario that logs in, creates a source, queues it, observes a normalised contact with evidence, and downloads a CSV.

- [ ] Write the smoke test and confirm it fails before the fixture route exists.
- [ ] Add an isolated fixture server and test-only connector injection; assert production network policy still rejects loopback.
- [ ] Run the smoke test until it passes and commit the slice.

### Task 8: Documentation and release verification

**Files:**
- Create: `README.md`, `AGENTS.md`
- Modify: `.env.example`, root scripts, and `.gitignore`

**Interfaces:**
- Produces the exact commands `pnpm install`, `pnpm db:migrate`, `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

- [ ] Seed the required multilingual keywords in the migration and document only installation, environment setup, and run commands.
- [ ] Run `pnpm db:migrate`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and the Playwright smoke test from a clean application database.
- [ ] Start `pnpm dev`, verify both bound web and worker processes, then stop them cleanly.
- [ ] Inspect tracked files and diffs for secrets, database/export/log/profile artifacts, and references to the neighbouring project.
- [ ] Commit all verified implementation files; if `gh auth status` succeeds, create and push private `rrahimka/ikimetr-realtor-collector`, otherwise report the exact `gh repo create` command.
