# Central Configuration Control Plane

## What it manages

The Admin Studio page **Trung tâm cấu hình** is the control plane for public URLs, runtime parameters, task/minigame JSON, deployment dispatch, and secret sync.

- Non-secret configuration is validated by the API, stored in D1 `central_configs` for audit/history metadata, and synced to the repository's GitHub Actions Variables.
- Runtime credentials are submitted through the existing secrets form and encrypted with the GitHub repository public key before they are sent to the GitHub Actions Secrets API. D1 stores only secret names, updater identity, and update timestamps in `central_config_secrets`; plaintext secret values are never persisted there or returned by read endpoints.
- After a Pages deployment succeeds, `scripts/sync-deployment-domains.mjs` reads the Cloudflare Pages project metadata, prefers a configured custom domain over the `.pages.dev` address, honours a validated domain override when set, updates URL/CORS GitHub variables, then dispatches the Workers deployment workflow unless automatic redeploy is disabled.

## Required GitHub configuration

Create these in **Settings → Secrets and variables → Actions** (repository scope unless your organization policy requires otherwise):

### Secrets

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token permitted to read Pages project metadata, deploy Pages/Workers, and update runtime secrets.
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account identifier. Although it is not a password, keep it in the secret list because existing deploy workflows expect it there.
- `HENDY_GITHUB_TOKEN`: least-privilege repository token with Actions variables and secrets read/write permissions and workflow-dispatch access. This allows the Worker API and domain-sync script to call the GitHub API.
- Existing runtime secrets such as `BOT_TOKEN`, `BOT_WEBHOOK_SECRET`, `SESSION_SECRET`, and `ADMIN_TELEGRAM_IDS`.

### Variables

- `CLOUDFLARE_D1_DATABASE_ID` and `CLOUDFLARE_DEDUPE_KV_NAMESPACE_ID`.
- `MINIAPP_PAGES_PROJECT`, `ADMIN_PAGES_PROJECT`, `STOREFRONT_PAGES_PROJECT` if the default project names differ.
- Optional URL override variables: `MINIAPP_DOMAIN_OVERRIDE`, `ADMIN_DOMAIN_OVERRIDE`, `STOREFRONT_DOMAIN_OVERRIDE`. A custom domain must already be attached to its Cloudflare Pages project and have DNS/TLS configured.
- For a Worker secret that will be updated from the UI, ensure `HENDY_GITHUB_TOKEN` has the permission needed to manage the corresponding repository secret.

## Domain update flow

1. Deploy the Mini App or one/both web frontends.
2. The matching workflow calls the domain-sync script only after the Pages deploy steps succeed.
3. The script reads the actual Pages project domains from the Cloudflare API and updates `APP_URL`, `ADMIN_URL`, `STOREFRONT_URL`, their public-URL aliases, and `CORS_ORIGINS`.
4. The script dispatches `deploy-workers.yml` by default so the updated origins are picked up by the API's CORS configuration and Worker environment.
5. Check GitHub Actions logs for the domain-sync step and the follow-up Workers run. A workflow dispatch is not itself proof that deployment succeeded.

## Operational notes

- Saving variables does not run a deployment by itself. Select the desired deployment targets in the Admin Studio and explicitly confirm the dispatch.
- `VITE_API_BASE_URL` is compiled into frontend bundles; change it and rebuild the relevant frontends before expecting it to take effect.
- Task configuration supports `maxActiveTasks`, `maxTargetCount`, and `maxRewardVnd`.
- Minigame `prizes` accepts 1–12 entries with `key`, `threshold` (0–1000), and `rewardVnd` (0–1,000,000); the sum of thresholds cannot exceed 1000. Include a `try_again` entry for a configured default outcome.
- The Admin UI displays only whether a secret is configured, never its value. Rotating a token replaces the matching GitHub Actions Secret after explicit confirmation.
- Production deployment was not run as part of authoring this feature. Configure and verify secrets, Pages project identifiers, and runtime integrations in your own environment before using live credentials.
