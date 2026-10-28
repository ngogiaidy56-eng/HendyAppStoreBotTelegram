# Triển khai HendyAppStoreBotTelegram: 5 Workers + 3 Pages

## 1. Targets
| Loại | Tên | Chức năng |
|---|---|---|
| Worker | `hendy-platform-api` | REST API, Telegram auth, D1/R2, release tickets |
| Worker | `hendy-telegram-bot` | Telegram webhook và command modules |
| Worker | `hendy-queue-processor` | Queue consumer, retry/DLQ, broadcast và job orchestration |
| Worker | `hendy-edge-router` | Maintenance guard, adaptive routing và service binding |
| Worker | `hendy-self-healing-bot` | Signed GitHub webhook và workflow retry allowlist |
| Pages | `hendy-web-admin` | Admin Studio |
| Pages | `hendy-mini-app` | Telegram Mini App |
| Pages | `hendy-web-user` | Storefront và downloads |

Tài nguyên: D1 `hendyappstore-db`, R2 private `hendy-app-releases`, KV `hendy-appstore-dedupe`, Queues `hendy-jobs` và `hendy-jobs-dlq`.

## 2. GitHub Actions Secrets
Repository → Settings → Secrets and variables → Actions → Secrets:
- `CLOUDFLARE_API_TOKEN`: quyền tối thiểu cho Workers, Pages, D1, KV, R2 và Queues.
- `CLOUDFLARE_ACCOUNT_ID`
- `BOT_TOKEN`
- `BOT_WEBHOOK_SECRET`
- `SESSION_SECRET`: ít nhất 32 bytes ngẫu nhiên.
- `ADMIN_TELEGRAM_IDS`
- `HENDY_GITHUB_TOKEN`: quyền cần thiết để quản lý Actions runs/variables và repository webhooks.
- `GITHUB_WEBHOOK_SECRET`: HMAC secret cho webhook self-healing.

Chỉ thêm bank/provider/certificate secrets sau khi hợp đồng chữ ký và quy trình build đã được kiểm thử. Không commit token, certificate, keystore hoặc `.dev.vars`.

## 3. Actions Variables tùy chọn
`WORKER_SUBDOMAIN`, `WORKER_API_URL`, `TELEGRAM_BOT_WORKER_URL`, `SELF_HEALING_WORKER_URL`, `MINIAPP_DOMAIN_OVERRIDE`, `ADMIN_DOMAIN_OVERRIDE`, `WEB_USER_DOMAIN_OVERRIDE`, `BOT_USERNAME`, `BANK_SYNC_URL`, `TASKS_CONFIG_JSON`, `MINIGAME_CONFIG_JSON`.

## 4. Triển khai tự động
1. Push lên `main` hoặc chạy Actions → Deploy Cloudflare Platform → Run workflow.
2. Workflow xác thực secrets bắt buộc và tạo/tái sử dụng D1, KV, R2, Queues.
3. Tạo/tìm ba Pages projects, phát hiện URL và cấu hình CORS.
4. Chèn IDs/vars vào Wrangler configs và áp dụng D1 migrations.
5. Deploy lần lượt năm Workers.
6. Đồng bộ runtime secrets tới Worker đúng scope.
7. Đăng ký Telegram webhook và GitHub self-healing webhook.
8. Build từng frontend với `VITE_API_BASE_URL` và deploy ba Pages.
9. Đồng bộ domain/CORS cuối cùng.

Không chạy pipeline production thứ hai cùng lúc. Nếu Pages cũ bật Git auto-build, tắt automatic deployments trong Settings → Builds để tránh ghi đè deployment của GitHub Actions.

## 5. Build settings nếu triển khai Pages thủ công
Root directory là repository root.
| Pages | Build command | Output directory |
|---|---|---|
| `hendy-web-admin` | `pnpm install --no-frozen-lockfile && pnpm --filter @hendy/web-admin build` | `apps/web-admin/dist` |
| `hendy-mini-app` | `pnpm install --no-frozen-lockfile && pnpm --filter @hendy/mini-app build` | `apps/mini-app/dist` |
| `hendy-web-user` | `pnpm install --no-frozen-lockfile && pnpm --filter @hendy/web-user build` | `apps/web-user/dist` |

Đặt `VITE_API_BASE_URL` thành HTTPS URL của `hendy-platform-api`. Workflow tự inject biến này khi build qua Wrangler Pages.

## 6. Local validation
```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --no-frozen-lockfile
pnpm run preflight:cloudflare
pnpm check
pnpm test
pnpm --filter @hendy/web-admin build
pnpm --filter @hendy/mini-app build
pnpm --filter @hendy/web-user build
```

## 7. Đồng bộ secrets
Admin form chỉ gửi allowlisted secrets đến Platform API; backend mã hóa bằng GitHub repository public key trước khi gọi GitHub API. Sau khi cập nhật GitHub Actions Secrets, chạy workflow `Sync Runtime Secrets` thủ công và nhập `SYNC` nếu cần đồng bộ ngay. Không có API nào được phép đọc lại secret plaintext.

## 8. Native build/signing
Secret keystore/certificate chỉ là đầu vào. Build APK/AAB, IPA, EXE/MSIX hoặc DMG/PKG cần source native, toolchain và runner phù hợp, kiểm tra chữ ký/checksum; iOS/macOS cần runner macOS và quy trình Apple signing/notarization hợp lệ.

## 9. Sau deploy
- Xác nhận năm Workers đã deploy và không còn placeholder `REPLACE_WITH_...`.
- Kiểm tra Telegram webhook, API health và queue consumer.
- Mở cả ba Pages và kiểm tra responsive UI, API/CORS, download tickets.
- Kiểm tra logs không chứa secret; thử rollback/restore trong staging.