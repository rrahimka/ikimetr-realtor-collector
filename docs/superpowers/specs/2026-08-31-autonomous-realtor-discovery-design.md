# Autonomous Realtor Discovery — Design

## Purpose and approved scope

Extend İkiMetr Realtor Collector from a *manual-source* collector into an
**autonomous discovery engine** that finds, scores, and (where policy allows)
joins real-estate sources itself — without the user hand-entering every
group/channel. The engine keeps the existing human-in-the-loop verification
queue and safety model intact.

Concrete deliverables in this change set:

1. **Autonomous Discovery Core** — a persistent **Discovery Ledger** (SQLite
   `discovery_candidates`) plus a **Discovery Orchestrator** that turns the
   canonical keyword registry + geo/agency seeds into scored candidates with
   explicit lifecycle statuses.
2. **Telegram autonomous discovery** — fix the `telegram_dialog_not_found`
   failure class for a configured **public** source the account has not joined,
   auto-join PUBLIC relevant channels/groups, and route PRIVATE / INVITE-ONLY
   sources to `NEEDS_APPROVAL`. FloodWait is always respected; DMs are never
   read; no message is ever sent.
3. **Canonical multilingual keyword registry** (RU/AZ/EN) replacing the ad-hoc
   per-file dictionaries, used by both discovery and classification.
4. **Realtor auto-confirm** — confidence ≥ 90% auto-confirms; < 90% stays in
   manual review. **Azerbaijan-only phone policy** enforced at classification.
5. **UI** — Russian-only visible UI, sticky **TOP** navigation, continuous-run
   control present **only on the Dashboard**, "Риелторы и агентства" simplified to
   "Риелторы", and real **source/deep links** on evidence rows.

All automated tests remain offline. No connector except the dedicated
`bina_agency` (gated by `BINA_ENABLED` + `BINA_PERMISSION_CONFIRMED`) may make
real requests. The service binds to `127.0.0.1`. Live Telegram validation is a
single bounded, opt-in step at the very end and never required for the gate.

## Safety invariants (unchanged + extended)

- Read-only, local-only MVP. Never send Telegram messages, never read DMs,
  never auto-join PRIVATE/INVITE-ONLY groups, never bypass CAPTCHA/robots/auth/
  rate limits, never use proxies or stealth.
- **PUBLIC** sources: auto-discover, auto-join when relevant (score ≥ threshold).
- **PRIVATE / INVITE-ONLY** sources: discover only as candidates; require
  `NEEDS_APPROVAL` before any join. Never resolve an invite hash without consent.
- FloodWait errors are surfaced, never retried inline; the worker honors the
  server-requested wait (capped at 30s).
- Azerbaijan-only phone: numbers that are not `+994` national-number-plan valid
  are treated as foreign, never auto-accepted, and (when present as the only
  signal) never become a realtor contact.
- Secrets stay in environment variables; no `.env`, tokens, session strings, full
  phones, cookies, HTML, or raw descriptions are logged.

## Architecture

### Subproject A — Autonomous Discovery Core

- **`packages/database/drizzle/0010_discovery_ledger.sql`** — `discovery_candidates`
  table with `candidate_key` (unique), `platform`, `strategy`, `seed`, `title`,
  `url`, `username`, `relevance_score`, `relevance_reasons_json`, `status`,
  `source_id`, `joined_at`, `last_checked_at`, `error`, timestamps.
  Status set: `DISCOVERED | QUEUED | VERIFIED | JOINED | ACTIVE | REJECTED |
  NEEDS_APPROVAL | COOLDOWN | BLOCKED | DEAD`.
- **`packages/database/src/repositories.ts`** — `discovery` namespace:
  `upsertCandidate`, `get`, `listByStatus`, `updateStatus`, `recordJoin`,
  `counts`. Existing in-memory `DiscoveryLedger` (social-scale.ts) is preserved
  for the social pipeline; a `PersistentDiscoveryLedger` wraps the repository for
  the orchestrator.
- **`packages/connectors/src/discovery-orchestrator.ts`** — pure, injectable:
  builds seeds from `generateProgrammaticSeeds()` + keyword registry, scores each
  via the shared relevance scorer, persists `DISCOVERED` candidates, and returns
  the set of PUBLIC Telegram candidates eligible for auto-join. No network.

### Subproject B — Telegram autonomous discovery

- **`packages/connectors/src/telegram-discovery.ts`** — new module:
  - `joinPublicTelegramChannel(client, entity)` → `client.invoke(new Api.channels.JoinChannel({channel:entity}))` then re-resolve; returns resolved `ResolvedTelegramSource`.
  - `resolveAndEnsureTelegramSource(client, locator, { autoJoinPublic })` →
    resolves the configured locator; if `entity.left` **and public**, joins then
    re-resolves; if the locator is a **private/invite** link (`t.me/+hash`) or
    resolution requires an invite, returns `{ verdict: 'needs_approval' }`
    without joining; FloodWait from the join is propagated.
  - `scoreTelegramChannelRelevance(title, about, memberCount?)` → `{ score, reasons }`
    using the canonical keyword registry (tier weighting).
- **`apps/worker/src/connectors.ts`** — `crawlTelegramAuthorizedMTProto` now calls
  `resolveAndEnsureTelegramSource(client, locator, { autoJoinPublic: true })`.
  When the verdict is `needs_approval`, it throws
  `telegram_source_requires_approval` (distinct, honest error) instead of
  `telegram_dialog_not_found`. This fixes the public-source runtime failure and
  keeps private sources blocked from silent joins.

### Subproject C — Canonical keyword registry

- **`packages/core/src/search-intelligence/keywords.ts`** —
  `CANONICAL_REALESTATE_KEYWORDS = { az, ru, en }` consolidating tiers 1–4
  (realtor terms, property roots, transaction terms, agency terms), plus
  `classifyKeywordLanguage(value)` and `seedKeywords()`. Classification and
  discovery both consume this registry; scattered per-file arrays are not
  deleted wholesale (low-risk reuse) but the canonical set is the single source
  of truth for discovery scoring.
- **UI** — `keyword-form.tsx` language `<select>` removed; the keywords API
  defaults to `mixed` when language is omitted.

### Subproject D — Realtor auto-confirm + AZ phone policy

- **`packages/core/src/thresholds.ts`** — `REALTOR_AUTO_ACCEPT_THRESHOLD = 0.90`,
  `AUTO_ACCEPT_REALTOR_POLICY`.
- **`packages/core/src/classification.ts`** — when `type` is `agent`/`agency`,
  not an owner mention, Azerbaijan mobile present, and `confidence >= 0.90`,
  set `autoAccept = true` with the realtor policy. A present phone that is not a
  valid `+994` national number is forced `isForeign = true` and never
  auto-accepted (AZ-only enforcement). `contacts.persistEvidence` already sets
  `verified` for auto-accepted rows and never overwrites a manual decision.

### Subproject E — Shared social leads pipeline

`leads` table + `classifyLeadIntent` already span Instagram/TikTok/Telegram. The
orchestrator records discovered social/Telegram candidates in the shared ledger;
`processSocialScaleBatch` continues to use the in-memory ledger for cross-match,
and a `PersistentDiscoveryLedger` mirrors accepted social candidates so discovery
and enrichment share one surface. No new network path.

### Subproject F — UI

- **`apps/web/src/app/layout.tsx`** — navigation moves to a sticky **TOP** bar
  (`<header class="top-nav">`); the sidebar is removed. The `CollectorRunner`
  (continuous collection) is removed from the global layout and rendered **only**
  on `apps/web/src/app/page.tsx` (Dashboard). The language switcher is removed so
  the UI is Russian-only (all labels carry `ru`).
- **i18n** — `nav.contacts` becomes `Риелторы` / `Rieltorlar` / `Realtors`.
- **Source/deep links** — evidence and discovery rows render real anchors:
  Telegram candidates → `https://t.me/<username>`; website/source URLs → the
  canonical listing/page URL. A `sourceDeepLink()` helper lives in
  `packages/core`.

## OSS adoption audit (decision rules)

| # | Project | Decision | Rationale |
|---|---------|----------|-----------|
| 1 | **google-maps-scraper** (gosom) | ADOPT behind Docker, **disabled by default** | HIGH value for geo discovery, but Docker conflicts with the local-only MVP. `google_maps_query` source already hard-errors without `APIFY_TOKEN`. Docker run is documented; not wired into the offline gate. |
| 2 | **teleproto** (MTProto client) | COMPAT-SHIM only, **do not migrate** | Its `StringSession` is wire-compatible with GramJS; a `toTeleprotoStringSession()` converter is added (round-trip tested) so a future migration cannot break the user's authenticated session. GramJS remains the live adapter. |
| 3 | **crawlee** (Apify) | GENERIC discovery seam only, gated | Used only for generic web discovery; never for authenticated/private surfaces. Disabled unless `CRAWLEE_ENABLED=true` in tests. |
| 4 | **TikTok-Api** (davidteather) | Keep as **provider behind interface** | Already a provider; no rewrite. |
| 5 | **social-analyzer** (qeeqbox, AGPL) | EXTERNAL/OPTIONAL only | AGPL; never bundled into the MVP. Out-of-process, opt-in. |
| 6 | **splink** (moj) | DEFERRED / YAGNI | Entity resolution is good enough with normalized phone; no fuzzy match needed yet. |

## Data minimization

Persist only: candidate key, platform, strategy, seed, title, public url/username,
relevance score + reasons, lifecycle status, joined timestamp, safe error string.
No DMs, no private-profile data, no cookies, no HTML, no full phones, no secrets.
Contact rows keep the existing minimization contract.

## Failure model

- Public Telegram source not joined → auto-join; if join hits FloodWait, surface
  `telegram_flood_wait_Ns`; if join is refused, mark candidate `BLOCKED`.
- Private/invite source → `NEEDS_APPROVAL`; never auto-joined.
- Non-`+994` phone → foreign; never auto-accepted; type stays `unknown`/`suspicious`.
- Discovery candidates that score below threshold → `REJECTED`/`COOLDOWN`.
- All error surfaces use enumerated safe strings; raw remote content is never
  interpolated.

## Test and acceptance strategy

Test-first, offline-only. Unit/integration tests use artificial fixtures and
explicitly fail unmatched external traffic. The Telegram module is tested with a
**mocked `TelegramClient`** (no network): joined/left/public, invite
`needs_approval`, FloodWait propagation, relevance thresholds. The ledger +
orchestrator are tested against `:memory:` SQLite. Classification tests assert
auto-confirm at ≥0.90 and AZ-only rejection. UI changes are covered by the
existing Playwright smoke (app boots, nav present, dashboard-only control) plus
targeted component tests where they exist.

Full gate (run twice, no file changes between passes):
`pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:smoke &&
git diff --check`. **No push.**

After the offline gate is green, one bounded **opt-in** live Telegram check of a
single public channel may run (≤ 20 messages, FloodWait-respecting) only when the
user supplies credentials and explicitly requests it; it is never part of CI.
