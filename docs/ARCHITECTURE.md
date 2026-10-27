# HendyAppStoreBotTelegram — Architecture

## Design target

A PNPM monorepo for the Telegram shop, adaptive application storefront, admin studio and Cloudflare automation. Keep business logic modular but deploy services separately only where trust boundaries or execution profiles differ.

## Runtime services

- `apps/mini-app`: Telegram WebApp UI. It never trusts `initDataUnsafe` for authentication; it sends raw `Telegram.WebApp.initData` to the platform API.
- `apps/web-user`: adaptive storefront for app release downloads.
- `apps/web-admin`: admin control plane for users/products, broadcasts, features, maintenance, secrets sync and release operations.
- `workers/platform-api`: central REST API, Telegram HMAC authentication, sessions, wallet/shop transactions, releases, notification/tasks/referral/check-in/minigame APIs, feature flags and GitHub workflow dispatch.
- `workers/telegram-bot`: the only Telegram webhook endpoint. It validates Telegram's `X-Telegram-Bot-Api-Secret-Token` and dispatches bot commands.
- `workers/queue-processor`: asynchronous jobs, broadcasts, retry and dead-letter handling.
- `workers/edge-router`: device-aware routing and maintenance guard, backed by a service binding to the platform API.
- `workers/self-healing-bot`: signed GitHub failure event handling and allowlisted workflow reruns. It is intentionally not an arbitrary source-code patcher.

## Storage boundaries

- D1 is authoritative for users, balances, wallet ledger, deposits, orders, inventory, task claims, referrals, check-ins, minigame spins, notifications, audit logs and job status.
- KV is only used for non-sensitive request dedupe / cache. Never make KV authoritative for balances or inventory.
- R2 holds release binaries and backup artifacts. Release downloads use short-lived signed tickets; don't make the bucket public.
- GitHub Actions stores deployment credentials and signing materials. A browser form can upload only allowlisted values via the backend; those values are encrypted with the repository's GitHub public key before calling GitHub's Actions Secrets API.

## Consistency controls

- Product price is read from D1, not from browser payloads.
- Wallet changes and their ledger entries are performed in one D1 batch and protected by unique references/constraints.
- Deposit callbacks use an HMAC-SHA256 check over raw request bytes and a provider transaction ID. A production bank needs a provider-specific adapter and secret/signature contract before enabling live crediting.
- Check-in, referral, task claims and minigame spins have unique constraints / ledger references to prevent duplicate rewards.
- Feature flags are stored in D1 and support enabled state plus deterministic rollout percentage. Maintenance controls should not replace authentication/authorization.
- Admin routes require server-side `requireAdmin`; UI visibility is not an authorization control.

## Deployment style

Build frontends separately; deploy each Worker from its own Wrangler config. The first release uses a modular REST API rather than splitting every route into a separate Worker. Queue consumers and the Telegram webhook are separated because their execution and trust boundaries differ.

## Giới hạn phát hành ứng dụng native

Repo hiện không chứa project native Android/iOS/Windows/macOS và không tự biên dịch hoặc ký APK/AAB, IPA, EXE/MSIX, DMG/PKG. Không có binary mẫu/giả được tạo ra. Hãy build và ký bằng toolchain của từng nền tảng, kiểm tra chữ ký và quyền phân phối, rồi tải artifact thật qua Admin Studio. iOS/macOS cần cấu hình profile/chứng chỉ và notarization theo yêu cầu của Apple.
