# HƯỚNG DẪN PHÁT TRIỂN HENDY APP STORE — 5 WORKERS + 3 PAGES

Tài liệu này dành cho branch `main` của `ngogiaidy56-eng/HendyAppStoreBotTelegram`. Triển khai production dùng **năm Cloudflare Workers, ba Pages projects, một D1, một R2, một KV namespace và hai Queues**.

## 1. Sơ đồ dịch vụ

| Thành phần | Thư mục / tên Cloudflare | Công việc chính | Local port mặc định |
|---|---|---|---:|
| 1. Platform API | `workers/platform-api` / `hendy-platform-api` | REST API, xác thực Telegram, phiên đăng nhập, admin authorization, D1/R2, releases, audit và WebSocket | 8787 |
| 2. Telegram Bot | `workers/telegram-bot` / `hendy-telegram-bot` | Telegram webhook, kiểm tra secret token và dispatch lệnh bot | 8788 |
| 3. Queue Processor | `workers/queue-processor` / `hendy-queue-processor` | Queue consumer, broadcast, bank adapter, OTA job, retry và DLQ | 8789 |
| 4. Edge Router | `workers/edge-router` / `hendy-edge-router` | Maintenance guard, phân loại layout/device và Service Binding tới API | 8790 |
| 5. Self-Healing | `workers/self-healing-bot` / `hendy-self-healing-bot` | HMAC GitHub webhook, chống lặp bằng KV, retry workflow allowlist | 8791 |
| Pages Admin | `apps/web-admin` / `hendy-web-admin` | Quản trị, secrets automation, logs, maintenance và feature flags | 5174 |
| Pages Mini App | `apps/mini-app` / `hendy-mini-app` | Telegram WebApp | 5173 |
| Pages Storefront | `apps/web-user` / `hendy-web-user` | Kho ứng dụng adaptive UI và download | 5175 |

Shared bindings/resource names: D1 `hendyappstore-db`, R2 private bucket `hendy-app-releases`, KV `hendy-appstore-dedupe`, Queues `hendy-jobs` và `hendy-jobs-dlq`. Platform API khai báo Durable Object class `AdminLiveSession` cho WebSocket admin live logs.

## 2. Cài môi trường trên Windows

Mở PowerShell tại thư mục gốc repository:

```powershell
node --version
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm --version
pnpm install --no-frozen-lockfile
```

Dùng Node.js 22.12 trở lên. Không cần cài Wrangler global; các lệnh bên dưới gọi Wrangler trong workspace.

### Thiết lập secret local

Mỗi Worker cần file `.dev.vars` riêng nếu muốn dùng secret trong local runtime. Ví dụ:

```powershell
Copy-Item .env.example workers/platform-api/.dev.vars
Copy-Item .env.example workers/telegram-bot/.dev.vars
Copy-Item .env.example workers/queue-processor/.dev.vars
Copy-Item .env.example workers/edge-router/.dev.vars
Copy-Item .env.example workers/self-healing-bot/.dev.vars
```

Sau đó sửa từng file theo nhu cầu local. Chỉ điền biến cần thiết cho Worker đó. `.dev.vars` được ignore bởi Git; tuyệt đối không commit bot token, signing key, PFX/P12, keystore hoặc Cloudflare API token. Ví dụ `.env.example` chỉ là mẫu, không phải secrets đã cấu hình.

## 3. Kiểm tra cấu trúc trước khi chạy

```powershell
pnpm run preflight:cloudflare
pnpm run check:topology
pnpm run dry-run:workers
pnpm run check:workers
```

- `preflight:cloudflare`: kiểm tra file cấu hình và ứng dụng.
- `check:topology`: kiểm tra đủ 5 Worker configs, bindings, 3 Pages, WebSocket/Durable Object, pipeline và release-manifest workflow.
- `dry-run:workers`: chạy Wrangler dry-run cho cả năm Worker với ID cục bộ giả; không triển khai production.
- `check:workers`: chạy cả topology check và Wrangler dry-run.

Dry-run là kiểm tra đóng gói/cấu hình; không chứng minh API token, D1 production, Telegram webhook hay các URL thật hoạt động.

## 4. Chạy cả năm Workers local

Để khởi chạy cả năm tiến trình trong một lệnh:

```powershell
pnpm dev:all-workers
```

Script mở năm tiến trình Wrangler ở các cổng mặc định 8787–8791. Nhấn Ctrl+C để dừng tất cả. Mỗi Worker dùng file `wrangler.local.generated.toml` tạm chứa ID D1/KV local-only; script dọn file tạm khi thoát.

Lưu ý: chạy được năm tiến trình không tự động bảo đảm mọi binding liên dịch vụ đã được giả lập. Edge Router dùng Service Binding đến API; kiểm tra tích hợp đầy đủ bằng deployment staging hoặc cấu hình Miniflare/local binding riêng. Không trỏ local dev vào dữ liệu production nếu chưa chủ động chấp nhận rủi ro.

### Chạy riêng một Worker

Mở terminal riêng tương ứng:

```powershell
pnpm dev:api
pnpm dev:telegram
pnpm dev:queue
pnpm dev:edge
pnpm dev:self-healing
```

Có thể chỉ định port nếu cổng mặc định đang bận:

```powershell
node scripts/dev-worker.mjs platform-api --port 8797
```

## 5. Chạy ba frontend Pages

Mở ba terminal riêng:

```powershell
pnpm dev:pages:admin
pnpm dev:pages:miniapp
pnpm dev:pages:store
```

Vite mặc định dùng port ghi trong từng `vite.config.ts`. Đặt `VITE_API_BASE_URL` thành URL HTTPS của API staging để kiểm tra tích hợp; local API có thể dùng URL localhost tùy cấu hình Vite proxy. Không hard-code API token vào biến `VITE_*`, vì mọi biến có tiền tố này có thể được nhúng vào bundle trình duyệt.

## 6. D1 migrations local và test

Đầu tiên chạy migrations vào database local:

```powershell
pnpm migrate:local
```

Lệnh trên tạo Wrangler config local tạm với ID giả, áp migrations và xoá tệp tạm. Không dùng ID giả này để deploy production.

Sau đó chạy:

```powershell
pnpm check
pnpm test
pnpm --filter @hendy/platform-api test
pnpm run check:topology
pnpm run dry-run:workers
```

`pnpm test` gồm unit/security tests hiện có, database checks, feature-flag tests, Mini App tests và release-manifest tests mới. Nếu test yêu cầu Python, cài Python 3 trên máy trước khi chạy.

## 7. Lệnh thường dùng cho từng Worker

| Worker | Dev | Deploy | Tail runtime logs |
|---|---|---|---|
| Platform API | `pnpm dev:api` | `pnpm deploy:api` | `pnpm tail:api` |
| Telegram Bot | `pnpm dev:telegram` | `pnpm deploy:telegram` | `pnpm tail:telegram` |
| Queue Processor | `pnpm dev:queue` | `pnpm deploy:queue` | `pnpm tail:queue` |
| Edge Router | `pnpm dev:edge` | `pnpm deploy:edge` | `pnpm tail:edge` |
| Self-Healing | `pnpm dev:self-healing` | `pnpm deploy:self-healing` | `pnpm tail:self-healing` |

**Trước khi deploy thủ công:** bảo đảm ID D1/KV đã là ID thật, Queue tồn tại, binding Service Binding/DO đúng và runtime secrets được cấu hình. Các config vẫn có `REPLACE_WITH_...` thì không được deploy. Với production, ưu tiên workflow **Actions → Deploy Cloudflare Platform → Run workflow**, vì workflow này provision resources, cập nhật IDs/vars, apply migrations, deploy theo dependency order, đồng bộ secrets/webhooks, build và triển khai ba Pages.

## 8. Build và phát hành ba Pages

```powershell
pnpm --filter @hendy/web-admin build
pnpm --filter @hendy/mini-app build
pnpm --filter @hendy/web-user build
```

Output dự kiến:
- Admin: `apps/web-admin/dist`
- Mini App: `apps/mini-app/dist`
- Storefront: `apps/web-user/dist`

Mỗi Pages project cần project name đúng với workflow và biến `VITE_API_BASE_URL` phải trỏ đến HTTPS API Worker thật. Trong production, workflow Build/Deploy Cloudflare Platform tự inject URL và upload output bằng Wrangler Pages.

## 9. Live status WebSocket và secret sync

- API WebSocket: `/api/admin/live/ws` — chỉ admin đã xác thực mới được mở; token được truyền bằng subprotocol, không ghi vào query string.
- Durable Object: `AdminLiveSession` — phân phối sự kiện audit/queue/deployment dạng metadata, không phát secret plaintext.
- Mã hóa GitHub Actions Secrets: `workers/platform-api/src/services/github-crypto.js` sử dụng libsodium sealed-box với repository public key.
- Đồng bộ secrets tới Workers: GitHub Actions → **Sync Runtime Secrets** → nhập `SYNC`. Không dùng biến public `VITE_*` cho bất kỳ credentials nào.

## 10. Native release matrix và R2

Workflow `.github/workflows/matrix-build.yml` chạy thủ công từ GitHub Actions. Chọn target `android`, `ios`, `windows`, `macos` hoặc `all), nhập version, sau đó workflow sẽ kiểm tra signing secrets, build, xác minh chữ ký, tạo manifest/SHA-256 và upload artifact cùng manifest vào private R2.

**Yêu cầu nguồn native:** workflow mong đợi project thật tại `native/android` (Gradle), `native/ios` (Xcode), `native/windows` (.NET project) và `native/macos` (Xcode). Các thư mục source native này chưa có trong monorepo hiện tại; workflow cố ý dừng với thông báo rõ nếu source còn thiếu. Không tạo file APK/IPA/EXE giả để báo build thành công.

Secrets/variables cho target:
- Android: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- iOS: `IOS_CERTIFICATE_BASE64`, `IOS_CERTIFICATE_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`, `APPLE_TEAM_ID`; Variables `IOS_SCHEME`, `IOS_BUNDLE_ID`.
- Windows: `WINDOWS_PFX_BASE64`, `WINDOWS_PFX_PASSWORD`.
- macOS: `MACOS_CERTIFICATE_BASE64`, `MACOS_CERTIFICATE_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`; Variable `MACOS_SCHEME`.
- R2: `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; optional variable `R2_BUCKET_NAME` (default `hendy-app-releases`).

Local manifest test:
```powershell
New-Item -ItemType Directory -Force release-output
# Copy only real signed artifacts (.apk/.aab/.ipa/.exe/.msix/.dmg/.pkg) into release-output
$env:RELEASE_VERSION = "2.4.1"
node scripts/generate-release-manifest.mjs release-output
```

Manifest command fails if there are no supported artifacts, any supported artifact is empty, a symbolic link exists, or version syntax is unsafe. Upload requires R2 credentials and is deliberately separate.

## 11. Production secrets and CI/CD

Repository → Settings → Secrets and variables → Actions → Secrets:
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BOT_TOKEN`, `BOT_WEBHOOK_SECRET`, `SESSION_SECRET` (32+ random bytes), `ADMIN_TELEGRAM_IDS`, `HENDY_GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`. Add R2/certificate/bank secrets only for enabled workflows.

Production flow:
1. Run CI Test and Security Checks; fix failures from actual logs.
2. Run Deploy Cloudflare Platform.
3. Check each Worker health endpoint/runtime tail.
4. Check all three Pages, API CORS, Telegram webhook and Queue consumer.
5. Only then run Native Release Matrix for a target with existing native source and signing material.
6. Verify R2 object names, manifest hashes, signature verification and download authorization.

Never run production deploys concurrently from two different workflows. Keep R2 private, use short-lived release download tickets and rotate any credentials previously committed in Git history.
