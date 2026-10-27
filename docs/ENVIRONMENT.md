# Environment and secret inventory

## Runtime Worker secrets

| Name | Used by | Notes |
|---|---|---|
| `BOT_TOKEN` | Telegram bot, queue processor, API integrations | Telegram Bot API token. Never expose to browser. |
| `BOT_WEBHOOK_SECRET` | Telegram bot Worker | Match Telegram webhook `secret_token`. |
| `SESSION_SECRET` | Platform API | Random secret at least 32 bytes; used to authenticate session tokens. |
| `ADMIN_TELEGRAM_IDS` | API and bot | Comma-separated Telegram numeric IDs. |
| `BANK_WEBHOOK_SECRET` | Platform API | Only for a confirmed provider HMAC contract. |
| `GITHUB_TOKEN` | Platform API, queue/self-healing as configured | Least privilege for the repository and required workflow operations. |
| `WEBHOOK_SECRET` | Self-healing Worker | Secret used to verify GitHub webhook signatures. |

## GitHub Actions secrets

Configure `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BOT_TOKEN`, `BOT_WEBHOOK_SECRET`, `SESSION_SECRET`, `ADMIN_TELEGRAM_IDS`, `BANK_WEBHOOK_SECRET` (when enabled), `HENDY_GITHUB_TOKEN`, and `GITHUB_WEBHOOK_SECRET` in a protected `production` environment. Add Apple/Android/Windows signing materials only when native projects and release signing steps are present.

## GitHub Actions variables

- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_DEDUPE_KV_NAMESPACE_ID`

## Wrangler variables

Review each `workers/*/wrangler.toml` before deployment. At minimum, update `CORS_ORIGINS`, `APP_URL`, `ADMIN_URL`, `BOT_USERNAME`, the D1 ID and KV namespace ID. `scripts/configure-wrangler.mjs` only replaces checked resource-ID placeholders during the CI deployment job; don't run it locally with production IDs unless that is intentional.

## Frontend variables

Set `VITE_API_BASE_URL` to the platform API's public HTTPS origin for each Pages build. Anything prefixed `VITE_` is bundled into the browser and must be considered public configuration; never store tokens or bank keys there.
