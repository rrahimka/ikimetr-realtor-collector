# Handoff — 2026-08-25 Bina agency pilot (offline implementation)

## Repository state

- Path: `/mnt/c/Users/9305r/Desktop/ikimetr-realtor-collector`
- Branch: `feature/bina-agency-pilot`
- Stable base (unchanged): `f15332dedbdc5c16c9017d5ca66cd7dccdc9634d`
- Task 6 implementation head: `74fd79c`
- No push, merge, live Bina request, `.env` permission change, or real Task
  Scheduler installation has occurred at this checkpoint.

## Implemented

- Added `bina_agency` with exact HTTPS host validation, 100-listing cap,
  depth 0, at least 10-second delay, and two independent permission flags.
- Added pure discovery/phone/agency rules and an offline-tested Playwright
  runner. It uses one browser sequentially, blocks third parties and heavy
  resources, clicks only the visible phone control, and stops on protection or
  structural signals without bypass.
- Added the `blocked` run status with a data-preserving SQLite migration,
  aggregate audit summaries, dedup/recheck support, and preservation of manual
  verification status.
- Added SQLite-backed six-hour scheduling, 24-hour blocked cooldown, no
  overlap, restart recovery, kill/cancel handling, and 7-day URL recheck.
- Added `pnpm start:local`, bounded log rotation/flock, and idempotent PowerShell
  install/status/uninstall scripts for `IkiMetrRealtorCollector`.
- Added RU/AZ source defaults, automatic interval, last/next run, metrics,
  blocked status, and safe stop-reason views while preserving manual Run and
  kill controls.

## Safety state

- Real navigation requires `BINA_ENABLED=true` and
  `BINA_PERMISSION_CONFIRMED=true`; defaults and smoke explicitly set both
  false.
- Exact network scope is `https://bina.az` and `https://www.bina.az`; lookalike,
  HTTP, credentials, non-default ports, external redirects, downloads, and
  third-party WebSockets are rejected.
- Tests use only artificial fixtures and temporary databases. No full phones,
  secrets, cookies, HTML, or `.env` values are emitted by the connector.
- The permission letter stays outside Git.

## Verified at this checkpoint

- Bina locator contract: 11 tests passed after confirming 5 URL cases RED.
- UI targeted tests and `@ikimetr/web` typecheck: exit 0.
- Offline smoke: 2 passed (temporary SQLite, global external HTTP/WebSocket
  blocking, Bina connector disabled). It accepted the exact source and rejected
  `bina.az.evil.test` through the authenticated API.
- A stale project `next dev` from an earlier session was identified by exact
  command path and stopped gracefully before the successful smoke rerun.

## Required next steps

1. Commit the smoke/docs task.
2. Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`,
   `pnpm test:smoke`, and `git diff --check` twice sequentially without edits.
3. Perform the release safety audit and mandatory independent review of
   `f15332d..HEAD`; fix every Critical/Important finding test-first and restart
   both passes if any file changes.
4. Only then update the ignored local `.env` keys, run one five-listing live
   acceptance and one dedup rerun, stopping on any protection/private-seller
   false-positive signal.
5. Install autostart only after successful live acceptance, verify status,
   local health, scheduler, flock, and restart recovery.
6. Record aggregate acceptance results without real phone data, push the
   feature branch non-force, rerun smoke, and prove local/remote SHA equality.

See `README.md`, the design in `docs/superpowers/specs/`, and the implementation
plan in `docs/superpowers/plans/` for exact commands and invariants.
