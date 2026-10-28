# Environment variables and secrets

## Required GitHub Actions secrets

| Secret | Phạm vi | Mục đích |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | CI/CD | Provision/deploy quyền giới hạn |
| `CLOUDFLARE_ACCOUNT_ID` | CI/CD | Cloudflare account |
| `HENDY_GITHUB_TOKEN` | CI/CD/API integration | GitHub workflow/secrets/variables và webhook configuration |
| `GITHUB_WEBHOOK_SECRET` | Self-Healing Worker | Xác minh chữ ký GitHub webhook |
| `BOT_TOKEN` | Platform API only, nếu Mini App còn được dùng | Xác minh chữ ký Telegram Mini App `initData`; không xử lý webhook/bot commands |
| `SESSION_SECRET` | Platform API | Ký session, ít nhất 32 bytes ngẫu nhiên |
| `ADMIN_TELEGRAM_IDS` | Platform API | Danh sách Telegram ID có quyền admin |

Không còn yêu cầu `BOT_WEBHOOK_SECRET`; Telegram Bot Worker và chức năng đăng ký Telegram webhook đã bị loại bỏ. Nếu bỏ cả Telegram Mini App sau này, có thể loại bỏ tiếp `BOT_TOKEN`, `ADMIN_TELEGRAM_IDS` và Telegram authentication routes ở một thay đổi riêng.

## Optional provider/signing secrets

Chỉ khai báo khi tích hợp đã được triển khai và kiểm thử: `BANK_WEBHOOK_SECRET`, `BANK_API_KEY`, `BANK_API_SECRET`, Android keystore, iOS provisioning/certificate, Windows PFX, Apple notarization và R2 access key.

## GitHub Actions variables

- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_DEDUPE_KV_NAMESPACE_ID`
- `WORKER_SUBDOMAIN`, `WORKER_API_URL`, `SELF_HEALING_WORKER_URL`
- `MINIAPP_DOMAIN_OVERRIDE`, `ADMIN_DOMAIN_OVERRIDE`, `WEB_USER_DOMAIN_OVERRIDE`
- `BOT_USERNAME` chỉ nếu Mini App cần deep link referral tới một bot đã được quản lý riêng
- `BANK_SYNC_URL`, `TASKS_CONFIG_JSON`, `MINIGAME_CONFIG_JSON`

## Frontend variables

Đặt `VITE_API_BASE_URL` thành HTTPS URL của Platform API. Mọi biến `VITE_*` được đưa vào bundle frontend, vì vậy không dùng cho token, mật khẩu hoặc private keys.

## Rotation warning

Một phiên bản cũ của `.env.example` chứa giá trị có hình thức bot token thật. Token đó đã bị thay bằng placeholder trong source hiện tại, nhưng giá trị có thể còn trong Git history. Nếu từng hợp lệ, revoke/rotate qua BotFather và chỉ cấu hình token mới trong GitHub/Cloudflare secrets.
