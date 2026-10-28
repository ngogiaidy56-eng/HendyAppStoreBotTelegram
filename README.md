# HendyAppStoreBotTelegram

Monorepo PNPM cho App Store, Telegram Mini App, Admin Studio và Cloudflare platform. Production architecture: **5 Workers + 3 Pages projects**.

## Three Pages
| Project | Source | Output |
|---|---|---|
| `hendy-web-admin` | `apps/web-admin` | `apps/web-admin/dist` |
| `hendy-mini-app` | `apps/mini-app` | `apps/mini-app/dist` |
| `hendy-web-user` | `apps/web-user` | `apps/web-user/dist` |

## Five Workers
| Worker | Trách nhiệm |
|---|---|
| `hendy-platform-api` | REST API, Telegram auth, admin authorization, releases, D1/R2, feature flags |
| `hendy-telegram-bot` | Telegram webhook và commands |
| `hendy-queue-processor` | Queue jobs, retry/DLQ, broadcast và OTA orchestration |
| `hendy-edge-router` | Maintenance gate, device-aware routing và service binding |
| `hendy-self-healing-bot` | Signed GitHub webhook, replay protection và workflow retry allowlist |

Shared resources: D1 `hendyappstore-db`, private R2 `hendy-app-releases`, KV `hendy-appstore-dedupe`, Queues `hendy-jobs` và `hendy-jobs-dlq`.

## Deploy
Production pipeline: [Deploy Cloudflare Platform](.github/workflows/deploy-cloudflare.yml). Pipeline provisions resources, applies migrations, deploys five Workers, syncs runtime secrets, configures webhooks, builds/deploys three Pages, and syncs final API/CORS URLs.

Required Actions Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BOT_TOKEN`, `BOT_WEBHOOK_SECRET`, `SESSION_SECRET` (32+ random bytes), `ADMIN_TELEGRAM_IDS`, `HENDY_GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`.

Optional Actions Variables: `WORKER_SUBDOMAIN`, `WORKER_API_URL`, `TELEGRAM_BOT_WORKER_URL`, `SELF_HEALING_WORKER_URL`, domain override variables, `BOT_USERNAME`, `BANK_SYNC_URL`, `TASKS_CONFIG_JSON`, `MINIGAME_CONFIG_JSON`.

## Local development
Node.js 22.12+ and pnpm 10.18.0:
```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --no-frozen-lockfile
pnpm run preflight:cloudflare
pnpm check
pnpm test
pnpm --filter @hendy/web-admin build
pnpm --filter @hendy/mini-app build
pnpm --filter @hendy/web-user build
```

Read [deployment guide](docs/CLOUDFLARE-DEPLOYMENT.md), [architecture](docs/ARCHITECTURE.md), [environment guide](docs/ENVIRONMENT.md), and [security guide](docs/SECURITY.md).

## Security
Admin UI is not an authorization boundary; API routes must enforce admin permissions. Secrets must be encrypted with the GitHub repository public key before GitHub API calls and must never be logged or read back. Keep R2 private and use short-lived download tickets. Rotate any token that may have appeared in Git history.

Native signing secrets do not create native projects by themselves. Signed releases require platform source, isolated runners, signature verification, checksums and Apple notarization where applicable.