# Handoff — Phase 2 Mass Source Expansion & Production Verification Checkpoint

## Repository state

- Branch: `feature/bina-agency-pilot`
- Verification suite (all exit 0):
  - `pnpm test` — **292/292 tests pass across 29 test suites**
  - `pnpm typecheck` — clean (5 of 5 workspace packages)
  - `pnpm lint` — clean (0 errors, 0 warnings)
  - `pnpm build` — clean Next.js 16.3 app + worker builds
  - `pnpm test:smoke` — 2/2 end-to-end scenarios pass (`collector pipeline: login → fixture source → run → worker → contact → CSV` and `language toggle and CSV import report`)
  - `git diff --check` — clean (no trailing whitespace or conflict markers)

---

## Azerbaijan Portal Coverage & Release Matrix

| Domain | Status | Connector | Discovery Method | Phone Extraction | Seller Classification |
|---|---|---|---|---|---|
| `bina.az` | `SUPPORTED_VERIFIED` | `bina_agency` | Playwright + Robots Sitemap | Dynamic reveal (`.show-phones`, click guard) | `Agentlik`, `Vasitəçi` vs `Mülkiyyətçi` skip |
| `tap.az` | `SUPPORTED_VERIFIED` | `tap_az` | Cheerio HTTP | Text regex + tel link (hotline filter `+994125261919`) | `Mağaza`, `Vasitəçi` vs `Mülkiyyətçi` skip |
| `arenda.az` | `SUPPORTED_VERIFIED` | `arenda_az` | Cheerio HTTP | Text regex + tel link (hotline filter `+994705962424`) | `Agentlik` vs `Əmlak sahibi` skip |
| `yeniemlak.az` | `SUPPORTED_VERIFIED` | `yeniemlak_az` | Cheerio HTTP | `<img src="/tel-show/...">` + tel links + text | `Vasitəçi / Rieltor`, `Əmlak agentliyi` vs `Mülkiyyətçi` skip |
| `emlakbazari.az` | `SUPPORTED_VERIFIED` | `emlakbazari_az` | Cheerio HTTP | `a[href^="tel:"]` (hotline filter `+994508395158`) | `.property-author__position`, `.agency-badge` vs `Mülkiyyətçi` skip |
| `ipoteka.az` | `SUPPORTED_VERIFIED` | `ipoteka_az` | Cheerio HTTP | Contact block text regex + tel links | `( Vasitəçi )`, `( Agentlik )` vs `( Mülkiyyətçi )` skip |
| `city.az` | `SUPPORTED_VERIFIED` | `city_az` | Cheerio HTTP | `a[href^="tel:"]` (hotline filter `+994502544544`) | Item author block vs `Mülkiyyətçi` skip |
| `vipemlak.az` | `CANDIDATE` | — | HTTP inspection | Dynamic AJAX reveal requires session CSRF token | Documented candidate |
| `ev10.az` | `CANDIDATE` | — | HTTP inspection | React client-side rendered DOM | Documented candidate |
| `kub.az` | `PROTECTED` | — | — | Cloudflare challenge protection | Protected |
| `mertebe.az` | `PROTECTED` | — | — | Cloudflare challenge protection | Protected |
| `emlak.az` | `PROTECTED` | — | — | Cloudflare HTTP 403 protection | Protected |
| `evler.az` | `PROTECTED` | — | — | HTTP 403 protection | Protected |
| `binalar.az` | `AGGREGATOR` | — | — | Aggregator re-publishing listings | Aggregator |
| `binatap.az` | `AGGREGATOR` | — | — | Aggregator re-publishing listings | Aggregator |
| `lalafo.az` | `CANDIDATE` | — | — | General classifieds portal | Candidate |
| `unvan.az` | `CANDIDATE` | — | — | General classifieds portal | Candidate |
| `stop.az` | `DEAD` | `stop_az` | — | Domain unreachable / offline | Dead domain handler |
| `ucuzemlak.az` | `DEAD` | — | — | Domain offline / DNS failure | Dead |
| `menzil.az` | `DEAD` | — | — | Repurposed to website builder | Dead |
| `kupca.az` | `DEAD` | — | — | Domain parking page | Dead |
| `rahathome.az` | `DEAD` | — | — | Domain offline / DNS failure | Dead |
| `kiraye.az` | `DEAD` | — | — | Domain offline / DNS failure | Dead |
| `dasinmazemlak.az` | `DEAD` | — | — | SSL certificate error (HTTP 526) | Dead |

---

## Key Improvements Added in Phase 2

1. **4 New Specialized Production Connectors**:
   - `packages/connectors/src/yeniemlak.ts` + `yeniemlak.test.ts`
   - `packages/connectors/src/emlakbazari.ts` + `emlakbazari.test.ts`
   - `packages/connectors/src/ipoteka.ts` + `ipoteka.test.ts`
   - `packages/connectors/src/city.ts` + `city.test.ts`

2. **Core Contracts & Source Types Expansion**:
   - Updated `packages/core/src/contracts.ts` with `'yeniemlak_az' | 'emlakbazari_az' | 'ipoteka_az' | 'city_az'`.
   - Updated `detectSourceTypeFromUrl` to recognize `yeniemlak.az`, `emlakbazari.az`, `ipoteka.az`, and `city.az`.
   - Updated canonical source registry in `packages/core/src/source-registry.ts` and `source-registry.test.ts`.

3. **Worker Runner & Legacy Source Auto-Routing**:
   - Updated `apps/worker/src/connectors.ts` to dispatch all 7 verified connectors (`bina_agency`, `tap_az`, `arenda_az`, `yeniemlak_az`, `emlakbazari_az`, `ipoteka_az`, `city_az`).
   - Extended auto-routing to automatically route any legacy `website` or `listing_page` source matching any of these domains to its dedicated connector.
   - Added full worker test coverage in `apps/worker/src/worker.test.ts`.

4. **Database Migration & Client Integrity**:
   - Added Drizzle migration `packages/database/drizzle/0005_expand_source_types.sql` (`user_version = 5`).
   - Updated `packages/database/src/client.ts` and `client.test.ts`.

5. **Web UI & Localization**:
   - Added all new source types to `apps/web/src/components/source-form.tsx` (dropdown selector, URL auto-detection, default limits).
   - Added source type display labels and status badges in `apps/web/src/app/sources/page.tsx`.
   - Added complete Russian and Azerbaijani translations in `apps/web/src/lib/i18n.ts` and verified in `i18n.test.ts`.
