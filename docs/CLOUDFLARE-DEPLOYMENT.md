# HendyAppStoreBotTelegram — triển khai 3 Pages và Workers tự động

## 1. Kiến trúc

Ba Pages project:
| Pages | Ứng dụng | Build output |
|---|---|---|
| `hendy-web-admin` | Admin Studio | `apps/web-admin/dist` |
| `hendy-mini-app` | Telegram Mini App | `apps/mini-app/dist` |
| `hendy-web-user` | Storefront | `apps/web-user/dist` |

Năm Worker:
- `hendy-platform-api`: REST API, Telegram authentication, releases, D1/R2, CORS.
- `hendy-telegram-bot`: Telegram webhook và bot commands.
- `hendy-queue-processor`: consumer của `hendy-jobs`, broadcast, bank adapter và OTA workflow.
- `hendy-edge-router`: kiểm tra bảo trì và định tuyến tới API.
- `hendy-self-healing-bot`: webhook GitHub có HMAC và retry chống lặp.

Tài nguyên dùng chung: D1 `hendyappstore-db`, R2 `hendy-app-releases`, KV `hendy-appstore-dedupe`, Queues `hendy-jobs` và `hendy-jobs-dlq`.

## 2. GitHub Secrets cần tạo

Mở repository → Settings → Secrets and variables → Actions → Secrets:

- `CLOUDFLARE_API_TOKEN`: token có quyền Workers Scripts, D1, KV, R2, Queues và Pages.
- `CLOUDFLARE_ACCOUNT_ID`.
- `BOT_TOKEN`.
- `BOT_WEBHOOK_SECRET`.
- `SESSION_SECRET`: ít nhất 32 byte ngẫu nhiên.
- `ADMIN_TELEGRAM_IDS`.
- `GITHUB_WEBHOOK_SECRET`: secret dùng để ký/kiểm tra webhook GitHub của self-healing Worker.
- `HENDY_GITHUB_TOKEN`: token cần quyền cập nhật GitHub Actions Variables, đọc/ghi Actions runs và tạo/sửa repository webhooks.

Bổ sung secrets bank/provider chỉ khi các tích hợp đó đã được cấu hình. Để bật đầy đủ self-healing, cần cả `HENDY_GITHUB_TOKEN` và `GITHUB_WEBHOOK_SECRET`. Workflow sẽ dừng sớm nếu thiếu secret bắt buộc, thay vì deploy thành công nhưng bot không thể hoạt động.

**Quan trọng:** bản trước của `.env.example` từng chứa một Telegram bot token thật. Tệp hiện đã được làm sạch nhưng token cũ có thể còn trong lịch sử Git. Hãy thu hồi/đổi token bằng BotFather trước khi đưa bot production lên mạng.

## 3. Actions Variables tùy chọn

- `WORKER_SUBDOMAIN` hoặc `WORKER_API_URL` nếu không thể tự phát hiện host `workers.dev`.
- `TELEGRAM_BOT_WORKER_URL` nếu bot Worker dùng custom domain.
- `SELF_HEALING_WORKER_URL` nếu self-healing Worker dùng custom domain.
- `MINIAPP_DOMAIN_OVERRIDE`, `ADMIN_DOMAIN_OVERRIDE`, `WEB_USER_DOMAIN_OVERRIDE` cho custom HTTPS origins của Pages.
- `BOT_USERNAME`, `BANK_SYNC_URL`, `TASKS_CONFIG_JSON`, `MINIGAME_CONFIG_JSON` và các biến nghiệp vụ khác.

Nếu không khai báo domain override, script tự tìm/tạo Pages project, lấy host của Pages và phát hiện workers.dev subdomain để tạo API/Bot URL.

## 4. Trình tự triển khai tự động

Mở GitHub Actions → **Deploy Cloudflare Platform**, hoặc push commit lên nhánh `main`. Workflow thực hiện theo thứ tự:

1. Tạo hoặc dùng lại D1, KV, R2 và Queues.
2. Tạo hoặc dùng lại ba Pages project đúng tên.
3. Xác định URL Pages/Workers, chèn ID D1/KV, APP/ADMIN URL và CORS vào Wrangler config.
4. Áp dụng D1 migrations.
5. Deploy lần lượt API, Telegram bot, Queue processor, edge router và self-healing Worker.
6. Đồng bộ Runtime Secrets đã khai báo vào các Worker tương ứng.
7. Gọi Telegram `setWebhook` để đăng ký `/telegram/webhook` trên Worker bot.
8. Build từng frontend với `VITE_API_BASE_URL` được inject, rồi upload output vào Pages project tương ứng.
9. Đồng bộ domain/CORS lần cuối và deploy lại API/Bot config khi cần.

Không có secret hoặc ID tài nguyên thật nào được commit. Nếu Cloudflare token thiếu quyền, workflow sẽ báo endpoint nào bị từ chối.

## 5. Build settings nếu cần cấu hình Pages thủ công

Khi cấu hình project trong Dashboard, đặt Root directory là repository root `/`:

| Project | Build command | Output directory |
|---|---|---|
| `hendy-web-admin` | `pnpm install --no-frozen-lockfile && pnpm --filter @hendy/web-admin build` | `apps/web-admin/dist` |
| `hendy-mini-app` | `pnpm install --no-frozen-lockfile && pnpm --filter @hendy/mini-app build` | `apps/mini-app/dist` |
| `hendy-web-user` | `pnpm install --no-frozen-lockfile && pnpm --filter @hendy/web-user build` | `apps/web-user/dist` |

Đặt Build variable `VITE_API_BASE_URL` bằng HTTPS origin của Worker `hendy-platform-api`. Pipeline tự động trong GitHub Actions đã inject biến này khi deploy bằng Wrangler; cấu hình trên chỉ cần nếu muốn để Cloudflare tự build trực tiếp từ Git.

Cloudflare hỗ trợ nhiều Pages project trong một monorepo với build/output directory riêng: [Pages Monorepos](https://developers.cloudflare.com/pages/configuration/monorepos/) và [Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).

## 6. Tránh hai pipeline deploy cùng lúc

Các Pages project cũ có thể vẫn bật auto-build khi push Git. Pipeline mới build asset trên GitHub Actions rồi upload bằng Wrangler. Trong mỗi Pages project, vào Settings → Builds → Branch control và tắt automatic production deployments (có thể tắt cả preview deployments). Project Git-integrated vẫn hỗ trợ deploy bằng Wrangler sau khi tắt tự động build: [Cloudflare Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/).

Ngoài ra, tắt Workers Builds tự động cho Worker legacy `hendyappstorebotelegram`. Pipeline chính hiện triển khai theo năm Wrangler config riêng. Giữ Worker legacy chỉ để rollback nếu cần.

## 7. Kiểm tra sau deploy

- `https://hendy-web-admin.pages.dev`: Admin xác thực Telegram và kiểm tra `ADMIN_TELEGRAM_IDS`.
- `https://hendy-mini-app.pages.dev`: mở từ Telegram Mini App.
- `https://hendy-web-user.pages.dev`: Storefront.
- `https://hendy-platform-api.<workers-subdomain>.workers.dev/health`: kỳ vọng JSON có `ok: true`.
- Telegram `getWebhookInfo` phải trả URL `/telegram/webhook` của Worker bot.
- CORS của API phải chứa cả ba origin Pages.
- Queue processor phải subscribe `hendy-jobs`; edge router cần service binding `PLATFORM_API = hendy-platform-api`.
- Self-healing Worker cần KV và secrets tương ứng nếu bật tính năng webhook GitHub.

Nếu deploy dừng, mở job đầu tiên thất bại tại [GitHub Actions](https://github.com/ngogiaidy56-eng/HendyAppStoreBotTelegram/actions). Các nguyên nhân phổ biến là token thiếu quyền, thiếu secrets hoặc custom domain sai định dạng.
