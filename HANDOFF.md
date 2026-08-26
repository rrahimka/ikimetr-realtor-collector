# Handoff — 2026-08-26 Bina live-acceptance & full verification checkpoint

## Repository state

- Branch: `feature/bina-agency-pilot`
- Verification suite (all exit 0):
  - `pnpm test` — 253/253 tests pass across 24 test suites
  - `pnpm typecheck` — clean (5 of 5 workspace packages)
  - `pnpm lint` — clean
  - `pnpm build` — clean Next.js app + worker builds
  - `pnpm test:smoke` — 2/2 end-to-end scenarios pass (`collector pipeline: login → fixture source → run → worker → contact → CSV` and `language toggle and CSV import report`)
  - `git diff --check` — clean

## Completed in this session

1. **Sitemap Discovery Optimization**:
   - Prioritized item sitemaps (`sitemap_items*.xml`) over multi-megabyte category index files.
   - Sorted child item sitemaps in descending order (`sitemap_items3.xml` first) so latest listings are discovered in <0.5s instead of ~60s.
   - Added fast pre-filtering for `/items/` before calling URL validator, eliminating exception overhead on 50k+ category locs.
   - Added `shouldProcessUrl` filter option to `discoverBinaListingUrlsFromSitemaps` and wired it through `bina-playwright.ts`, worker connector runner, and 7-day recheck filter.

2. **Real-DOM Reveal & Selector Hardening**:
   - Modernized seller reveal interaction in `packages/connectors/src/bina-playwright.ts` to support bina.az React markup (`[data-stat="product-call-btn"]`, `[data-cy="bottom-phone"]`, `[data-cy="owner-info"]`, `[data-cy="agency-info"]`, `[data-stat="agency-address"]`).
   - Added container fallback and `try/catch` with 5s timeout on reveal clicks to prevent stalls.
   - Updated `readVisiblePhone` to read both text nodes and dynamic `a[href^="tel:"]` elements created upon reveal click.
   - Confirmed on real bina.az pages: phone extraction (`+994 50 992 57 83`, `+994 55 241 41 31`), agency/agent detection (`Vasitəçi`, `Agentlik`), and private owner skipping (`Mülkiyyətçi` → `skipped_owner`).

3. **Database, Worker & CSV Verification**:
   - Verified pipeline end-to-end: listing checks → `bina_listings` updates (`skipped_owner`, `checked`, `failed`) → phone normalization (`+994...`) → deduplication → SQLite contacts repository.
   - Verified RFC4180 CSV export generation (`/api/contacts/export` via `contactsCsv()`) with UTF-8 BOM, formula escaping, and column structure.
   - Increased smoke runner worker readiness timeout to 120s for reliable cold-start execution on WSL2 NTFS.

## Operational note

- Upstream Cloudflare throttling / managed challenges are properly handled with `protection_interstitial` / `captcha` stop reasons and database cooldown rules.
- When performing manual test runs: keep `BINA_CONTINUOUS_MODE=false` and `BINA_MAX_LISTINGS=5`.
