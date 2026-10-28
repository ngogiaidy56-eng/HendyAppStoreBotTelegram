# HendyAppStore

Monorepo PNPM cho App Store, Admin Studio, Telegram Mini App và Cloudflare serverless platform. Kiến trúc triển khai hiện tại là **4 Workers + 3 Pages**; Telegram Bot Worker, webhook và lệnh Bot đã được gỡ bỏ.

## Cloudflare Workers (4)

- `hendy-platform-api` — REST API, xác thực session, quyền Admin, D1/R2, release tickets, cấu hình và audit.
- `hendy-queue-processor` — Queue jobs, retry/DLQ, đồng bộ nhà cung cấp và OTA workflow dispatch.
- `hendy-edge-router` — maintenance gate, phân loại thiết bị/layout, Service Binding tới Platform API.
- `hendy-self-healing-bot` — GitHub webhook có chữ ký HMAC, chống lặp bằng KV và retry workflow allowlist. Tên “self-healing bot” không phải Telegram Bot.

## Cloudflare Pages (3)

- `hendy-web-admin` — `apps/web-admin`
- `hendy-mini-app` — `apps/mini-app`
- `hendy-web-user` — `apps/web-user`

**Lưu ý:** Telegram Mini App vẫn được giữ, vì vậy Platform API vẫn cần `BOT_TOKEN` để xác minh chữ ký `initData` của Mini App và `ADMIN_TELEGRAM_IDS` để phân quyền quản trị. Không còn Telegram Bot Worker, webhook, lệnh bot hoặc tin nhắn broadcast qua Bot. Mục “Thông báo trong ứng dụng” chỉ ghi thông báo vào hộp thư Mini App.

## Local development

Yêu cầu Node.js 22.12+ và pnpm 10.18.0:

```powershell
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --no-frozen-lockfile
pnpm run preflight:cloudflare
pnpm run check:workers
pnpm migrate:local
pnpm test
```

Chạy cả bốn Workers local bằng `pnpm dev:all-workers`. Các cổng mặc định: API 8787, Queue 8788, Edge 8789, Self-Healing 8790. Chạy Pages trong terminal riêng bằng `pnpm dev:pages:admin`, `pnpm dev:pages:miniapp`, và `pnpm dev:pages:store`.

Xem [hướng dẫn phát triển](docs/DEVELOPMENT.md), [kiến trúc](docs/ARCHITECTURE.md), [hướng dẫn triển khai](docs/CLOUDFLARE-DEPLOYMENT.md) và [biến môi trường](docs/ENVIRONMENT.md).

## Production deployment

GitHub Actions → **Deploy Cloudflare Platform** provision D1/R2/KV/Queues, apply migrations, deploy bốn Workers, đồng bộ runtime secrets và triển khai ba Pages. Không còn bước cấu hình Telegram webhook.

## Secrets và bảo mật

- `BOT_TOKEN` chỉ dùng cho xác thực Mini App ở Platform API; không đưa vào frontend hoặc Queue Processor.
- Không còn yêu cầu `BOT_WEBHOOK_SECRET`.
- Không commit `.dev.vars`, API tokens, PFX/P12, signing certificates hoặc keystore.
- Một bot token từng nằm trong phiên bản cũ của `.env.example`. Hãy thu hồi/đổi token đó trong BotFather nếu nó từng hợp lệ; chỉnh sửa commit hiện tại không xóa được giá trị khỏi Git history.
- Các workflow ký native cần mã nguồn thực tế trong `native/android`, `native/ios`, `native/windows`, `native/macos`; các thư mục này chưa được cung cấp và workflow sẽ báo thiếu nguồn thay vì đóng gói binary giả.
