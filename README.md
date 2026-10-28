# HendyAppStoreBotTelegram

Monorepo PNPM cho app store, Telegram Mini App, Admin Studio và Cloudflare serverless platform: **5 Workers + 3 Pages**.

- **Workers:** Platform API, Telegram Bot, Queue Processor, Edge Router, Self-Healing Bot.
- **Pages:** Web Admin, Telegram Mini App, Web User Storefront.
- **Shared resources:** D1, private R2, KV, Queues và Durable Object `AdminLiveSession`.

## Start developing

```powershell
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --no-frozen-lockfile
pnpm run preflight:cloudflare
pnpm run check:workers
pnpm migrate:local
pnpm test
```

Run all five local Wrangler workers: `pnpm dev:all-workers`. Default ports: API 8787, Telegram 8788, Queue 8789, Edge 8790, Self-Healing 8791. Run the three Vite apps separately with `pnpm dev:pages:admin`, `pnpm dev:pages:miniapp`, and `pnpm dev:pages:store`.

See [Development guide](docs/DEVELOPMENT.md), [Architecture](docs/ARCHITECTURE.md), [Cloudflare deploy instructions](docs/CLOUDFLARE-DEPLOYMENT.md) and [Environment variables](docs/ENVIRONMENT.md).

## Production

Use GitHub Actions → **Deploy Cloudflare Platform** to provision resources, apply D1 migrations, deploy the five Workers, sync runtime secrets/webhooks and build/deploy three Pages. Do not deploy Wrangler configs that still include `REPLACE_WITH_...`.

Native signing is a separate manual workflow: [Native Release Matrix](.github/workflows/matrix-build.yml). It requires real native source projects under `native/android`, `native/ios`, `native/windows`, `native/macos` and matching signing secrets. These native source roots are not currently present, so the workflow intentionally reports a clear missing-source error rather than packaging a fake binary.

**Security:** do not commit .dev.vars, bot tokens, Cloudflare tokens, signing certificates or keystores. Rotate any credential that may have been exposed in previous Git history.
