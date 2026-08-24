# Bina.az Agency Continuous Collector Design

## Purpose and approved scope

Add an opt-in, local-only `bina_agency` source that discovers public Bina.az
listing URLs, accepts only listings visibly labelled `Agentlik`, reveals the
public business phone through the visible `Nömrəni göstər` control, and feeds
minimal evidence into the existing worker pipeline. The owner confirms written
permission from Bina.az. The permission letter and all secrets stay outside Git.

All automated tests remain offline. No other connector gains production access.
The service binds to `127.0.0.1`; it performs no outreach and never contacts
TikTok, Instagram, WhatsApp, private sellers, hidden APIs, or lookalike hosts.

## Safety invariants

- Real navigation requires both `BINA_ENABLED=true` and
  `BINA_PERMISSION_CONFIRMED=true` at connector invocation and before every new
  navigation.
- Only `https://bina.az` and `https://www.bina.az` are allowed. Credentials,
  non-default ports, HTTP, local/file URLs, external redirects, and lookalike
  domains are rejected.
- Listing URLs are canonicalized to `https://bina.az/items/<numeric-id>` and
  deduplicated. A cycle processes at most 100 listings, sequentially, with at
  least 10,000 ms between listing navigations.
- CAPTCHA, login, 403, 429, external redirect, cancellation, kill switch,
  disabled permission flags, five consecutive technical errors, or confirmed
  mass markup change stop the active cycle without bypass attempts.
- `blocked` is a terminal run status. Automatic retry eligibility is delayed 24
  hours after a blocked run. Normal removed/missing/invalid/private/parse
  outcomes are recorded and do not create infinite retries.
- Logs and run errors never contain full phones, `.env`, cookies, HTML,
  passwords, `SESSION_SECRET`, or `LOCAL_AUTH_PASSWORD`. Phone diagnostics use
  masking such as `+99450*****67`.

## Architecture

### Pure Bina rules

`packages/connectors/src/bina.ts` owns deterministic URL, text, and phone logic:

- `validateBinaUrl` parses an absolute URL and enforces scheme, exact host,
  credentials, default port, path policy, and canonical origin.
- `discoverBinaListingUrls` extracts only numeric `/items/<id>` links, emits
  canonical `bina.az` URLs, removes duplicates, and applies the hard cap.
- `hasVisibleAgencyMarker` accepts a deliberate visible `Agentlik` marker, not
  incidental script or hidden text.
- `normalizeVisibleBinaPhone` rejects masked, incomplete, foreign, or invalid
  numbers and reuses core normalization to return an Azerbaijani E.164 number.
- `maskPhone` is the only formatter allowed in connector diagnostics.

These functions have no browser or network dependency and are exhaustively
unit-tested with artificial strings and URLs.

### Playwright orchestration

`packages/connectors/src/bina-playwright.ts` owns the browser lifecycle. It
launches one Chromium browser, one temporary context, and sequential pages.
Requests are limited to necessary first-party Bina resources; images, media,
fonts, downloads, ads, trackers, third-party HTTP, and WebSockets are blocked.
The module validates every requested URL and every final response URL.

The search page yields canonical listing URLs. Each listing is navigated only
after the configured delay and live permission/kill/cancellation checks. The
visible DOM must prove `Agentlik`; private sellers are skipped. The visible
`Nömrəni göstər` button is clicked, and only the subsequently visible number is
read. No private endpoint is called or inspected. Page, context, and browser
close in `finally` blocks.

The connector returns a `BinaConnectorResult` containing accepted evidence,
per-outcome counters, pages checked, and a safe stop reason. It never writes to
SQLite. Playwright tests intercept `https://bina.az/**` and serve artificial
HTML; any unmatched HTTP(S) or WebSocket request fails the test.

### Worker and persistence

The existing `createConnectorRunner` dispatches `bina_agency` only when both
flags are true and applies hard limits: concurrency 1, `maxPages <= 100`,
`delayMs >= 10000`, and `cycleHours >= 6`. Existing `processRun` remains the
single persistence path: it normalizes/classifies and calls
`contacts.persistEvidence`.

The repository layer extends textual run status with `blocked`, exposes latest
terminal run and recent listing evidence queries, stores aggregated Bina
statistics in `audit_events` as `run.bina.summary` / `entity_type=run`, and
keeps the `runs.error` field to a short safe reason. Phone uniqueness creates
one contact; unique evidence fingerprints preserve one evidence per listing.
The contact upsert never overwrites a manually verified or rejected status.
The fresh schema includes `blocked` in its CHECK constraint. A versioned,
transactional migration rebuilds only the `runs` table for pre-existing local
databases, copies every row, and recreates the active-run index; tests prove row
and foreign-key preservation before the migration is used on the owner DB.

Outcomes are `accepted`, `duplicate`, `private_seller`, `missing_phone`,
`invalid_phone`, `page_removed`, `blocked`, `parse_error`, and `cancelled`.

### Scheduler

`apps/worker/src/scheduler.ts` performs one immediate eligibility scan at worker
startup and then uses a single timer. It finds enabled `bina_agency` sources,
requires both permission flags, recovers abandoned running runs, and consults
SQLite rather than memory. A source is eligible when it has no active run and
no completed run within six hours, no blocked run within 24 hours, and no
listing evidence recheck newer than seven days. Enqueue uniqueness prevents
overlap. Fake-clock tests verify first run, six-hour scheduling, cooldown,
restart recovery, URL recheck, and cancellation.

### Production startup and Windows autostart

`scripts/start-local.mjs` loads the root `.env` without overriding an existing
environment, then starts production web and worker commands. Web remains on
`127.0.0.1:3000`. SIGINT/SIGTERM are forwarded, sibling failure terminates the
other process, and an unexpected failure returns nonzero. It never installs or
builds on login.

`scripts/autostart.sh` activates NVM, changes to the exact repository, acquires
a project-specific `flock`, rotates bounded logs, and `exec`s `pnpm
start:local`. Task Scheduler scripts manage only `IkiMetrRealtorCollector` for
`HARMANKARDON\9305r`, invoking Ubuntu as user `rahim` without storing a Windows
password or requesting elevation. Installation is idempotent and supports
`-WhatIf`; status shows state and last result; uninstall requires confirmation
or `-Force`.

### RU/AZ UI

The source form exposes `Bina.az — агентства` / `Bina.az — agentliklər` with
safe defaults: AZ, 100 listings maximum, depth 0, delay 10,000 ms. Sources and
Runs show automatic collection, six-hour interval, last/next run, checked
pages, agencies, new contacts, duplicates, private sellers skipped, terminal
status, and a safe stop reason. Existing manual Run, kill switch, auth, CSRF,
and rate limiting remain intact. All new labels live in the central dictionary
and have RU/AZ tests.

## Data minimization

Persist only normalized phone, displayed name, agency, `platform=bina.az`,
visible city/region when available, canonical listing URL, discovery time,
short visible evidence, classification, and verification status. Do not retain
images, video, full descriptions, cookies, browser profiles, full HTML,
credentials, downloads, or unrelated property attributes.

## Failure model

Protection signals produce a safe `blocked` run, an audit summary, and a
24-hour cooldown. Cancellation and kill switch produce `cancelled`. Removed
pages, missing/invalid phones, private sellers, and isolated parse/timeout
errors increment counters and continue until the hard technical-error threshold
is reached. All error surfaces use enumerated safe reasons; raw remote content
and full phones are never interpolated.

## Test and acceptance strategy

Every behavior is implemented test-first. Unit/integration/Playwright tests use
only artificial fixtures and explicitly fail unmatched external traffic. Smoke
uses temporary SQLite, validates safe `bina_agency` source creation and
lookalike rejection without invoking the live connector, and retains the full
`test_fixture` worker/contact/evidence/dedup flow.

After all offline checks pass twice, one controlled live acceptance run may
process at most five listings at 10-second delay. CAPTCHA, 403, 429, login, an
external redirect, or a private-seller false positive ends live acceptance
without bypass. A successful live run and rerun must prove visible Agentlik,
click-only phone reveal, evidence correctness, phone-safe logs, and contact
dedup before local `BINA_MAX_LISTINGS` may be raised to 100.
