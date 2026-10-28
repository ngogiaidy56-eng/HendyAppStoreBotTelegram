# HendyAppStoreBotTelegram

Telegram Mini App + app store, Admin Studio, storefront, API, Telegram bot, queue processor and Cloudflare deployment tooling.

## One-Worker Cloudflare deployment

The repository now supports **one Cloudflare Worker** for the complete user-facing system:

- Storefront: `/`
- Admin interface: `/admin/`
- Telegram Mini App: `/miniapp/`
- API and release downloads: `/api/*`, `/downloads/*`
- Telegram webhook: `/telegram/webhook`
- Optional GitHub self-healing webhook: `/github/webhook`
- D1 migrations, R2 releases, KV deduplication, Queue jobs and scheduled cleanup are bound to this same Worker.

Follow [docs/CLOUDFLARE-DEPLOYMENT.md](docs/CLOUDFLARE-DEPLOYMENT.md).

In Cloudflare Workers Builds, connect this repository on `main`, set Root directory to `/`, and use:

**Build command**
```bash
pnpm install --no-frozen-lockfile && pnpm run provision:cloudflare:resources && pnpm run build:cloudflare
```

**Deploy command**
```bash
pnpm run deploy:cloudflare
```

Add `CLOUDFLARE_ACCOUNT_ID` as a build variable and `CLOUDFLARE_API_TOKEN` as a build secret. The token needs permissions to create/read D1 databases, Workers KV namespaces, R2 buckets, Queues and deploy Workers. Provisioning creates or reuses named resources and injects IDs only into the current build workspace. It does not write secrets or IDs into a Git commit.

## Local validation

Requirements: Node.js 22.12+ and pnpm 10.18.0.

```bash
pnpm install --no-frozen-lockfile
pnpm run preflight:cloudflare:single
pnpm run build:cloudflare
pnpm check
pnpm test
```

The unified build creates `public/index.html`, `public/admin/index.html` and `public/miniapp/index.html`. The `public/` directory is generated during build and is not committed.

## Runtime secrets

Configure Worker Runtime Secrets after first deployment: `BOT_TOKEN`, `BOT_WEBHOOK_SECRET`, `SESSION_SECRET` (at least 32 random bytes), and `ADMIN_TELEGRAM_IDS`. Add `GITHUB_TOKEN` and `GITHUB_WEBHOOK_SECRET` only when enabling the GitHub webhook, and banking secrets only after validating the provider's signature contract.

## Notes

- API and the three frontends use one Worker origin, which avoids separate Pages domains and most cross-origin API configuration.
- Telegram webhook must point to `https://<worker-domain>/telegram/webhook` and send the same secret configured as `BOT_WEBHOOK_SECRET`.
- The R2 bucket is private release storage; real app binaries must be uploaded and reviewed before publication.
- Do not commit `.dev.vars`, API tokens, bot tokens, certificates, or real production secrets.
- This deployment architecture is one Worker script plus its bound Cloudflare resources; D1/R2/KV/Queues remain separate resource products managed by that Worker.
