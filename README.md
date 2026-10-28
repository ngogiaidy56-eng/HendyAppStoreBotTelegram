# HendyAppStoreBotTelegram

Monorepo gồm Telegram Mini App, app store người dùng, Admin Studio và các Cloudflare Workers cho API, Telegram bot, queue jobs, edge routing và tự phục hồi CI.

## Cloudflare architecture

### Three Pages projects
- `hendy-web-admin` — `apps/web-admin/dist`
- `hendy-mini-app` — `apps/mini-app/dist`
- `hendy-web-user` — `apps/web-user/dist`

### Five Workers
- `hendy-platform-api` — REST API, Telegram auth, releases, D1/R2, CORS và cleanup.
- `hendy-telegram-bot` — Telegram webhook và xử lý bot commands.
- `hendy-queue-processor` — Queue consumer, broadcast, bank adapter và OTA workflow.
- `hendy-edge-router` — maintenance gate và service routing tới API.
- `hendy-self-healing-bot` — GitHub webhook có chữ ký và retry chống lặp.

Workflow [`.github/workflows/deploy-cloudflare.yml`](.github/workflows/deploy-cloudflare.yml) tự tạo/tái sử dụng tài nguyên, deploy Workers, build/deploy 3 Pages, đồng bộ URL/CORS và đăng ký Telegram webhook. Workflow chạy khi push lên `main` hoặc có thể chạy thủ công trong GitHub Actions.

## Required GitHub Actions Secrets

Tạo tại Repository → Settings → Secrets and variables → Actions:
- `CLOUDFLARE_API_TOKEN` (quyền Workers Scripts, D1, KV, R2, Queues và Pages)
- `CLOUDFLARE_ACCOUNT_ID`
- `BOT_TOKEN`
- `BOT_WEBHOOK_SECRET`
- `SESSION_SECRET` (ít nhất 32 byte ngẫu nhiên)
- `ADMIN_TELEGRAM_IDS`
- `HENDY_GITHUB_TOKEN` (quyền quản lý Actions Variables, retry workflow, và tạo/sửa repository webhook)
- `GITHUB_WEBHOOK_SECRET` (secret ký webhook GitHub tới self-healing Worker).
- Các secret bank/provider chỉ khi tích hợp tương ứng đã sẵn sàng.

Actions Variables tùy chọn: `WORKER_SUBDOMAIN`, `WORKER_API_URL`, `TELEGRAM_BOT_WORKER_URL`, `MINIAPP_DOMAIN_OVERRIDE`, `ADMIN_DOMAIN_OVERRIDE`, `WEB_USER_DOMAIN_OVERRIDE`, `BOT_USERNAME`, `BANK_SYNC_URL`, `TASKS_CONFIG_JSON`, `MINIGAME_CONFIG_JSON`.

Script tự provisioning D1, KV, R2 và Queues; không commit ID tài nguyên hoặc secret vào Git.

**Security:** một phiên bản trước của `.env.example` từng chứa bot token thật. Tệp mẫu đã được làm sạch, nhưng giá trị cũ có thể vẫn còn trong Git history. Hãy thu hồi/đổi token bằng BotFather và chỉ lưu token mới trong GitHub Secrets.

## Local checks

Cần Node.js 22.12+ và pnpm 10.18.0.

```bash
pnpm install --no-frozen-lockfile
pnpm run preflight:cloudflare
pnpm check
pnpm test
pnpm --filter @hendy/web-admin build
pnpm --filter @hendy/mini-app build
pnpm --filter @hendy/web-user build
```

Xem [hướng dẫn triển khai Cloudflare](docs/CLOUDFLARE-DEPLOYMENT.md) để biết trình tự CI/CD và cấu hình chi tiết.

## Legacy deployment cleanup

Cấu hình root-level của Worker đơn đã được loại khỏi nhánh `main`; lịch sử Git vẫn giữ các commit cũ để tham khảo. Trong Cloudflare Dashboard, hãy pause/disable Workers Builds của service legacy `hendyappstorebotelegram`, vì cấu hình Git integration trong Dashboard không thể được tắt chỉ bằng commit mã nguồn. Production path hiện tại là workflow `Deploy Cloudflare Platform` với ba Pages và năm Workers.
