# Triển khai toàn bộ HendyAppStoreBotTelegram bằng một Cloudflare Worker

## Mục tiêu

Chỉ tạo **một Worker** tên `hendyappstorebotelegram`. Worker này phục vụ:

- Storefront: `/`
- Admin: `/admin/`
- Telegram Mini App: `/miniapp/`
- API: `/api/*`)
- Tải bản phát hành: `/downloads/*`)
- Telegram webhook: `/telegram/webhook`
- Queue consumer, cron cleanup và webhook GitHub tùy chọn.

Không cần tạo ba Pages hoặc năm Workers riêng biệt. D1, R2, KV và Queues vẫn là các binding/tài nguyên Cloudflare mà một Worker có thể sử dụng.

## 1. Cấu hình màn hình Workers & Pages bạn đang mở

Chọn repository `ngogiaidy56-eng/HendyAppStoreBotTelegram`, branch `main`, rồi đặt:

| Trường | Giá trị |
|---|---|
| Project name | `hendyappstorebotelegram` |
| Root directory | `/` hoặc để trống |
| Build command | `pnpm install --no-frozen-lockfile && pnpm run provision:cloudflare:resources && pnpm run build:cloudflare` |
| Deploy command | `pnpm run deploy:cloudflare` |

Không dùng `npm run build` và không đặt output directory thành `dist` ở root. Root `wrangler.toml` khai báo static asset directory là `./public`; build script tạo thư mục đó bằng cách build/gom cả ba giao diện.

Tài liệu Cloudflare: [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) và [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/).

## 2. Build variables and secrets

Trong phần Settings → Builds → Build variables and secrets của Worker, thêm:

- `CLOUDFLARE_ACCOUNT_ID`: Account ID 32 ký tự.
- `CLOUDFLARE_API_TOKEN`:  lưu dưới dạng build secret; cần quyền tạo/đọc D1, Workers KV, R2 buckets, Queues và Workers Scripts. Hãy dùng token giới hạn quyền phù hợp, không dùng token này trong mã nguồn.

Build script tự tìm hoặc tạo các tài nguyên có tên cố định:
- D1: `hendyappstore-db`
- KV: `hendy-appstore-dedupe`
- R2: `hendy-app-releases`
- Queue: `hendy-jobs`)
- Dead-letter Queue: `hendy-jobs-dlq`)

Sau đó, script chèn ID resource vào `wrangler.toml` chỉ trong workspace của lần build. Nếu API token thiếu quyền, build dừng và báo endpoint Cloudflare nào không thể gọi được. Không cần tự gõ D1/KV UUID vào mã nguồn.

## 3. Runtime secrets sau lần deploy đầu

Mở Worker → Settings → Variables and Secrets, thêm Runtime Secrets:

- `BOT_TOKEN`: Telegram bot token.
- `BOT_WEBHOOK_SECRET`: secret token Telegram gửi kèm webhook.
- `SESSION_SECRET`: chuỗi ngẫu nhiên ít nhất 32 bytes.
- `ADMIN_TELEGRAM_IDS`: Telegram user ID quản trị theo định dạng mà mã nguồn hiện có yêu cầu.
- `GITHUB_TOKEN` và `GITHUB_WEBHOOK_SECRET`: chỉ khi bật endpoint tự chạy lại CI.
- Các secret ngân hàng chỉ khi đã xác minh chữ ký webhook từ nhà cung cấp.

Build secret và Runtime Secret là hai mục khác nhau. Không đưa token vào Build command, README hoặc commit Git.

## 4. URL sau deploy

Dùng URL thật hiển thị trong Cloudflare:
- Storefront: `https://<worker-domain>/`
- Admin: `https://<worker-domain>/admin/`
- Telegram Mini App: `https://<worker-domain>/miniapp/`
- API health: `https://<worker-domain>/health`
- Telegram webhook: `https://<worker-domain>/telegram/webhook`

Cấu hình Telegram Mini App dùng URL `/miniapp/` và webhook dùng `/telegram/webhook`, cùng `BOT_WEBHOOK_SECRET` đã khai báo.

## 5. Build và xác minh

Build command sẽ:
1. Cài dependency từ workspace pnpm.
2. Tạo hoặc dùng lại D1/KV/R2/Queues.
3. Build Storefront với base `/`, Admin với base `/admin/`, Mini App với base `/miniapp/`.
4. Gom cả ba vào `public/`, thư mục static asset của Worker.

Deploy command sẽ:
1. Chạy các D1 migrations chưa được áp dụng.
2. Triển khai root `wrangler.toml` dưới dạng một Worker.

Sau khi Deploy báo thành công, kiểm tra:
1. `/` mở Storefront.
2. `/admin/` mở Admin.
3. `/miniapp/` mở Telegram Mini App.
4. `/health` trả về JSON `ok: true` sau khi migrations hoàn tất.
5. Worker Logs không có lỗi binding hoặc runtime secret.

Nếu lỗi là permission denied, bổ sung đúng quyền API token. Nếu `CLOUDFLARE_ACCOUNT_ID` hoặc `CLOUDFLARE_API_TOKEN` thiếu, cấu hình trong Build variables/secrets rồi Retry deployment.

## 6. GitHub Actions

`.github/workflows/ci-test.yml` xác minh test và build asset cho Worker duy nhất. `.github/workflows/deploy-workers.yml` chỉ là phương án triển khai thủ công dự phòng; các workflow deploy Pages riêng đã được vô hiệu hóa để tránh tạo nhiều ứng dụng Cloudflare không cần thiết.

Nếu bật Cloudflare Workers Builds tự động theo push, dùng nó làm pipeline production chính. Không bật thêm một pipeline tự động khác để deploy cùng Worker.


## 7. Ngắt các Pages cũ để chỉ còn một deployment

Các project Pages `hendy-web-admin`, `hendy-mini-app`, `hendy-app-storefront` trước đây có thể vẫn còn Git integration riêng trong Cloudflare. Các workflow YAML đã được chuyển sang kiến trúc một Worker, nhưng việc đó **không tự xóa hoặc ngắt Git integration Pages đã tạo trước đó**.

Để chỉ dùng Worker `hendyappstorebotelegram`:
1. Trong Cloudflare Dashboard, mở từng project Pages cũ (nếu vẫn tồn tại): `hendy-web-admin`, `hendy-mini-app`, `hendy-app-storefront`.
2. Vào Settings → Builds & deployments / Git integration.
3. Tắt auto-deploy hoặc disconnect repository cho các project Pages cũ. Không cần xóa project nếu muốn giữ bản deploy cũ để dự phòng.
4. Mở Workers & Pages → `hendyappstorebotelegram` → Builds. Đảm bảo chỉ Worker hợp nhất đang tự build từ branch `main`.
5. Mở check status `Workers Builds: hendyappstorebotelegram` trong commit mới nhất và xác nhận Success.

Cloudflare có thể tiếp tục hiển thị check thất bại của Pages cũ cho tới khi Git integration của chúng được ngắt; những check đó không phải kết quả deploy của Worker hợp nhất.
