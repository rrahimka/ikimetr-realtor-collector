# Handoff — 2026-08-14 checkpoint (RU/AZ + CSV)

## Repository state

- Path: `/mnt/c/Users/9305r/Desktop/ikimetr-realtor-collector`
- Branch: `safety/qwen-collector-2026-08-12` (pushed to `origin/safety/qwen-collector-2026-08-12`)
- Working tree clean at previous HEAD `335f31e`.

## Environment (WSL Ubuntu)

- Node `v24.19.0` (nvm: `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"`).
- pnpm `11.21.0`.

## Verified (all exit 0)

- `pnpm test` — unit/integration (incl. new i18n + CSV tests).
- `pnpm typecheck` — 5 packages.
- `pnpm lint` — no errors/warnings.
- `pnpm build` — next build + worker tsc.
- `pnpm test:smoke` — 2 passed (collector pipeline; language toggle + CSV import).

## What this milestone adds

- RU/AZ localisation: `apps/web/src/lib/i18n.ts` (central dictionary) +
  `lib/lang.ts` (`getLang` via cookie) + `components/lang-switcher.tsx`
  (client-side cookie set + reload). All main pages/actions translated; enum
  labels localised; RU fallback.
- Contacts CSV import/export: `lib/csv.ts` parser + formula-injection-safe
  export, `lib/csv-import.ts` (accepted/rejected/duplicates report),
  `api/import/contacts/route.ts` (POST, 5 MB limit, auth+CSRF),
  `components/contacts-import.tsx` (upload UI + report + template download).
- Session cookie `SameSite` changed to `lax` for redirect compatibility
  (still HttpOnly, path `/`, 1-day TTL); CSRF cookie unchanged.

## Next task

None required for the local MVP. Optional: deeper AZ coverage for review/source
forms, and a documented clean-demo script against a throwaway DB.
