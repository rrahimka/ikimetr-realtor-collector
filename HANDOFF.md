# Handoff — Social Account Connections & WhatsApp Group Discovery Complete

## Repository state

- Branch: `feature/bina-agency-pilot`
- Verification suite (all exit 0):
  - `pnpm test` — **471/471 tests pass across 51 test suites**
  - `pnpm typecheck` — clean (5 of 5 workspace packages)
  - `pnpm lint` — clean (0 errors, 0 warnings)
  - `pnpm build` — clean Next.js 16.3 app + worker builds (including `/login`, `/connections`, `/contacts`, `/leads`, `/leads/[id]`, `/runs`, `/review`, `/sources`, `/api/connections`, `/api/connections/[platform]/search-config`, `/api/connections/whatsapp/groups`, `/api/contacts/export`, `/api/leads/export`)
  - `pnpm test:smoke` — 2/2 end-to-end scenarios pass (`collector pipeline: login → fixture source → run → worker → contact → CSV` and `language toggle and CSV import report`)
  - `git diff --check` — clean (no trailing whitespace or conflict markers)
- Verified Databases & State:
  - Realtor Intelligence Pipeline: 779 canonical realtors intact in database with all evidence records.
  - Client Lead Intelligence Pipeline: 15 verified lead records intact in database.
  - Sources Pipeline: 18 active/configured sources.
  - Runs Pipeline: 163 completed/audited run records.
  - Telegram Authorized MTProto Connector: Preserved and prominent in connections UI.

---

## Key Features & Enhancements Added

### 1. Login Page First & UX Refinement
- **Secure Password Reveal**: Accessible eye icon toggle button with `aria-label` ("Показать пароль" / "Скрыть пароль") allowing users to view entered password.
- **Memory Hint**: "Забыли пароль?" button revealing non-secret hint `1-ч-7-G-U-F` only on explicit click.
- **Login Rate Limiting**: In-memory rate limiter (10 attempts per 60s per IP) on `/api/login`, returning HTTP 429 and localized retry notice if exceeded.
- **Unauthenticated View Isolation**: Layout hides internal navigation links (Dashboard, Contacts, Leads, Sources, Runs, Review) from unauthenticated users.

### 2. Language Switcher & Logout
- **Segmented Switcher**: Segmented `[ RU | AZ | EN ]` control with active highlight and persistence via cookie and `/api/lang`.
- **Default Language**: Russian (`ru`) as default, with full Russian, Azerbaijani, and English translations.
- **Global Header Logout**: `[ Выйти ]` button in global header calling `/api/logout` to terminate the session and redirect to `/login` without touching the database.

### 3. Social Account Connections (`/connections`)
- **Connection Cards**: Dedicated UI cards for Instagram, TikTok, Facebook, and WhatsApp.
- **Connection Lifecycle**: `disconnected` -> `connecting` -> `connected` -> `reauth_required`.
- **Human Auth Flow**: QR code modal / confirmation modal for platforms requiring user authorization.
- **Data Safety on Disconnect**: Revoking/disconnecting removes auth tokens while preserving all previously collected contacts and leads.
- **Telegram Connector Preservation**: Dedicated banner card confirming active MTProto connector status.

### 4. Social Search Modes & Safe Presets
- **Granular Surfaces**: Selectable checkboxes for username, bio/about, post captions, comments, hashtags, geo/location, agency name, and phone cross-match.
- **Search Purpose**: Purpose selection (`Риелторы`, `Клиенты`, `Оба варианта`).
- **Maximum Safe Search Preset**: `[ Максимальный безопасный поиск ]` one-click preset activating platform-safe search parameters.

### 5. WhatsApp Authorized Source & Group Discovery
- **Group Management Table**: Displays authorized WhatsApp groups, participant counts, and last activity timestamps.
- **Explicit Consent Confirmation**: Modal requiring explicit user confirmation before granting group search permission.
- **Realtor-Only Group Mode**: Dedicated toggle with automated context validation (`isRealtorGroupContext`) ensuring only verified realtor chats are indexed for participant realtors.
- **Privacy Boundary**:
  - 0 private 1-on-1 direct messages scanned or processed.
  - 0 unapproved/unconsented groups scanned.
  - 0 hidden or masked phone numbers fabricated.
  - Lead intent classification (`BUYER`, `SELLER`, `RENTER`, `LANDLORD`, `INVESTOR`, `REALTOR_REQUEST`).

---

## Verified Commands

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:smoke
git diff --check
```
