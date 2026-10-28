# Deployment runbook

## 1. Prerequisites

- Node.js 22.12+ and pnpm 10.18.0.
- Python 3.10+ for SQLite/database tests.
- Cloudflare account with Workers, D1, R2, KV, Queues and Pages permissions.
- GitHub Actions enabled with a protected `production` environment.

```bash
pnpm install --no-frozen-lockfile
pnpm check
pnpm test
pnpm run check:workers
```

## 2. Production architecture

Deploy **four Workers plus three Pages**:
- Workers: `hendy-platform-api`, `hendy-queue-processor`, `hendy-edge-router`, `hendy-self-healing-bot`.
- Pages: `hendy-web-admin`, `hendy-mini-app`, `hendy-web-user`.

Telegram Bot Worker/webhook/commands were removed. The Mini App remains optional; if enabled, the API still needs `BOT_TOKEN` for signed WebApp `initData` validation.

## 3. Secrets

Required CI/CD secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `HENDY_GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`. The API requires `SESSION_SECRET`, `ADMIN_TELEGRAM_IDS`, and `BOT_TOKEN` if Telegram Mini App auth is enabled. There is no `BOT_WEBHOOK_SECRET` requirement.

Keep real values only in protected GitHub/Cloudflare Secrets. Do not commit `.dev.vars`, certificates or keystores.

## 4. Deploy sequence

1. Run CI Test and fix actual failures before production.
2. Run GitHub Actions → **Deploy Cloudflare Platform**.
3. The workflow provisions/reuses D1/KV/R2/Queues, configures Wrangler resource IDs and applies D1 migrations.
4. Deploy Platform API, Queue Processor, Edge Router and Self-Healing.
5. Sync runtime secrets and configure the signed GitHub webhook.
6. Build/deploy Admin, Mini App and Storefront Pages.
7. Check API health, queue consumer, Edge Service Binding, WebSocket, CORS and download-ticket authorization.

No Telegram webhook setup is required. In-app notifications are written to D1; the platform no longer sends Telegram broadcast messages.

## 5. Token rotation

An earlier `.env.example` revision contained a token-shaped value that has now been replaced by a placeholder. Because old commits may still contain that value, revoke/rotate it through BotFather if it was ever valid and update the new token in protected runtime secrets if Mini App authentication is still used. Changing the current file does not erase Git history.
