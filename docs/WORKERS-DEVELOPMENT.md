# Phát triển và vận hành kiến trúc 5 Workers + 3 Pages

Tài liệu dành cho repository `ngogiaidy56-eng/HendyAppStoreBotTelegram`. Kiến trúc production gồm năm Workers tách biệt theo trách nhiệm, ba Pages riêng, D1/R2/KV/Queues và GitHub Actions điều phối triển khai. Không dùng cấu hình single-Worker cũ.

## 1. Yêu cầu môi trường

- Node.js 22.12 trở lên.
- pnpm 10.18.0.
- Git.
- Cloudflare account; quyền tạo/đọc Workers, Pages, D1, KV, R2, Queues và Durable Objects.
- GitHub CLI (`gh`) chỉ cần nếu muốn dispatch workflow bằng terminal.

Cài dependencies tại repository root:

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --no-frozen-lockfile
```

Windows PowerShell có thể chạy cùng các lệnh trên sau khi cài Node.js. Nếu shell chưa nhận `corepack`, cài Node.js 22 LTS rồi mở lại PowerShell.

## 2. Năm Workers — trách nhiệm và lệnh phát triển

| Worker | Source | Binding chính | Lệnh chạy local | Lệnh deploy riêng |
|---|---|---|---|---|
| Platform API | `workers/platform-api` | D1, R2, Queue producer, Durable Object | `pnpm run dev:api` | `pnpm run deploy:api` |
| Telegram Bot | `workers/telegram-bot` | D1, Telegram secrets | `pnpm run dev:telegram` | `pnpm run deploy:telegram` |
| Queue Processor | `workers/queue-processor` | D1, Queue producer/consumer, DO binding | `pnpm run dev:queue` | `pnpm run deploy:queue` |
| Edge Router | `workers/edge-router` | D1, Service Binding tới API | `pnpm run dev:edge` | `pnpm run deploy:edge` |
| Self-Healing Bot | `workers/self-healing-bot` | KV, GitHub webhook secrets | `pnpm run dev:self-healing` | `pnpm run deploy:self-healing` |

Mỗi lệnh local cần một terminal riêng. Trước khi chạy, kiểm tra các giá trị `REPLACE_WITH_...` trong Wrangler configs. Pipeline CI tự tạo ID thử nghiệm cho lệnh dry-run, nhưng không thay đổi cấu hình production thật.

### Chạy local

Terminal 1 — API:
```bash
pnpm run dev:api
```

Terminal 2 — Telegram:
```bash
pnpm run dev:telegram
```

Terminal 3 — Queue:
```bash
pnpm run dev:queue
```

Terminal 4 — Edge Router:
```bash
pnpm run dev:edge
```

Terminal 5 — Self-Healing:
```bash
pnpm run dev:self-healing
```

Với các lệnh này, Wrangler hiển thị local URLs trong terminal. Mỗi Worker có Wrangler config riêng; kiểm tra service bindings, D1 database ID, KV namespace ID và local secrets trước khi thử API/Webhook. Edge Router gọi service `hendy-platform-api`; khi chạy local, cần chạy API ở terminal riêng và giữ binding theo tên service đã khai báo trong Wrangler.

## 3. Ba Pages — phát triển giao diện

| Pages | Source | Lệnh dev | Lệnh build |
|---|---|---|---|
| Admin Studio | `apps/web-admin` | `pnpm run dev:pages:admin` | `pnpm --filter @hendy/web-admin build` |
| Telegram Mini App | `apps/mini-app` | `pnpm run dev:pages:miniapp` | `pnpm --filter @hendy/mini-app build` |
| User Storefront | `apps/web-user` | `pnpm run dev:pages:store` | `pnpm --filter @hendy/web-user build` |

Đặt `VITE_API_BASE_URL` bằng HTTPS origin của Platform API trước khi build production. Biến bắt đầu bằng `VITE_` được nhúng vào frontend, vì vậy tuyệt đối không đặt token, certificate password, BOT_TOKEN hoặc API key vào đó.

Build cả ba Pages:

```bash
pnpm run build:cloudflare
```

## 4. Validate toàn bộ topology trước khi deploy

Lệnh kiểm tra năm Wrangler configs, binding, manifest của ba Pages và workflow triển khai:

```bash
pnpm run check:topology
```

Lệnh bundle kiểm thử năm Workers bằng Wrangler dry-run. Script tạm thay placeholder ID bằng UUID thử nghiệm và khôi phục nguyên nội dung từng Wrangler config trong khối `finally`; lệnh này không deploy và không cần truyền production secret:

```bash
pnpm run dry-run:workers
```

Chạy cả hai lệnh:

```bash
pnpm run check:workers
```

Kiểm tra ứng dụng, test và build frontend:

```bash
pnpm run preflight:cloudflare
pnpm check
pnpm test
pnpm run build:cloudflare
```

## 5. Durable Object WebSocket — Live Admin Logs

API Worker export lớp Durable Object `AdminLiveSession`; Queue Processor có binding trỏ đến lớp này ở `hendy-platform-api`. Luồng WebSocket chỉ chấp nhận admin session hợp lệ và Origin nằm trong `CORS_ORIGINS`.

- Endpoint: `wss://<API-WORKER-HOST>/api/admin/live/ws`.
- Subprotocol công khai: `hendy-admin-stream-v1`.
- Credential protocol: `hendy-auth.<ADMIN_SESSION_TOKEN>`. Token chỉ được dùng để xác minh session/admin ở Platform API; bị loại bỏ trước khi forward đến Durable Object.
- Sự kiện được giới hạn vào metadata allowlist (audit/queue/release/deployment/system), không phát các object details hoặc secret values.
- Luồng là server-to-client; dữ liệu gửi ngược từ trình duyệt sẽ đóng kết nối.
- D1 audit và trạng thái job trong Queue Processor phát metadata qua DO binding. Nếu DO không khả dụng, bản ghi audit/job không được rollback chỉ vì telemetry publish thất bại.

Sau deploy, đăng nhập Admin trước rồi kiểm tra trang Live Sync Logs. Trình duyệt chỉ mở WebSocket nếu đã có session token. Không ghi token vào query string hoặc log ứng dụng.

## 6. Lệnh deploy và theo dõi riêng từng Worker

Chỉ chạy lệnh deploy sau khi resource IDs được cấu hình và secrets đã lưu đúng trong Cloudflare:

```bash
pnpm run deploy:api
pnpm run deploy:telegram
pnpm run deploy:queue
pnpm run deploy:edge
pnpm run deploy:self-healing
```

Theo dõi runtime logs:

```bash
pnpm run tail:api
pnpm run tail:telegram
pnpm run tail:queue
pnpm run tail:edge
pnpm run tail:self-healing
```

Không chạy chuỗi deploy thủ công song song với workflow production. Bình thường hãy để **GitHub Actions → Deploy Cloudflare Platform** điều phối thứ tự: provision resources → config Wrangler → migrate D1 → deploy API → deploy các Worker phụ thuộc → sync runtime secrets → đăng ký webhook → build/deploy Pages → đồng bộ domain/CORS.

## 7. Bắt đầu hoặc theo dõi deployment qua GitHub CLI

Xác thực GitHub CLI một lần:

```bash
gh auth login
gh workflow list
gh workflow run deploy-cloudflare.yml --ref main
gh run list --workflow deploy-cloudflare.yml --limit 10
gh run watch
```

Đồng bộ runtime secrets thủ công sau khi cập nhật secrets:

```bash
gh workflow run secrets-sync.yml --ref main -f confirm=SYNC
```

Nếu dùng GitHub Web UI: Repository → Actions → Deploy Cloudflare Platform → Run workflow → chọn `main). Không dán secret vào input workflow hoặc log terminal.

## 8. Secrets và runtime configuration

GitHub → Settings → Secrets and variables → Actions:

**Secrets bắt buộc của deploy workflow**
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- `BOT_TOKEN`, `BOT_WEBHOOK_SECRET`
- `SESSION_SECRET` (ít nhất 32 bytes ngẫu nhiên)
- `ADMIN_TELEGRAM_IDS`
- `HENDY_GITHUB_TOKEN`
- `GITHUB_WEBHOOK_SECRET`

Các secret ngân hàng, Apple/Android/Windows signing chỉ thêm khi tích hợp tương ứng được triển khai và kiểm thử. Giữ private signing materials trong isolated runner, không đưa vào Pages.

**Actions Variables thường dùng**
- `WORKER_SUBDOMAIN`, `WORKER_API_URL`
- `TELEGRAM_BOT_WORKER_URL`, `SELF_HEALING_WORKER_URL`
- `MINIAPP_DOMAIN_OVERRIDE`, `ADMIN_DOMAIN_OVERRIDE`, `WEB_USER_DOMAIN_OVERRIDE`
- `BOT_USERNAME`, `BANK_SYNC_URL`, `TASKS_CONFIG_JSON`, `MINIGAME_CONFIG_JSON`

## 9. Kiểm tra sau deploy

Thay các host dưới đây bằng URLs thực được workflow trả về:

```bash
curl -fsS https://<API-WORKER-HOST>/health
curl -fsS https://<TELEGRAM-WORKER-HOST>/health
curl -fsS https://<QUEUE-WORKER-HOST>/health
curl -fsS https://<EDGE-WORKER-HOST>/edge/health
curl -fsS https://<SELF-HEALING-WORKER-HOST>/health
```

Mở từng Pages:
- `https://hendy-web-admin.pages.dev`
- `https://hendy-mini-app.pages.dev`
- `https://hendy-web-user.pages.dev`

Các hostname trên là mặc định theo project name; custom domain có thể khác. Xác nhận Worker health JSON, Telegram webhook, CORS, D1 migrations, Queue consumer, WebSocket và download ticket. Không đánh dấu production thành công nếu bất cứ bước bắt buộc nào trong workflow đang đỏ.

## 10. Gỡ lỗi nhanh

- **Worker config còn placeholder:** kiểm tra bước provision và Configure Worker IDs trong Actions log.
- **403 từ Cloudflare API:** token thiếu quyền cho tài nguyên đang tạo; bổ sung quyền tối thiểu thích hợp rồi retry.
- **Edge trả 502/503:** kiểm tra Service Binding `PLATFORM_API`, tên `hendy-platform-api) và health endpoint API.
- **Queue không xử lý:** kiểm tra producer/consumer `hendy-jobs), dead-letter queue `hendy-jobs-dlq), D1 status và binding secret.
- **Live logs offline:** kiểm tra Durable Object migration đã deploy ở Platform API, Queue binding có `script_name = "hendy-platform-api"`, session admin hợp lệ, Origin thuộc `CORS_ORIGINS` và API Worker có secret/config hoàn chỉnh.
- **GitHub Actions fail trước deploy:** kiểm tra toàn bộ required Secrets, đặc biệt `GITHUB_WEBHOOK_SECRET) và Environment `production`.
- **Security audit đỏ:** mở bước `pnpm audit`, xác định package và advisory cụ thể; cập nhật lockfile có kiểm thử thay vì bỏ qua audit.

Tham khảo Cloudflare: [Wrangler config / Durable Objects bindings](https://developers.cloudflare.com/workers/wrangler/configuration/), [Durable Objects WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) và [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).
