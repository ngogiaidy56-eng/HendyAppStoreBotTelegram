# Triển khai HendyAppStore: 4 Workers + 3 Pages

## Targets

| Loại | Tên | Chức năng |
|---|---|---|
| Worker | `hendy-platform-api` | REST API, Telegram Mini App auth nếu bật Mini App, D1/R2, releases và admin API |
| Worker | `hendy-queue-processor` | Queue consumer, retry/DLQ, provider jobs và OTA workflow |
| Worker | `hendy-edge-router` | Maintenance guard và Service Binding |
| Worker | `hendy-self-healing-bot` | Signed GitHub webhook và retry workflow allowlist; không phải Telegram Bot |
| Pages | `hendy-web-admin` | Admin Studio |
| Pages | `hendy-mini-app` | Telegram Mini App |
| Pages | `hendy-web-user` | Storefront/downloads |

Telegram Bot Worker, Bot webhook, Bot commands và Telegram message broadcast đã được gỡ bỏ. Mini App vẫn xác thực bằng `BOT_TOKEN` phía Platform API nếu tiếp tục sử dụng Mini App.

## GitHub Actions secrets

Cần cho production: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `HENDY_GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `SESSION_SECRET`, `ADMIN_TELEGRAM_IDS`; và `BOT_TOKEN` nếu Mini App được dùng. Không cần `BOT_WEBHOOK_SECRET`.

## Triển khai

1. Push lên `main` hoặc chạy Actions → **Deploy Cloudflare Platform**.
2. Pipeline tạo/tái sử dụng D1, KV, R2 và Queues.
3. Cập nhật ID tài nguyên, CORS và URL; áp dụng D1 migrations.
4. Deploy bốn Workers: Platform API, Queue Processor, Edge Router và Self-Healing.
5. Đồng bộ runtime secrets đến Worker đúng phạm vi, cấu hình GitHub self-healing webhook.
6. Build Admin, Mini App và Storefront; triển khai ba Pages.
7. Đồng bộ lại URL/CORS và kiểm tra API, queue, WebSocket, GitHub webhook.

Không cần đăng ký Telegram Bot webhook. Nếu muốn bỏ cả Telegram Mini App, đó là phạm vi thay đổi khác vì API hiện còn Telegram `initData` authentication.

## Build Pages thủ công

| Pages | Build command | Output |
|---|---|---|
| `hendy-web-admin` | `pnpm install --no-frozen-lockfile && pnpm --filter @hendy/web-admin build` | `apps/web-admin/dist` |
| `hendy-mini-app` | `pnpm install --no-frozen-lockfile && pnpm --filter @hendy/mini-app build` | `apps/mini-app/dist` |
| `hendy-web-user` | `pnpm install --no-frozen-lockfile && pnpm --filter @hendy/web-user build` | `apps/web-user/dist` |

Đặt `VITE_API_BASE_URL` là HTTPS URL của Platform API.

## Kiểm tra local

```powershell
pnpm install --no-frozen-lockfile
pnpm run preflight:cloudflare
pnpm run check:workers
pnpm migrate:local
pnpm test
pnpm dev:all-workers
```

## Lưu ý an toàn

- Không deploy nếu Wrangler configs còn `REPLACE_WITH_...`.
- Giữ R2 private và kiểm tra download tickets.
- Không dùng `BOT_TOKEN` trong Queue Processor hay frontend.
- Một token có dạng thật đã từng nằm trong `.env.example` cũ; hãy thu hồi/đổi token đó nếu từng hợp lệ.
