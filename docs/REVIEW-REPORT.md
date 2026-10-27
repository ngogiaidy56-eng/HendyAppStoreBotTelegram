# Kiểm tra và cập nhật kiến trúc — 2026-10-28

## Đã hợp nhất vào source

- Chuyển frontend sang `apps/mini-app`, `apps/web-user`, `apps/web-admin` theo cây thư mục mới.
- Tách runtime: `workers/platform-api` (REST/API), `workers/telegram-bot` (webhook duy nhất), `workers/queue-processor`, `workers/edge-router`, `workers/self-healing-bot`.
- Bổ sung package feature flags có rollout phần trăm; màn quản trị bật/tắt và lưu rollout; API trả trạng thái theo user.
- Bổ sung tính năng Mini App: referral, daily check-in, inbox thông báo, nhiệm vụ, vòng quay miễn phí một lượt/ngày, profile và lịch sử.
- Thêm bảng/migration cho rewards, tasks, queue/DLQ, bot configs, notifications và dynamic feature flags.
- Bổ sung Web Admin pages cho users/products/bot/broadcast/maintenance/features/secrets/module generator/system updater/releases/builds/certificates/logs.
- Bổ sung GitHub Secrets API sử dụng repository public key + libsodium sealed box, allowlist 26 tên secret, xác nhận rõ ràng và audit chỉ lưu tên secret.
- Bổ sung GitHub workflow tạo boilerplate theo lệnh thủ công và mở PR; không tự merge code sinh ra. CLI scaffold đã được chạy thử tạo component và kiểm tra không ghi đè file tồn tại.
- Cập nhật Wrangler bindings và deploy workflows; thêm validator cấu hình workspace; cập nhật `.env.example`, schema tổng hợp và các runbook.

## Kiến trúc đề xuất

Modular monolith API trên Cloudflare Workers cho các luồng nghiệp vụ đồng bộ; worker riêng cho Telegram webhook, queue consumer và self-healing vì có ranh giới tin cậy/đặc tính chạy khác nhau. D1 là nguồn dữ liệu chuẩn cho ví và giao dịch; KV chỉ dành cho dedupe/cache; R2 lưu binary riêng tư. Không chia một Worker cho từng endpoint nếu chưa có dữ liệu tải/vận hành chứng minh cần thiết.

## Kiểm tra đã chạy trong môi trường này

- `node scripts/check-workspace.js`: thành công — manifest JSON, cây tối thiểu và 8 migration.
- `node workers/platform-api/scripts/check.js`: cú pháp JavaScript qua 13 Worker source files.
- `node --test workers/platform-api/test/*.test.js workers/platform-api/src/__tests__/*.test.js packages/feature-flags/test/*.test.js`: 13/13 pass.
- `python scripts/test_db.py`: migration + mua hàng/idempotency + nạp tiền trùng + gifcode + check-in/referral/minigame + queue/features pass.
- YAML parser: 8/8 GitHub Actions workflows parse.
- TOML parser: 5/5 Wrangler configs parse.
- TypeScript transpile syntax: 105 file `.ts/.tsx` pass; relative import existence scan passed.

## Chưa xác nhận / yêu cầu thiết lập thật

- Không thể chạy `pnpm install`, Vite production build, Playwright E2E hoặc Wrangler deploy trong môi trường hiện tại do thiếu PNPM/dependencies và không có kết nối registry/Cloudflare.
- Chưa có native Android/iOS/Windows/macOS project trong source, nên workflow matrix mới kiểm tra sự hiện diện của source; nó không tạo APK/IPA/EXE/DMG giả.
- Nạp tiền cần cấu hình đúng adapter/chữ ký của nhà cung cấp ngân hàng. VietQR chỉ tạo QR từ thông tin đã cấu hình, không thay thế callback thanh toán đã xác minh.
- Dịch vụ MXH/Vietsub cần API nhà cung cấp; đây chưa phải tích hợp hoàn chỉnh.
- Production cần tạo trước D1/R2/KV/Queues/Pages, cấu hình GitHub Actions Secrets/Variables, CORS, webhook Telegram, BOT_USERNAME và Cloudflare Access. Không commit giá trị thật.
- Không có công cụ GitHub có quyền ghi hoặc mạng kết nối tới `github.com` trong phiên tạo source; do đó chưa thể xác nhận đã push source lên remote. Bundle có script push không force-push để chạy từ máy đã xác thực GitHub.
