# Handoff — Final Production Completion Checkpoint

## Repository state

- Branch: `feature/bina-agency-pilot`
- Verification suite (all exit 0):
  - `pnpm test` — 267/267 tests pass across 25 test suites
  - `pnpm typecheck` — clean (5 of 5 workspace packages)
  - `pnpm lint` — clean (0 errors, 0 warnings)
  - `pnpm build` — clean Next.js app + worker builds
  - `pnpm test:smoke` — 2/2 end-to-end scenarios pass (`collector pipeline: login → fixture source → run → worker → contact → CSV` and `language toggle and CSV import report`)
  - `git diff --check` — clean (no trailing whitespace or conflict markers)

## Production Improvements Completed

1. **Eliminated Generic Web Connector Error & Legacy Source Routing**:
   - Upgraded existing legacy sources in SQLite database via migration `0004_fix_source_types.sql` (`tap_az`, `arenda_az`, `bina_agency`, `stop_az`).
   - Implemented automatic legacy routing in `apps/worker/src/connectors.ts` to dispatch recognized Azerbaijani domains (`tap.az`, `arenda.az`, `stop.az`, `bina.az`) to their dedicated connectors even if stored as legacy `website` or `listing_page`.

2. **Tier A Production Connectors (Bina, Tap, Arenda)**:
   - **Bina.az**: Playwright connector with robots-declared sitemaps, seller card detection, dynamic reveal, private owner skipping (`Mülkiyyətçi`), agency extraction, and Cloudflare challenge isolation.
   - **Tap.az**: Cheerio-based connector with listing URL discovery, seller card classification (`Mağaza`, `Vasitəçi` vs `Mülkiyyətçi` skip), support hotline filtering (`+994125261919`), `shouldStop` cancellation, and phone normalization.
   - **Arenda.az**: Cheerio-based connector with modern slug discovery (`/kiraye-`, `/alqi-satqi-`, `/satiliq-`, `/elan/`, `-otaqli-`), seller card detection (`Namiq (Əmlak sahibi)` vs agency), hotline filtering (`+994705962424`), and phone normalization.
   - **Stop.az**: Checked and marked as DEAD / offline based on live network probes.
   - **Rule Verification**: Unified contract applied across all connectors: `accepted`, `private_seller` skip, public phone extraction, Azerbaijan phone normalization, deduplication, SQLite storage. Zero STOCK ADS present.

3. **Canonical Source Registry (24 Azerbaijani Domains)**:
   - Created `packages/core/src/source-registry.ts` and `source-registry.test.ts` covering 24 real estate domains with operational statuses (`SUPPORTED_VERIFIED`, `SUPPORTED_DEGRADED`, `CANDIDATE`, `AGGREGATOR`, `PROTECTED`, `UNSUPPORTED`, `DEAD`).
   - Hard rule enforced: STOCK ADS does not exist and is never included.

4. **Web UI Modern Light Palette & Design System**:
   - Implemented high-contrast, clean light theme in `apps/web/src/app/globals.css` with semantic tokens (`--bg`, `--panel`, `--line`, `--text`, `--accent`, `--success`, `--warning`, `--danger`, `--info`).
   - Responsive sidebar with elevated language bar, structured form grids, badges, and accessible data tables.

5. **Multi-Stage Button Feedback & Toast System**:
   - `ApiButton` with 5 states: `IDLE -> PRESSED -> LOADING -> ACKNOWLEDGED -> SUCCESS / ERROR`.
   - Double-click and double-run protection with disabled states and loading labels.
   - Integrated client-side toast notifications (`ToastContainer`, `showToast`) for actions (run creation, source add, kill switch, CSV export).

6. **Auto-Updating Runs & Source Status**:
   - Created `AutoRefresh` component in `apps/web/src/components/auto-refresh.tsx` to automatically poll and update active runs without requiring manual F5 reload.

7. **Full RU/AZ Localization**:
   - Updated `apps/web/src/lib/i18n.ts` with comprehensive Russian and Azerbaijani translations for all source types, operational statuses, button labels, and toast messages.
