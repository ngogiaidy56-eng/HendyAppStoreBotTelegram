# Deployment runbook

## 1. Local prerequisites

- Node.js 22 or newer.
- PNPM 10.18 or compatible 10.x.
- Python 3.10+ for the SQLite migration/business-invariant tests.
- A Cloudflare account with Workers, D1, R2, KV, Queues and Pages access.
- A GitHub repository with Actions enabled.

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

`pnpm build`/frontend tests require packages from npm and a working package registry connection.

## 2. Create Cloudflare resources first

Create a D1 database named `hendyappstore-db`, an R2 bucket named `hendy-app-releases`, a KV namespace for self-healing deduplication, and the Pages projects:

- `hendy-mini-app`
- `hendy-web-admin`
- `hendy-app-storefront`

The deploy workflow creates Queues `hendy-jobs` and `hendy-jobs-dlq`. If the account has existing resources under different names, align Wrangler configs and the workflow before deployment.

## 3. GitHub Actions environment

Create a protected GitHub Environment named `production`. Add repository/environment **Secrets**:

- `CLOUDFLARE_API_TOKEN` — restricted to the target account and required Workers/D1/R2/Queues/Pages permissions.
- `CLOUDFLARE_ACCOUNT_ID`.
- `BOT_TOKEN`, `BOT_WEBHOOK_SECRET`, `SESSION_SECRET` (at least 32 random bytes), `ADMIN_TELEGRAM_IDS`.
- `BANK_WEBHOOK_SECRET` only when the provider signature contract is configured.
- `HENDY_GITHUB_TOKEN` — least-privilege token for Actions secrets/workflow dispatch if the UI's GitHub integration is enabled.
- `GITHUB_WEBHOOK_SECRET` for the self-healing webhook.

Create GitHub **Variables**:

- `CLOUDFLARE_D1_DATABASE_ID` — UUID of the existing D1 database.
- `CLOUDFLARE_DEDUPE_KV_NAMESPACE_ID` — ID of the existing KV namespace.

Don't paste real secrets into `.env.example` or commit `.dev.vars`. Set Worker secrets through the Sync Runtime Secrets workflow or `wrangler secret put` after reviewing their exact destinations.

## 4. Deploy sequence

1. Push to `main` or run `CI Test` manually; require CI to pass.
2. Verify resource IDs and run `Deploy Workers`. It applies D1 migrations and deploys platform API, Telegram bot, queue processor, edge router and self-healing worker.
3. Run `Deploy Mini App` and `Deploy Web` after setting `CLOUDFLARE_PAGES_API_TOKEN` if that workflow requires a separate token, plus the Pages project variables in workflow config.
4. Configure Telegram's webhook URL to the **Telegram bot Worker**, not the platform API: `/telegram/webhook`. Provide the exact `secret_token` matching the Worker secret `BOT_WEBHOOK_SECRET`. Do not set webhook secret values in URLs.
5. Add exact deployed HTTPS frontend URLs to `CORS_ORIGINS` and the corresponding `APP_URL`, `ADMIN_URL`, and `BOT_USERNAME` variables.
6. Sign in as a Telegram ID listed in `ADMIN_TELEGRAM_IDS`; create a test product and inventory, then test checkout and insufficient-balance paths on staging.
7. For deposits, validate the bank provider's event schema, signature algorithm, transaction idempotency and settlement timing in staging before enabling real money.
8. Protect Admin Studio with Cloudflare Access or an equivalent identity layer; monitor Workers logs and test R2/D1 backup restoration.

## 5. Safe push from a local clone

To import this source into the target repository (including a repository that already has a README or earlier setup commits), run `scripts/push-to-github.ps1` on Windows or `bash scripts/push-to-github.sh` on Linux/macOS from the project root. These wrappers run `scripts/push-to-github.py`, which clones the remote into a sibling working directory, copies source files while excluding local dependencies/build output/secrets/certificates, removes only the interrupted `.bootstrap` staging directory, commits the import, and pushes `HEAD` to `main` without force-pushing. It deliberately stops if its working clone already exists or the local Git commit identity is not configured. Review the copied files and the diff before accepting the resulting commit. The script requires GitHub write access through your locally configured Git credentials; it does not configure Cloudflare or deployment secrets.

Never run remote migrations until the D1 ID/account have been independently verified. Deploying does not automatically configure Telegram, a bank provider, custom domains, Apple signing or Cloudflare Access.
