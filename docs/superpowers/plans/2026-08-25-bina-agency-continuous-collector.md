# Bina.az Agency Continuous Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, verify, install, and run a permission-gated local Bina.az agency collector with offline tests, safe scheduling, RU/AZ observability, and Windows autostart.

**Architecture:** Pure URL/text/phone rules are isolated from Playwright orchestration. The connector returns minimal evidence to the existing worker, while repositories own dedup/audit and a SQLite-backed scheduler owns eligibility. Production startup supervises web/worker; Task Scheduler invokes a flock-protected WSL launcher.

**Tech Stack:** TypeScript 5.9, Node 24, pnpm 11, Vitest, Playwright/Chromium, Next.js 16, better-sqlite3, WSL Ubuntu, Windows Task Scheduler PowerShell.

**Spec:** `docs/superpowers/specs/2026-08-25-bina-agency-continuous-collector-design.md`

## Global Constraints

- Real Bina traffic requires `BINA_ENABLED=true` and `BINA_PERMISSION_CONFIRMED=true`.
- Only exact HTTPS hosts `bina.az` and `www.bina.az` are allowed; no credentials or non-default ports.
- Concurrency is exactly 1, delay is at least 10,000 ms, listings are capped at 100, normal cycle interval is at least 6 hours, blocked cooldown is 24 hours, and URL recheck is 7 days.
- Automated tests must never contact real Bina.az or any unmatched external HTTP(S)/WebSocket endpoint.
- Never log full phones, secrets, cookies, HTML, passwords, or `.env` content.
- Connector evidence flows through the existing worker and `contacts.persistEvidence`; the connector never writes SQLite.
- Preserve local-only bind, manual Run, kill switch, authentication, CSRF, and rate limiting.
- Do not add Redis, Docker queues, proxies, stealth, fingerprint evasion, hidden APIs, or production outreach.

---

### Task 1: Source contract and pure Bina rules

**Files:**
- Modify: `packages/core/src/contracts.ts`
- Create: `packages/core/src/contracts.test.ts`
- Create: `packages/connectors/src/bina.ts`
- Create: `packages/connectors/src/bina.test.ts`
- Modify: `packages/connectors/src/index.ts`

**Interfaces:**
- Produces: `BINA_OUTCOMES`, `validateBinaUrl(input, kind)`, `discoverBinaListingUrls(html, baseUrl, cap)`, `hasVisibleAgencyMarker(text)`, `normalizeVisibleBinaPhone(text)`, and `maskPhone(phone)`.
- Produces: `SourceType` value `bina_agency`; source validation applies `maxPages <= 100`, `maxDepth = 0`, and `delayMs >= 10000` when that type is selected.

- [ ] **Step 1: Write failing contract and pure-rule tests**

```ts
expect(sourceSchema.parse({ ...base, type: 'bina_agency', locator: 'https://bina.az/baki', maxPages: 100, maxDepth: 0, delayMs: 10_000 }).type).toBe('bina_agency');
expect(() => validateBinaUrl('https://bina.az.evil.test/items/1', 'listing')).toThrow('Bina URL is not allowed');
expect(discoverBinaListingUrls(htmlWithDuplicates, 'https://www.bina.az/search', 100)).toEqual(['https://bina.az/items/123']);
expect(normalizeVisibleBinaPhone('+994 50 123 45 67')).toBe('+994501234567');
expect(normalizeVisibleBinaPhone('+994 50 *** ** 67')).toBeUndefined();
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run packages/connectors/src/bina.test.ts packages/core/src/contracts.test.ts`

Expected: FAIL because `bina_agency` and the Bina helpers do not exist.

- [ ] **Step 3: Implement minimal pure rules and exports**

Use the WHATWG `URL` API, exact hostname membership, numeric path regex
`^/items/(\d+)/?$`, canonical origin `https://bina.az`, literal hand-checked
phone expectations, and existing `normalizePhone`.

- [ ] **Step 4: Run GREEN and mutation checks**

Run: `pnpm exec vitest run packages/connectors/src/bina.test.ts packages/core/src`

Expected: all selected tests pass; mutations to host, port, cap, numeric ID,
Agentlik marker, or masked phone make at least one test fail.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/contracts.ts packages/core/src/contracts.test.ts packages/connectors/src/bina.ts packages/connectors/src/bina.test.ts packages/connectors/src/index.ts
git commit -m "feat(connectors): add safe Bina source rules"
```

### Task 2: Offline Playwright connector orchestration

**Files:**
- Modify: `packages/connectors/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/connectors/src/bina-playwright.ts`
- Create: `packages/connectors/src/bina-playwright.test.ts`
- Modify: `packages/connectors/src/types.ts`
- Modify: `packages/connectors/src/index.ts`

**Interfaces:**
- Consumes: pure Bina rules from Task 1.
- Produces: `runBinaAgencyConnector(options): Promise<BinaConnectorResult>` with injected `browserFactory`, `sleep`, `shouldStop`, and `onSafeEvent` seams.
- Produces: counters keyed by all approved outcomes and a safe `stopReason`.

- [ ] **Step 1: Add Playwright as an explicit connectors runtime dependency**

Run: `pnpm --filter @ikimetr/connectors add playwright@^1.62.1`

Expected: connector manifest and lockfile list Playwright directly.

- [ ] **Step 2: Write failing routed-browser tests**

```ts
await page.route('https://bina.az/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: artificialHtmlFor(route.request().url()) }));
const result = await runBinaAgencyConnector({ startUrl, maxListings: 2, delayMs: 10_000, permission: () => true, shouldStop: () => false, sleep });
expect(result.items).toEqual([expect.objectContaining({ platform: 'bina.az', sourceUrl: 'https://bina.az/items/101' })]);
expect(result.outcomes.private_seller).toBe(1);
```

Cover canonical discovery/dedup/cap, strict sequential order and delay, visible
Agentlik, click-only phone reveal, missing/masked/invalid phone, 403, 429,
CAPTCHA, login, external redirect, cancellation, kill switch, five technical
errors, mass markup change, resource blocking, and browser cleanup. Abort every
unmatched HTTP(S) and WebSocket request.

- [ ] **Step 3: Run RED**

Run: `pnpm exec vitest run packages/connectors/src/bina-playwright.test.ts`

Expected: FAIL because the orchestrator is absent.

- [ ] **Step 4: Implement the minimal orchestrator**

Launch one browser/context, set first-party routing before navigation, validate
both request and final URLs, process listing URLs with `for...of`, recheck stop
guards before each navigation, and close page/context/browser in nested
`finally` blocks. Never call or inspect hidden endpoints.

- [ ] **Step 5: Run GREEN**

Run: `pnpm exec vitest run packages/connectors/src/bina.test.ts packages/connectors/src/bina-playwright.test.ts`

Expected: all connector tests pass without external traffic.

- [ ] **Step 6: Commit**

```bash
git add packages/connectors/package.json pnpm-lock.yaml packages/connectors/src/bina-playwright.ts packages/connectors/src/bina-playwright.test.ts packages/connectors/src/types.ts packages/connectors/src/index.ts
git commit -m "feat(connectors): add offline-tested Bina Playwright runner"
```

### Task 3: Run persistence, audit summaries, and worker integration

**Files:**
- Modify: `packages/database/drizzle/0000_initial.sql`
- Create: `packages/database/drizzle/0001_bina_blocked.sql`
- Modify: `packages/database/src/client.ts`
- Modify: `packages/database/src/client.test.ts`
- Modify: `packages/database/src/repositories.ts`
- Modify: `packages/database/src/repositories.test.ts`
- Modify: `apps/worker/src/connectors.ts`
- Modify: `apps/worker/src/worker.ts`
- Modify: `apps/worker/src/worker.test.ts`

**Interfaces:**
- Produces: run status `blocked`; `runs.latestTerminal(sourceId)`, `runs.finishBina(...)`, `runs.hasActive(sourceId)`, `evidence.wasUrlSeenSince(sourceId, url, since)`.
- Consumes: `BinaConnectorResult`; persists only through `processRun` and `contacts.persistEvidence`.

- [ ] **Step 1: Write failing repository tests**

```ts
repos.reviews.setStatus(contact.id, 'verified');
repos.contacts.persistEvidence(secondEvidenceForSamePhone);
expect(repos.contacts.get(contact.id)?.verificationStatus).toBe('verified');
expect(repos.contacts.evidenceFor('+994501234567')).toHaveLength(2);
repos.runs.finishBina(run.id, 'blocked', counters, 'captcha');
expect(repos.audit.list()).toContainEqual(expect.objectContaining({ action: 'run.bina.summary' }));
```

Also test latest terminal selection, safe status mapping, URL recheck lookup,
one active run, and no statistics JSON in `runs.error`.

- [ ] **Step 2: Run repository RED**

Run: `pnpm exec vitest run packages/database/src/repositories.test.ts`

Expected: FAIL on missing Bina repository methods/status.

- [ ] **Step 3: Implement minimal repository extensions**

Add `blocked` to the fresh-database status check. For an existing database,
apply a transactional, versioned `0001_bina_blocked.sql` migration that creates
the replacement `runs` table, copies all rows, recreates
`one_active_run_per_source`, verifies row counts, and only then drops the old
table. Add a `client.test.ts` case that builds the old schema in a temporary
database and proves runs/source references survive. Preserve
`verification_status` by excluding it from conflict updates. Audit details hold
aggregate counters; run error holds only the enumerated safe reason.

- [ ] **Step 4: Run repository GREEN**

Run: `pnpm exec vitest run packages/database/src`

Expected: all database tests pass against `:memory:`.

- [ ] **Step 5: Write failing worker tests**

Test both permission flags, enforced max/delay/depth, Bina dispatch, blocked and
cancelled terminal states, safe summaries, dedup with separate evidence, and
absence of full phone values in captured logs/errors.

- [ ] **Step 6: Run worker RED**

Run: `pnpm exec vitest run apps/worker/src/worker.test.ts`

Expected: FAIL because worker does not dispatch or interpret Bina results.

- [ ] **Step 7: Implement minimal worker integration and run GREEN**

Run: `pnpm exec vitest run apps/worker/src packages/database/src`

Expected: all selected tests pass; `test_fixture` remains offline and gated.

- [ ] **Step 8: Commit**

```bash
git add packages/database apps/worker/src/connectors.ts apps/worker/src/worker.ts apps/worker/src/worker.test.ts
git commit -m "feat(worker): persist safe Bina run outcomes"
```

### Task 4: SQLite-backed continuous scheduler

**Files:**
- Create: `apps/worker/src/scheduler.ts`
- Create: `apps/worker/src/scheduler.test.ts`
- Modify: `apps/worker/src/index.ts`

**Interfaces:**
- Produces: `readBinaScheduleConfig(env)`, `runSchedulerTick(repos, now)`, and `startBinaScheduler({ repos, env, signal, clock })`.
- Consumes: repository latest-run/active/recent-URL queries from Task 3.

- [ ] **Step 1: Write failing fake-clock tests**

```ts
expect(await runSchedulerTick(repos, instant('2026-08-25T00:00:00Z'))).toMatchObject({ enqueued: 1 });
clock.advanceBy(6 * HOUR_MS - 1);
expect(await tick()).toMatchObject({ enqueued: 0 });
clock.advanceBy(1);
expect(await tick()).toMatchObject({ enqueued: 1 });
```

Cover immediate first cycle, six-hour eligibility, no overlap, restart recovery,
seven-day URL recheck, 24-hour blocked cooldown, disabled permissions, hard
config clamps, cancellation, and kill switch visibility.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run apps/worker/src/scheduler.test.ts`

Expected: FAIL because scheduler does not exist.

- [ ] **Step 3: Implement scheduler and integrate worker startup**

Use one timer and SQLite timestamps; call `recoverAbandoned()` once; enqueue only
eligible enabled Bina sources. Do not add a queue service. Start scheduler and
the existing worker loop under the same AbortSignal.

- [ ] **Step 4: Run GREEN**

Run: `pnpm exec vitest run apps/worker/src`

Expected: scheduler and existing worker tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/scheduler.ts apps/worker/src/scheduler.test.ts apps/worker/src/index.ts
git commit -m "feat(worker): schedule permission-gated Bina cycles"
```

### Task 5: Production supervisor and autostart artifacts

**Files:**
- Create: `scripts/start-local.mjs`
- Create: `scripts/start-local.test.mjs`
- Create: `scripts/autostart.sh`
- Create: `scripts/autostart.test.mjs`
- Create: `scripts/windows/install-autostart.ps1`
- Create: `scripts/windows/status-autostart.ps1`
- Create: `scripts/windows/uninstall-autostart.ps1`
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm start:local`; `loadEnvFile`, `buildStartCommands`, and supervised child lifecycle.
- Produces: Task Scheduler management for exactly `IkiMetrRealtorCollector`.

- [ ] **Step 1: Write failing supervisor behavior tests**

Run child-process fixtures to prove root `.env` precedence, exact production
commands, `127.0.0.1`, signal forwarding, sibling shutdown, and nonzero crash
exit. Assert behavior and exit codes, not source text.

- [ ] **Step 2: Run supervisor RED**

Run: `pnpm exec vitest run scripts/start-local.test.mjs`

Expected: FAIL because the supervisor is absent.

- [ ] **Step 3: Implement minimal supervisor and run GREEN**

Run: `pnpm exec vitest run scripts/start-local.test.mjs scripts/dev.test.mjs`

Expected: production and development launcher tests pass.

- [ ] **Step 4: Write failing autostart behavior tests**

Use a temporary fake `schtasks.exe`/PowerShell command surface to test `-WhatIf`
creates nothing, repeated install updates one task, exact Ubuntu/rahim/repo
arguments, bounded restart, one instance, status/last result, confirmed or
`-Force` uninstall, flock rejection, and bounded log rotation.

- [ ] **Step 5: Run autostart RED**

Run: `pnpm exec vitest run scripts/autostart.test.mjs`

Expected: FAIL because scripts do not exist.

- [ ] **Step 6: Implement artifacts and run GREEN**

Run: `pnpm exec vitest run scripts/start-local.test.mjs scripts/autostart.test.mjs`

Expected: all launcher tests pass without creating a real scheduled task.

- [ ] **Step 7: Commit**

```bash
git add package.json scripts/start-local.mjs scripts/start-local.test.mjs scripts/autostart.sh scripts/autostart.test.mjs scripts/windows
git commit -m "feat(ops): add supervised local startup and autostart"
```

### Task 6: RU/AZ source and run observability

**Files:**
- Create: `apps/web/src/components/source-form.test.tsx`
- Modify: `apps/web/src/components/source-form.tsx`
- Modify: `apps/web/src/app/sources/page.tsx`
- Modify: `apps/web/src/app/runs/page.tsx`
- Modify: `apps/web/src/lib/i18n.ts`
- Modify: `apps/web/src/lib/i18n.test.ts`

**Interfaces:**
- Consumes: repository source/run metadata and central `t`/`tEnum` helpers.
- Produces: Bina source option/defaults and RU/AZ labels for automatic interval, last/next run, all counters, blocked/cancelled/failed, and safe stop reason.

- [ ] **Step 1: Write failing i18n and rendered-UI tests**

```ts
expect(t('ru', 'sourceType.binaAgency')).toBe('Bina.az — агентства');
expect(t('az', 'sourceType.binaAgency')).toBe('Bina.az — agentliklər');
expect(tEnum('ru', 'run', 'blocked')).toBe('заблокировано');
```

Cover every new label in both locales and Bina form defaults 100/0/10000.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run apps/web/src/lib/i18n.test.ts apps/web/src/components/source-form.test.tsx`

Expected: FAIL on missing labels and Bina option/defaults.

- [ ] **Step 3: Implement minimal UI and run GREEN**

Run: `pnpm exec vitest run apps/web/src`

Expected: all web unit tests pass; auth/CSRF/rate limiting files remain unchanged.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/source-form.tsx apps/web/src/app/sources/page.tsx apps/web/src/app/runs/page.tsx apps/web/src/lib/i18n.ts apps/web/src/lib/i18n.test.ts apps/web/src/components/source-form.test.tsx
git commit -m "feat(web): show Bina automation in RU and AZ"
```

### Task 7: Offline smoke and operational documentation

**Files:**
- Modify: `apps/web/smoke/run.mjs`
- Modify: `apps/web/smoke/smoke.spec.ts`
- Modify: `README.md`
- Modify: `HANDOFF.md`

**Interfaces:**
- Smoke creates temporary SQLite, creates a safe Bina source, rejects a
  lookalike locator, never invokes live Bina, and preserves fixture dedup flow.

- [ ] **Step 1: Write failing smoke assertions**

Create `bina_agency` via the authenticated API with exact allowed URL and verify
201; submit `https://bina.az.evil.test/items/1` and verify validation failure.
Keep `BINA_ENABLED=false` and `BINA_PERMISSION_CONFIRMED=false` in smoke worker
environment and retain global external HTTP/WebSocket blocking.

- [ ] **Step 2: Run smoke RED**

Run: `pnpm test:smoke`

Expected: FAIL until source validation accepts exact Bina and rejects lookalike.

- [ ] **Step 3: Implement smoke-safe API validation and documentation**

Document purpose, allowed scope, Chromium install, all Bina env variables,
start/autostart, six-hour cycle, cooldown, status/pause/resume/log/uninstall
commands, safety limits, offline results, live result, branch, and SHA. Never
include `.env` values or real phones.

- [ ] **Step 4: Run smoke GREEN**

Run: `pnpm test:smoke`

Expected: smoke passes using only temporary SQLite and fixture evidence.

- [ ] **Step 5: Commit**

```bash
git add apps/web/smoke/run.mjs apps/web/smoke/smoke.spec.ts README.md HANDOFF.md
git commit -m "test(smoke): cover safe Bina source configuration"
```

### Task 8: Install browser, verify twice, review, accept live, and install autostart

**Files:**
- Local only: `.env` (ignored; preserve ACL and unrelated lines)
- Documentation updates only if observed results differ from Task 7 wording.

**Interfaces:**
- Consumes the completed product; produces fresh evidence for release readiness.

- [ ] **Step 1: Install Chromium in WSL**

Run: `pnpm exec playwright install chromium`

Expected: exit 0 and an available Playwright Chromium executable.

- [ ] **Step 2: Run PASS 1 sequentially**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:smoke
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 3: Run unchanged PASS 2 sequentially**

Run the same six commands without editing files. Expected: every command exits
0. Any file change restarts both passes from PASS 1.

- [ ] **Step 4: Perform release safety audit**

Check diff for secrets/full phones/hidden APIs/auth weakening, confirm `.env` is
ignored, tests used only temporary SQLite, and no web/worker/Chromium process is
left running.

- [ ] **Step 5: Request mandatory independent code review**

Review `f15332dedbdc5c16c9017d5ca66cd7dccdc9634d..HEAD` against this plan and the
design spec. Fix every Critical/Important finding test-first, then restart PASS
1 and PASS 2.

- [ ] **Step 6: Update only approved local `.env` keys**

Set both permission flags true, max listings 5, delay 10000, cycle hours 6,
without printing values, replacing unrelated lines, changing ACL, or tracking
the file. Verify only key names and `SET` state.

- [ ] **Step 7: Run one controlled live acceptance and one dedup rerun**

Use source `Bina.az Agentlik`, type `bina_agency`, locator
`https://bina.az/baki/alqi-satqi/menziller`, AZ, maxPages 5, maxDepth 0,
delayMs 10000. Stop without bypass on CAPTCHA/403/429/login/external redirect or
private-seller false positive. Record only aggregate counts and masked evidence.

- [ ] **Step 8: If live acceptance is fully correct, set local max to 100**

Do not run a manual 100-listing verification cycle.

- [ ] **Step 9: Validate and install Task Scheduler entry**

Run installer with `-WhatIf`, prove no task exists, install without `-WhatIf`,
check status and last result, stop/start it, check `http://127.0.0.1:3000`, web,
worker, scheduler, flock rejection, no stored password, and restart recovery.

- [ ] **Step 10: Final documentation/result commit if needed**

```bash
git add README.md HANDOFF.md
git commit -m "docs: record Bina pilot acceptance"
```

- [ ] **Step 11: Push and verify remote identity**

```bash
git diff --check
git status --short --branch
git check-ignore -v .env
git push -u origin feature/bina-agency-pilot
pnpm test:smoke
git rev-parse HEAD
git rev-parse origin/feature/bina-agency-pilot
git status --short --branch
```

Expected: push is non-force, post-push smoke exits 0, HEAD equals origin SHA,
and stable `safety/qwen-collector-2026-08-12` is not merged or modified.
