# Handoff — Lead Intelligence & Search Surfaces Architecture Checkpoint

## Repository state

- Branch: `feature/bina-agency-pilot`
- Verification suite (all exit 0):
  - `pnpm test` — **411/411 tests pass across 43 test suites**
  - `pnpm typecheck` — clean (5 of 5 workspace packages)
  - `pnpm lint` — clean (0 errors, 0 warnings)
  - `pnpm build` — clean Next.js 16.3 app + worker builds (including `/leads`, `/leads/[id]`, `/api/leads/export`)
  - `pnpm test:smoke` — 2/2 end-to-end scenarios pass (`collector pipeline: login → fixture source → run → worker → contact → CSV` and `language toggle and CSV import report`)
  - `git diff --check` — clean (no trailing whitespace or conflict markers)
- Verified Databases:
  - Realtor Intelligence Pipeline: 739 canonical realtors intact in database with 914 evidence records.
  - Client Lead Intelligence Pipeline: Dual intent classifier (Buyer, Seller, Renter, Landlord, Investor, Realtor Request), dedicated `leads` SQLite table (migration 0007), Lead Inbox UI (`/leads`), Lead Detail view (`/leads/[id]`), and isolated Lead Export (`/api/leads/export?format=xlsx` & `csv`).
  - Telegram Authorized Connector: `scanTelegramAuthorizedMessages` with strict private DM exclusion, short-window message aggregation (15 min), and dual entity routing.

---

## Azerbaijan Portal Coverage & Release Matrix (24 Sources)

| Domain | Status | Connector | Discovery Method | Phone Extraction | Seller Classification |
|---|---|---|---|---|---|
| `bina.az` | `SUPPORTED_VERIFIED` | `bina_agency` | Playwright + Robots Sitemap | Dynamic reveal (`.show-phones`, click guard) | `Agentlik`, `Vasitəçi` vs `Mülkiyyətçi` skip |
| `tap.az` | `SUPPORTED_VERIFIED` | `tap_az` | Cheerio HTTP | Text regex + tel link (hotline filter `+994125261919`) | `Mağaza`, `Vasitəçi` vs `Mülkiyyətçi` skip |
| `arenda.az` | `SUPPORTED_VERIFIED` | `arenda_az` | Cheerio HTTP | Text regex + tel link (hotline filter `+994705962424`) | `Agentlik` vs `Əmlak sahibi` skip |
| `yeniemlak.az` | `SUPPORTED_VERIFIED` | `yeniemlak_az` | Cheerio HTTP | `<img src="/tel-show/...">` + tel links + text | `Vasitəçi / Rieltor`, `Əmlak agentliyi` vs `Mülkiyyətçi` skip |
| `emlakbazari.az` | `SUPPORTED_VERIFIED` | `emlakbazari_az` | Cheerio HTTP | `a[href^="tel:"]` (hotline filter `+994508395158`) | `.property-author__position`, `.agency-badge` vs `Mülkiyyətçi` skip |
| `ipoteka.az` | `SUPPORTED_VERIFIED` | `ipoteka_az` | Cheerio HTTP | Contact block text regex + tel links | `( Vasitəçi )`, `( Agentlik )` vs `( Mülkiyyətçi )` skip |
| `city.az` | `SUPPORTED_VERIFIED` | `city_az` | Cheerio HTTP | `a[href^="tel:"]` (hotline filter `+994502544544`) | Item author block vs `Mülkiyyətçi` skip |
| `vipemlak.az` | `SUPPORTED_VERIFIED` | `vipemlak_az` | Cheerio HTTP | Session-preserved AJAX reveal (`/ajax.php?act=telshow`) | `(Bütün Elanları)`, `Vasitəçi`, `Agentlik` vs `Sahibi` skip |
| `ev10.az` | `SUPPORTED_VERIFIED` | `ev10_az` | REST API | Official backend REST API (`/api/v1/postings/<id>`) | `is_agent: boolean` + description check, hotline filter (`+994554312159`) |
| `lalafo.az` | `SUPPORTED_VERIFIED` | `lalafo_az` | Cheerio HTTP (Next.js) | Structured `detail` query mobile phone in `#__NEXT_DATA__` | `Təklifin növü` (`Vasitəçi`/`Agentlik`), `user.pro`, `user.business` vs `Mülkiyyətçi` skip |
| `unvan.az` | `SUPPORTED_VERIFIED` | `unvan_az` | Cheerio HTTP | Session-preserved AJAX reveal (`/ajax.php?act=telshow`) | `(Bütün Elanları)`, `Vasitəçi`, `Agentlik` vs `Sahibi` skip; real estate category filter |
| `kub.az` | `PROTECTED` | — | — | Cloudflare challenge protection | Protected |
| `mertebe.az` | `PROTECTED` | — | — | Cloudflare challenge protection | Protected |
| `emlak.az` | `PROTECTED` | — | — | Cloudflare HTTP 403 protection | Protected |
| `evler.az` | `PROTECTED` | — | — | HTTP 403 protection | Protected |
| `binalar.az` | `AGGREGATOR` | — | — | Aggregator re-publishing listings | Aggregator |
| `binatap.az` | `AGGREGATOR` | — | — | Aggregator re-publishing listings | Aggregator |
| `stop.az` | `DEAD` | `stop_az` | — | Domain unreachable / offline | Dead domain handler |
| `ucuzemlak.az` | `DEAD` | — | — | Domain offline / DNS failure | Dead |
| `menzil.az` | `DEAD` | — | — | Repurposed to website builder | Dead |
| `kupca.az` | `DEAD` | — | — | Domain parking page | Dead |
| `rahathome.az` | `DEAD` | — | — | Domain offline / DNS failure | Dead |
| `kiraye.az` | `DEAD` | — | — | Domain offline / DNS failure | Dead |
| `dasinmazemlak.az` | `DEAD` | — | — | SSL certificate error (HTTP 526) | Dead |

---

## Key Improvements Added

1. **4 Priority Connectors Added (`VIPemlak`, `Ev10`, `Lalafo`, `Unvan`)**:
   - `packages/connectors/src/vipemlak.ts` + `vipemlak.test.ts` (Cheerio HTTP with AJAX phone reveal)
   - `packages/connectors/src/ev10.ts` + `ev10.test.ts` (REST API with explicit `is_agent` field)
   - `packages/connectors/src/lalafo.ts` + `lalafo.test.ts` (Next.js query data extraction with strict pro/agency filter)
   - `packages/connectors/src/unvan.ts` + `unvan.test.ts` (Cheerio HTTP with AJAX phone reveal and real estate category verification)

2. **Core Contracts & Source Registry Expansion**:
   - Added `'vipemlak_az' | 'ev10_az' | 'lalafo_az' | 'unvan_az'` to `SOURCE_TYPES` in `packages/core/src/contracts.ts` and `detectSourceTypeFromUrl`.
   - Updated `packages/core/src/source-registry.ts` and `source-registry.test.ts` (11 `SUPPORTED_VERIFIED`, 4 `PROTECTED`, 2 `AGGREGATOR`, 7 `DEAD`).

3. **Worker Runner & Legacy Source Auto-Routing**:
   - Updated `apps/worker/src/connectors.ts` to dispatch all 11 verified connectors.
   - Added legacy source auto-routing for `vipemlak.az`, `ev10.az`, `lalafo.az`, and `unvan.az`.
   - Full worker test coverage in `apps/worker/src/worker.test.ts`.

4. **Database Migration & Client Integrity**:
   - Added Drizzle migration `packages/database/drizzle/0006_expand_tier_b_sources.sql` (`user_version = 6`).
   - Updated `packages/database/src/client.ts` and `client.test.ts`.

5. **Web UI & Localization**:
   - Added all new source types to `apps/web/src/components/source-form.tsx` (dropdown selector, URL auto-detection, default limits).
   - Added source type display labels and status badges in `apps/web/src/app/sources/page.tsx`.
   - Added complete Russian and Azerbaijani translations in `apps/web/src/lib/i18n.ts` and verified in `i18n.test.ts`.
