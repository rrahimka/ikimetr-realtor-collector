# Handoff — 2026-08-26 Bina live-acceptance debugging checkpoint

## Repository state

- Branch: `feature/bina-agency-pilot`, HEAD `a65e153`, working tree clean.
- 250 unit/integration tests, typecheck, lint, build, and 2 smoke scenarios
  pass at HEAD (verified twice for the multi-source commit `76f512e`).

## Fixed this session

1. Multi-source work committed: tap/arenda/stop connectors, ESM test import,
   agency-name extraction, `exactOptionalPropertyTypes` evidence construction
   (`76f512e`).
2. Live-run forensics (runs 43–82):
   - «Elanın sahibi» UI label misclassified every real listing as a private
     seller (`1a0e1ab`).
   - Cloudflare block/challenge interstitials (HTTP 200) were silently counted
     as private_seller → false "completed"; now detected as
     `protection_interstitial`/captcha with blocked+cooldown (`327d5d0`).
   - Current bina.az DOM has no `product-owner`/`data-bina-*` markers; the
     seller card is now found semantically by exact type label
     («Mülkiyyətçi», «Sahibindən», «Agentlik», «Vasitəçi …»), excluding
     `.item-card` decoys, with tag-agnostic reveal control «Nömrəni göstər»
     (`cee0b79`, `d9e7653`) and post-click phone polling (`2f00f2f`).
   - tsx keepNames transform broke the in-page tagging evaluate
     (`__name is not defined`); script shipped as string constant (`a65e153`),
     plus opt-in `onTechnicalError` hook.
3. Verified live on real listings through the connector under tsx: labels are
   found, owner listings skipped, no protection triggers, no technical errors.

## Operational state

- `.env`: `BINA_CONTINUOUS_MODE=false` (continuous auto-runs caused upstream
  rate-limiting; do not re-enable without need), `BINA_MAX_LISTINGS=5`.
- Source 4 kill switch cleared; services running locally via `pnpm start:local`
  (web + one worker).
- Run 79/82 stalled pre-listing right after diagnostic browsing bursts —
  signature of upstream soft-throttling of our IP. Stopped live attempts.

## Required next steps

1. Wait out throttling (≥24h since last burst), then ONE controlled 5-listing
   manual run; stop immediately on any protection signal.
2. If accepted>0: verify contact row, CSV export, dedup rerun.
3. Release audit `f15332d..HEAD`, then push non-force per AGENTS.md.

See `README.md` and `docs/superpowers/` for design invariants.
