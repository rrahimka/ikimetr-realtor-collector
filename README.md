# İkiMetr Realtor Collector — Local MVP

Local-only administration panel and worker that collect, normalise, classify,
deduplicate and review contacts in a local SQLite database. The default mode
uses only artificial fixtures. A separate, permission-gated `bina_agency`
connector can read public Bina.az agency listings after both explicit local
flags are enabled; it never sends messages or performs outreach.

## Boundaries

Included: core phone/classification logic, SQLite schema and repositories,
fixture/mock connectors, the narrowly scoped Bina.az agency connector, worker
queue and six-hour scheduler, deterministic dedup, local auth, CSRF, rate
limiting, server validation, CSV import/export, search/filter, contact detail,
run history, RU/AZ UI text, and unit/integration/smoke tests.

Excluded: TikTok/Instagram/WhatsApp execution, messaging, private-seller
collection, hidden APIs, CAPTCHA/robots.txt/auth/rate-limit bypass, proxies or
stealth, public deployment, payments, mobile, and AI dedup. Web and worker bind
locally; production services are started only on `127.0.0.1`.

## Requirements

- WSL2 Ubuntu (recommended), Windows host with WSL installed.
- Node.js `>= 22` (verified with `v24.19.0`).
- pnpm `11.21.0` (via corepack: `corepack prepare pnpm@11.21.0 --activate`).

```bash
# activate Node inside WSL (if using nvm)
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
cd /mnt/c/Users/9305r/Desktop/ikimetr-realtor-collector
```

## Install

```bash
pnpm install --frozen-lockfile
```

## Environment

```bash
cp .env.example .env
```

Set at minimum in `.env`:

```dotenv
DATABASE_URL=./data/collector.db
LOCAL_AUTH_PASSWORD=<strong local password>
SESSION_SECRET=<random secret, at least 16 characters>
```

Keep `.env` untracked and never paste its contents into logs or tickets.

The artificial local-demo fixture is disabled by default. Enable only that
fixture for a demo by starting the services with:

```bash
ALLOW_TEST_CONNECTOR=true pnpm dev
```

Alternatively, set `ALLOW_TEST_CONNECTOR=true` in the local `.env`. This flag
enables only the artificial `test_fixture`; it does not enable real external
sources.

`pnpm dev` loads the root `.env` automatically — no need to `source .env` or
`export` variables beforehand. A relative `DATABASE_URL` resolves against
`packages/database`, so web, worker, migrate and seed all open the same file
(`packages/database/data/collector.db`); use an absolute path to override it.

Optional social collection (disabled in this MVP): `APIFY_TOKEN`,
`INSTAGRAM_ENABLED`, `TIKTOK_ENABLED` and related actor IDs.

## Bina.az agency collector

This connector is for the owner's documented, permissioned pilot. It visits
only `https://bina.az` and `https://www.bina.az`, accepts a listing only when
the visible page says `Agentlik`, clicks the visible `Nömrəni göstər` control,
and stores minimal evidence through the existing worker. It does not inspect
hidden endpoints, retain HTML/cookies/images, or collect private-seller phone
numbers.

Install the project-pinned Chromium once inside WSL:

```bash
pnpm --filter @ikimetr/connectors exec playwright install chromium
```

The following `.env` keys control the connector:

```dotenv
BINA_ENABLED=false
BINA_PERMISSION_CONFIRMED=false
BINA_MAX_LISTINGS=100
BINA_DELAY_MS=10000
BINA_CYCLE_HOURS=6
```

Real navigation occurs only when both boolean flags are exactly `true`.
`BINA_MAX_LISTINGS` is clamped to 1–100, delay to at least 10 seconds, and the
cycle to at least 6 hours. Listings are processed sequentially; recently seen
URLs are skipped for 7 days. CAPTCHA, login, HTTP 403/429, or an external
redirect ends the run as `blocked` and delays automatic eligibility for 24
hours. Five consecutive technical errors or a confirmed markup change also
stop the cycle without bypass attempts.

Create a source from **Sources** using `Bina.az — агентства`, an exact allowed
HTTPS URL, AZ, depth 0, delay 10000, and at most 100 pages. **Run** remains
available for a manual cycle. The source kill switch cancels/pauses that source;
setting `BINA_ENABLED=false` and restarting pauses all Bina scheduling. Resume
only after the cause is understood and the permission remains valid.

## Prepare the database

```bash
pnpm db:migrate   # creates packages/database/data/collector.db and applies the schema
pnpm db:seed      # optional: seeds demo keywords and a fixture source
```

## Run

From the repository root (no prior `source .env` / `export` needed):

```bash
pnpm dev
```

This loads the root `.env` and starts both services:

- Web panel: `http://127.0.0.1:3000`
- Worker: polls the queue and processes runs.

For a production build supervised as one local service:

```bash
pnpm build
pnpm start:local
```

If either web or worker exits unexpectedly, the supervisor stops its sibling
and returns a nonzero status.

## Windows logon autostart

Build first, then run these commands from Windows PowerShell in the repository:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-autostart.ps1 -WhatIf
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-autostart.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\windows\status-autostart.ps1
```

The idempotent task is named `IkiMetrRealtorCollector`. It runs as the current
limited user at logon, starts Ubuntu user `rahim`, stores no Windows password,
ignores a second instance, and retries at most three times every five minutes.
The WSL launcher uses `flock`, so another copy exits with code 75.

Operational commands:

```powershell
Start-ScheduledTask -TaskName IkiMetrRealtorCollector
Stop-ScheduledTask -TaskName IkiMetrRealtorCollector
powershell -ExecutionPolicy Bypass -File .\scripts\windows\status-autostart.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall-autostart.ps1
```

Logs are rotated at 5 MB with five retained files. Inspect them inside WSL
without copying secrets:

```bash
tail -n 200 /home/rahim/.local/state/ikimetr-realtor-collector/collector.log
```

## Local login

Open `http://127.0.0.1:3000`, enter the password from `LOCAL_AUTH_PASSWORD`.

## Demo scenario

1. `pnpm install --frozen-lockfile`, `cp .env.example .env`,
   `pnpm db:migrate`, `pnpm db:seed`.
2. `ALLOW_TEST_CONNECTOR=true pnpm dev`, log in.
3. On **Sources**, create a `test_fixture` source with locator
   `fixture://contacts` (or reuse the seeded one) and enqueue a run.
4. On **Runs**, watch the worker move it `queued → running → completed`.
5. On **Contacts**, the fixture contact (`+994501234567`, Aysel Məmmədova)
   appears. Search, filter by type/status/origin, open the detail to see
   evidence.
6. Re-run or re-import to observe idempotent dedup (no duplicate contact).
7. Export CSV from Contacts, or import a Google Maps CSV from **Sources →
   Google Maps CSV import**.
8. Stop services with `Ctrl+C`.

## Language

The panel is available in Russian (default) and Azerbaijani. Use the `RU / AZ`
toggle in the sidebar; the choice is stored in an `HttpOnly` cookie and persists
across pages. Internal enum values (run status, contact type, verification
status) are shown as localised labels while the stored database values stay
unchanged.

## CSV

- Export: `Contacts → CSV экспорт` (UTF-8 with BOM, formula-injection safe:
  leading `= + - @` are prefixed with `'`).
- Import: `Contacts → Импорт CSV контактов` upload form. The same endpoint
  serves a downloadable template (`GET /api/import/contacts`).

Import format (header row required; `phone` is the only mandatory column):

```csv
phone,name,agency,username,platform,source_url,location_type,excerpt
0501234567,Aysel Məmmədova,Bakı Emlak,,website,https://fixture.invalid/1,listing,"Bakı əmlakçı, mənzil satışı"
```

Rules:

- Maximum file size 5 MB; UTF-8; `.csv`.
- `phone` is normalised to E.164 via the existing core code.
- Optional columns: `name`, `agency`, `username`, `platform`, `source_url`,
  `location_type` (`profile|listing|post|comment`), `excerpt`.
- The import is idempotent: re-importing the same phone does not create a new
  contact.

The report shows:

- `total` — data rows in the file;
- `accepted` — new contacts created;
- `rejected` — invalid rows (with a per-row reason, e.g. `invalid phone`);
- `duplicates` — rows whose normalised phone already existed.

Google Maps CSV import (gosom format) remains available from the Sources page.

## Tests and verification

```bash
pnpm test        # unit/integration tests (vitest)
pnpm typecheck   # tsc --noEmit across the workspace
pnpm lint        # eslint across the workspace
pnpm build       # next build + tsc
pnpm test:smoke  # end-to-end Playwright pipeline (worker + web + browser)
```

All of the above must exit `0` before a release commit.

## Package structure

- `packages/core` — phone extraction/normalisation, classification, contracts,
  SSRF/DNS network policy.
- `packages/database` — SQLite migration, Drizzle schema, repositories, seed.
- `packages/connectors` — safe fetch, robots-aware crawler, Apify primitives,
  Google Maps CSV parser, and the permission-gated Bina Playwright runner.
- `apps/web` — Next.js panel and API routes.
- `apps/worker` — polling worker and connector runner.

## Troubleshooting

- `node: command not found` in WSL → activate nvm as shown above.
- `pnpm` missing → `corepack prepare pnpm@11.21.0 --activate`.
- Native module build errors on Windows → run inside WSL; Windows Application
  Control blocks some downloaded native modules.
- `worker` exits immediately → check `.env` (`DATABASE_URL`), then run
  `pnpm db:migrate`.
- Bina run is `blocked` → inspect the short stop reason and wait for the 24-hour
  cooldown; do not attempt a bypass.
- Autostart exits 75 → another project instance owns the flock; check task
  status and the local process before restarting.

## Known limitations

- Social adapters are configuration primitives only; without `APIFY_TOKEN` they
  report `Не настроено`.
- Playwright is dedicated to `bina_agency`; generic websites remain
  Cheerio-first and have no JS fallback.
- UI is minimal (Russian default, Azerbaijani for essential labels) and
  desktop-oriented.
- Live Bina collection stays disabled until local permission flags are set; all
  automated tests use artificial HTML, temporary SQLite, and blocked external
  traffic.

## Current Bina verification status

- Branch: `feature/bina-agency-pilot` (Task 6 implementation head `74fd79c`).
- Offline routed-browser/unit/integration tests: implemented with artificial
  fixtures only.
- Offline smoke: 2 scenarios passed on a temporary SQLite database; safe exact
  Bina source creation returned 201 and the lookalike host returned 400 while
  both Bina permission flags were forced false.
- Controlled live acceptance and Windows task installation: pending the final
  two unchanged verification passes and independent review.

---

## 📖 Руководство пользователя (Инструкция по эксплуатации)

İkiMetr Realtor Collector — локальная система сбора контактов риелторов и клиентских лидов в сфере недвижимости Азербайджана.

### 1. Как запустить систему
Для запуска веб-интерфейса и фонового сборщика выполните команду в терминале WSL:
```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
pnpm start:production
```
После запуска веб-панель доступна в браузере по адресу: **http://127.0.0.1:3000**

### 2. Как остановить систему
В терминале, где запущен коллектор, нажмите комбинацию клавиш `Ctrl + C`. Система корректно завершит текущие задачи, сохранит все данные в базу SQLite и остановит процессы.

### 3. Как проверить статус работы
Чтобы мгновенно увидеть состояние базы данных, количество риелторов, лидов, источников и свежих резервных копий:
```bash
pnpm status
```

### 4. Как подключить Telegram
Для работы с публичными и разрешенными Telegram-группами и каналами:
1. В файле `.env` укажите параметры Telegram (если требуется API):
   ```env
   TELEGRAM_API_ID=...
   TELEGRAM_API_HASH=...
   ```
2. Коллектор автоматически анализирует открытые сообщения и комментарии в подключенных группах. Личные переписки (DMs) и скрытые чаты строго исключены системой безопасности.

### 5. Как включать и выключать источники сбора
1. Откройте в браузере раздел **Источники** (`/sources`).
2. Нажмите переключатель рядом с нужным сайтом или соцсетью (Bina.az, Tap.az, Arenda.az, Instagram, TikTok, Telegram, Facebook).
3. Вы можете запустить сбор вручную кнопкой **«Запустить»** или оставить автосбор по расписанию.

### 6. Где смотреть контакты риелторов
Перейдите в раздел **Контакты** (`/contacts`).
- Здесь отображаются все верифицированные агентства и риелторы с номерами формата `+994...`.
- Доступен поиск по имени, агентству, телефону и городу.
- По клику на контакт открывается карточка с полным списком подтверждений (ссылки на объявления, страницы, посты).

### 7. Где смотреть клиентов (Лиды)
Перейдите в раздел **Лиды** (`/leads`).
- Все лиды разделены по категориям: **Покупатели (BUYER)**, **Продавцы (SELLER)**, **Арендаторы (RENTER)**, **Арендодатели (LANDLORD)**, **Инвесторы (INVESTOR)**.
- Прямые собственники (*«öz evimdir satıram»*) автоматически попадают в раздел «Продавцы».
- Запросы риелторов (*«müştəri üçün axtarırıq»*) маркируются специальным тегом и не засоряют базу прямых покупателей.
- По клику на номер доступен прямой переход в WhatsApp (`wa.me`).

### 8. Как экспортировать базу в Excel (XLSX)
- Для риелторов: на странице `/contacts` нажмите кнопку **«Excel (XLSX)»** — скачается файл `azerbaijan-realtors.xlsx`.
- Для лидов: на странице `/leads` нажмите кнопку **«Excel (XLSX)»** — скачается файл `azerbaijan-real-estate-leads.xlsx`.

### 9. Как получить список номеров в формате TXT
На странице `/contacts` нажмите кнопку **«Номера (TXT)»**. Скачается файл `phones.txt`, содержащий один чистый номер `+994...` на строку (без дубликатов и лишнего текста), готовый для загрузки в CRM или сервисы рассылок.

### 10. Как получить ссылки на WhatsApp
На странице `/contacts` нажмите кнопку **«WhatsApp (TXT)»**. Скачается файл `whatsapp-links.txt` с прямыми ссылками `https://wa.me/994...` на мобильные номера риелторов.

### 11. Где смотреть ошибки и историю запусков
- Вся история сборов доступна в разделе **Запуски** (`/runs`).
- Там указано время старта, количество проверенных страниц, найденных номеров и статус каждого запуска. В случае сбоя источника выводится понятная причина ошибки.

### 12. Резервные копии (Бэкап)
- Резервные копии базы данных создаются автоматически и сохраняются в папку `data/backups/`.
- Чтобы создать резервную копию вручную в любой момент:
  ```bash
  pnpm backup
  ```
- Хранятся последние 14 копий (7 ежедневных и 4 еженедельных), старые удаляются автоматически.

### 13. Аварийная остановка (Kill Switch)
В разделе **Источники** (`/sources`) у каждого источника есть кнопка **Kill Switch** для мгновенной блокировки сбора. При активации глобального Kill Switch сбор по источнику немедленно прекращается.
