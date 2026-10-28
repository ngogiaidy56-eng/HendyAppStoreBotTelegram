# Phát triển và vận hành 4 Workers + 3 Pages

Telegram Bot Worker đã được loại bỏ. Còn bốn Workers: Platform API, Queue Processor, Edge Router và Self-Healing. Telegram Mini App vẫn là Pages project riêng; API dùng `BOT_TOKEN` để kiểm tra Mini App `initData` nếu Mini App tiếp tục bật.

## 1. Môi trường

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --no-frozen-lockfile
```

## 2. Workers và lệnh

| Worker | Source | Local | Deploy | Tail |
|---|---|---|---|---|
| Platform API | `workers/platform-api` | `pnpm dev:api` | `pnpm deploy:api` | `pnpm tail:api` |
| Queue Processor | `workers/queue-processor` | `pnpm dev:queue` | `pnpm deploy:queue` | `pnpm tail:queue` |
| Edge Router | `workers/edge-router` | `pnpm dev:edge` | `pnpm deploy:edge` | `pnpm tail:edge` |
| Self-Healing | `workers/self-healing-bot` | `pnpm dev:self-healing` | `pnpm deploy:self-healing` | `pnpm tail:self-healing` |

Chạy cả bốn tiến trình local:

```bash
pnpm dev:all-workers
```

Cổng mặc định: API 8787, Queue 8788, Edge 8789, Self-Healing 8790. Local secrets/bindings và Service Binding cần được kiểm tra riêng; khởi động process không chứng minh liên kết giữa services đã chạy đúng.

## 3. Pages

- Admin Studio: `pnpm dev:pages:admin`
- Telegram Mini App: `pnpm dev:pages:miniapp`
- User Storefront: `pnpm dev:pages:store`

Build all:

```bash
pnpm run build:cloudflare
```

## 4. Topology, migrations và tests

```bash
pnpm run preflight:cloudflare
pnpm run check:topology
pnpm run dry-run:workers
pnpm run check:workers
pnpm migrate:local
pnpm check
pnpm test
```

Không deploy nếu có `REPLACE_WITH_...` hoặc resource IDs chưa xác minh.

## 5. Production workflow

Chạy GitHub Actions → Deploy Cloudflare Platform. Pipeline provision/tái dùng D1, KV, R2 và Queues, apply D1 migrations, deploy bốn Workers, đồng bộ runtime secrets, cấu hình GitHub self-healing webhook và deploy ba Pages. Không có bước đăng ký Telegram webhook.

## 6. Live logs

Platform API export Durable Object `AdminLiveSession`. WebSocket endpoint là `/api/admin/live/ws`; chỉ admin session hợp lệ và Origin được allowlist mới kết nối. Queue Processor publish metadata trạng thái job tới Durable Object. Không ghi token vào query string/log.

## 7. Secrets

Cần cấu hình Cloudflare/GitHub credentials và session/admin secrets. `BOT_TOKEN` chỉ cần ở Platform API cho xác thực Mini App nếu dùng Mini App; `BOT_WEBHOOK_SECRET` đã bị gỡ bỏ. Không lưu secrets trong `.env.example` hoặc `VITE_*`.

Một token-shaped value từng có trong phiên bản cũ của `.env.example`; nếu nó là token thật, revoke/rotate qua BotFather vì Git history có thể vẫn giữ giá trị cũ.
