# Hướng dẫn phát triển HendyAppStore — 4 Workers + 3 Pages

Kiến trúc hiện tại đã loại bỏ Telegram Bot Worker, Telegram webhook và lệnh Bot. Telegram Mini App vẫn được giữ, nên Platform API cần `BOT_TOKEN` chỉ để xác minh `initData` khi Mini App đăng nhập. Đây không phải Telegram Bot Worker.

## 1. Cài môi trường

Windows PowerShell ở thư mục gốc:

```powershell
node --version
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --no-frozen-lockfile
```

Dùng Node.js 22.12+ và pnpm 10.18.0.

## 2. Bốn Workers

| Worker | Thư mục | Chức năng | Local port |
|---|---|---|---:|
| Platform API | `workers/platform-api` | REST, Admin auth, releases, D1/R2, Durable Object | 8787 |
| Queue Processor | `workers/queue-processor` | Jobs, retries, dead-letter, provider/OTA adapters | 8788 |
| Edge Router | `workers/edge-router` | Maintenance guard, device/layout routing, Service Binding | 8789 |
| Self-Healing | `workers/self-healing-bot` | Signed GitHub webhook, dedupe and safe workflow retry | 8790 |

Three Pages: `apps/web-admin`, `apps/mini-app`, `apps/web-user`.

## 3. Kiểm tra trước khi chạy

```powershell
pnpm run preflight:cloudflare
pnpm run check:topology
pnpm run dry-run:workers
pnpm run check:workers
pnpm migrate:local
pnpm check
pnpm test
```

Dry-run không deploy production. Nó chỉ đóng gói bốn Worker với tài nguyên ID thử nghiệm.

## 4. Chạy bốn Workers local

```powershell
pnpm dev:all-workers
```

Lệnh khởi chạy Platform API ở cổng 8787, Queue ở 8788, Edge ở 8789 và Self-Healing ở 8790. Nhấn Ctrl+C để dừng. Cấu hình local được tạo tạm và tự dọn; local service bindings/secrets vẫn có thể cần cấu hình thêm.

Chạy riêng một Worker:

```powershell
pnpm dev:api
pnpm dev:queue
pnpm dev:edge
pnpm dev:self-healing
```

## 5. Chạy ba Pages

Mỗi lệnh mở trong terminal riêng:

```powershell
pnpm dev:pages:admin
pnpm dev:pages:miniapp
pnpm dev:pages:store
```

Build frontend:

```powershell
pnpm --filter @hendy/web-admin build
pnpm --filter @hendy/mini-app build
pnpm --filter @hendy/web-user build
```

Không đặt tokens hoặc signing credentials trong biến `VITE_*`.

## 6. Lệnh deploy/tail

| Worker | Deploy | Tail |
|---|---|---|
| API | `pnpm deploy:api` | `pnpm tail:api` |
| Queue | `pnpm deploy:queue` | `pnpm tail:queue` |
| Edge | `pnpm deploy:edge` | `pnpm tail:edge` |
| Self-Healing | `pnpm deploy:self-healing` | `pnpm tail:self-healing` |

Trước khi deploy thủ công, IDs D1/KV phải là giá trị thật, Queues tồn tại, bindings đúng và secrets đã cấu hình. Ưu tiên GitHub Actions → **Deploy Cloudflare Platform** để deploy bốn Workers cùng ba Pages theo một pipeline.

## 7. Secrets

Required for platform deployment: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `HENDY_GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`. Platform API additionally requires `SESSION_SECRET`, `ADMIN_TELEGRAM_IDS`, and `BOT_TOKEN` only while Telegram Mini App auth stays enabled. `BOT_WEBHOOK_SECRET` is no longer required.

A previous `.env.example` version contained a token-shaped value. The current file replaces it with a placeholder, but Git history may retain the old value. Revoke/rotate it through BotFather if it was ever valid.

## 8. Notifications and queue

Admin notifications now create in-app notification rows in D1. The system no longer sends broadcast messages via Telegram. Queue Processor supports configured background jobs and OTA workflow orchestration; it rejects unsupported job types to dead-letter handling.

## 9. Native releases

`.github/workflows/matrix-build.yml` validates actual native source and signing values, produces checksums and uploads artifacts to private R2. Source directories `native/android`, `native/ios`, `native/windows`, and `native/macos` are not yet present, so native release jobs cannot complete until projects are added.
