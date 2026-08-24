# AGENTS.md

Guidance for AI agents working in `ikimetr-realtor-collector`.

## Safety policy

- This is a **local-only** MVP. Bind web/worker to `127.0.0.1`.
- Automated tests and every connector except `bina_agency` use **artificial
  fixtures and mocks only** and must never contact real sites or production
  APIs. The dedicated `bina_agency` connector may make real requests only when
  both `BINA_ENABLED=true` and `BINA_PERMISSION_CONFIRMED=true` are set locally.
- Real `bina_agency` traffic is limited to exact HTTPS hosts `bina.az` and
  `www.bina.az`, and may retain only publicly displayed business contacts from
  listings visibly marked `Agentlik`.
- Never send messages, add people to groups, collect private sellers, or bypass
  CAPTCHA, robots.txt, authentication, or rate limits. Proxies, stealth,
  fingerprint evasion, hidden/private APIs, and outreach are prohibited.
- Keep secrets in environment variables only; never commit `.env`, tokens,
  passwords, or session secrets.
- Use `+994…` style numbers only when they are clearly artificial fixtures.

## Working environment

- Run project commands inside **WSL Ubuntu**, not Windows Node/PowerShell/cmd.
- Activate Node via nvm before commands:
  `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"`.
- The repository is at `/mnt/c/Users/9305r/Desktop/ikimetr-realtor-collector`.

## Verification commands

Run before committing changes:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:smoke
git diff --check
```

All must exit `0`.

## Rules

- Do not use `git reset --hard`, `git clean`, or force push.
- Do not weaken TypeScript, ESLint, or tests; avoid `@ts-ignore`/`eslint-disable`.
- Do not add dependencies without proven necessity.
- Do not modify `.qwen/settings.json`, Windows security settings, or WDAC.
- Mock external HTTP in tests; permit the artificial fixture connector only
  when `ALLOW_TEST_CONNECTOR=true` is explicitly set. Tests must never enable
  real Bina traffic.
- Do not store permission letters, browser profiles, cookies, raw HTML, media,
  full descriptions, or full phone numbers in logs.

## Key files

- `HANDOFF.md` — last session checkpoint.
- `docs/superpowers/specs/` — architecture and completion design.
- `docs/superpowers/plans/` — implementation plans.
- `README.md` — run/demo instructions.
