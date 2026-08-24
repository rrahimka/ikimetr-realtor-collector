# AGENTS.md

Guidance for AI agents working in `ikimetr-realtor-collector`.

## Safety policy

- This is a **local-only** MVP. Bind web/worker to `127.0.0.1`.
- Use **artificial fixtures and mocks only**. Never contact real people, real
  listing sites, TikTok, Instagram, WhatsApp, or production APIs.
- Never collect real personal data, send messages, add people to groups, or
  bypass CAPTCHA/robots.txt/auth/rate limits.
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
  when `ALLOW_TEST_CONNECTOR=true` is explicitly set.
- Do not collect real data or make production requests.

## Key files

- `HANDOFF.md` — last session checkpoint.
- `docs/superpowers/specs/` — architecture and completion design.
- `docs/superpowers/plans/` — implementation plans.
- `README.md` — run/demo instructions.
