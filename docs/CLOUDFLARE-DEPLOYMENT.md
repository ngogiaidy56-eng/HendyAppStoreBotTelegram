# Triển khai HendyAppStoreBotTelegram lên Cloudflare

Tài liệu này dành cho repository `ngogiaidy56-eng/HendyAppStoreBotTelegram` và màn hình Create an app trong Cloudflare Dashboard.

## 1. Hiểu đúng màn hình đang mở

Trong ảnh, biểu mẫu có cả **Build command** và **Deploy command**. Đây là luồng tạo một **Cloudflare Worker** bằng Workers Builds; nó không tự động tạo ba Pages và toàn bộ các Worker trong monorepo.

Repository có ba frontend riêng và năm Worker riêng. Không được coi cả repository là một ứng dụng Vite duy nhất. Lệnh gốc `npm run build` không tạo ra một thư mục `dist/` duy nhất ở root, còn Wrangler config nằm bên trong từng thư mục Worker.

Tài liệu Cloudflare:
- [Pages monorepos](https://developers.cloudflare.com/pages/configuration/monorepos/)
- [Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

## 2. Nếu muốn tiếp tục ngay trên màn hình trong ảnh — tạo API Worker

Sử dụng cấu hình dưới đây để tạo riêng API Worker. **Không bấm Deploy khi vẫn giữ tên `hendyappstorebotelegram` và lệnh mặc định `npm run build`.**

Trong phần cấu hình hiện tại:

| Trường | Giá trị |
|---|---|
| Git repository | `ngogiaidy56-eng/HendyAppStoreBotTelegram` |
| Branch | `main` |
| Project name | `hendy-platform-api` |
| Root directory | Để trống / repository root (`/`) |
| Build command | `pnpm install --no-frozen-lockfile && CLOUDFLARE_WORKER_TARGET=platform-api node scripts/configure-wrangler.mjs && pnpm exec wrangler d1 migrations apply hendyappstore-db --remote --config workers/platform-api/wrangler.toml` |
| Deploy command | `pnpm exec wrangler deploy --config workers/platform-api/wrangler.toml` |

Tên `hendy-platform-api` phải trùng với trường `name` trong `workers/platform-api/wrangler.toml`. Giữ root directory ở repository root vì script cấu hình tìm thư mục `workers/` từ root.

### Biến môi trường của Worker Builds

Mở Settings → Builds hoặc mục Variables and Secrets của Worker, rồi thêm biến phù hợp với cấu hình build:

- `CLOUDFLARE_D1_DATABASE_ID`: ID của D1 database đã tạo, tên database là `hendyappstore-db`.
- `CLOUDFLARE_ACCOUNT_ID`: Account ID của Cloudflare.
- `CLOUDFLARE_API_TOKEN`: API token giới hạn quyền triển khai Worker và truy cập tài nguyên cần thiết. Lưu token dưới dạng secret, không commit vào Git.
- `APP_URL`, `ADMIN_URL`, `CORS_ORIGINS`, `BOT_USERNAME`: có thể thêm sau khi có URL thật của frontend.

Không nhập chuỗi `REPLACE_WITH_D1_DATABASE_ID`; script sẽ thay placeholder bằng `CLOUDFLARE_D1_DATABASE_ID` trong bản checkout của lần build. Lệnh build ở trên cũng áp dụng các migration D1 chưa chạy trước khi lệnh Deploy command phát hành Worker. ID D1 là thông tin cấu hình, còn API token là bí mật.

### Tạo tài nguyên trước khi deploy API

Đảm bảo trong cùng Cloudflare account đã có:
- D1 database `hendyappstore-db`.
- R2 bucket `hendy-app-releases`.
- Queues `hendy-jobs` và `hendy-jobs-dlq`.

Nếu tài nguyên chưa tồn tại hoặc tên không khớp với `wrangler.toml`, deployment có thể thất bại. Tạo tài nguyên ở Dashboard trước khi bấm Deploy.

Sau khi deploy, mở Worker `hendy-platform-api`, sao chép HTTPS URL đang hoạt động. Bạn sẽ dùng URL này cho biến `VITE_API_BASE_URL` ở ba Pages.

> Chọn một hệ thống CI/CD làm nguồn triển khai duy nhất cho từng Worker. Repository hiện có GitHub Actions Deploy Workers; nếu bạn bật Workers Builds trực tiếp cho cùng một Worker, hai pipeline có thể cùng deploy nó. Đừng chạy đồng thời cả hai cho cùng một Worker nếu chưa chủ động điều phối.

## 3. Tạo ba Cloudflare Pages riêng

Vào Workers & Pages → Create application → Pages → Connect to Git. Tạo mỗi frontend thành một Pages project. Dùng repository và branch `main` như nhau nhưng thiết lập Build command / output directory khác nhau.

### Pages 1 — Telegram Mini App

| Trường | Giá trị |
|---|---|
| Project name | `hendy-mini-app` |
| Root directory | Repository root (`/`) |
| Build command | `pnpm run build:cloudflare:miniapp` |
| Build output directory | `apps/mini-app/dist` |
| Environment variable | `VITE_API_BASE_URL` = URL HTTPS của API Worker |

### Pages 2 — Admin

| Trường | Giá trị |
|---|---|
| Project name | `hendy-web-admin` |
| Root directory | Repository root (`/`) |
| Build command | `pnpm run build:cloudflare:admin` |
| Build output directory | `apps/web-admin/dist` |
| Environment variable | `VITE_API_BASE_URL` = URL HTTPS của API Worker |

### Pages 3 — Storefront người dùng

| Trường | Giá trị |
|---|---|
| Project name | `hendy-app-storefront` |
| Root directory | Repository root (`/`) |
| Build command | `pnpm run build:cloudflare:storefront` |
| Build output directory | `apps/web-user/dist` |
| Environment variable | `VITE_API_BASE_URL` = URL HTTPS của API Worker |

Root `package.json` khai báo `pnpm@10.18.0`; `.nvmrc` chọn Node.js 22.12.0. Cloudflare phải cài dependency bằng pnpm tại monorepo root. Nếu automatic dependency install không phát hiện pnpm đúng, đặt Pages build variable `SKIP_DEPENDENCY_INSTALL=1` và dùng build command sau để cài rõ ràng, ví dụ Storefront:

```bash
corepack enable && corepack pnpm@10.18.0 install --no-frozen-lockfile && pnpm run build:cloudflare:storefront
```

Vẫn để output directory là `apps/web-user/dist`. Không đổi thành `dist` ở root.

## 4. GitHub Actions CI/CD — cách triển khai đồng bộ toàn bộ hệ thống

Repository có sẵn các workflow:
- `.github/workflows/ci-test.yml`: chạy kiểm tra và build.
- `.github/workflows/deploy-workers.yml`: triển khai API, Telegram bot, queue processor, edge router, self-healing worker và migration D1.
- `.github/workflows/deploy-miniapp.yml`: triển khai Mini App.
- `.github/workflows/deploy-web.yml`: triển khai Admin và Storefront.

Cách này hợp lý hơn khi muốn quản lý toàn bộ dịch vụ từ một nơi. Trước khi chạy, vào GitHub → Settings → Secrets and variables → Actions và tạo:

**Repository/Environment Secrets**
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `HENDY_GITHUB_TOKEN` nếu dùng script tự phát hiện domain và đồng bộ Actions Variables.
- `BOT_TOKEN`, `BOT_WEBHOOK_SECRET`, `SESSION_SECRET` (ít nhất 32 bytes), `ADMIN_TELEGRAM_IDS`; những secret webhook/bank khác chỉ bật khi tích hợp thật.

**Actions Variables**
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_DEDUPE_KV_NAMESPACE_ID`
- `VITE_API_BASE_URL` hoặc cho phép workflow đồng bộ endpoint API sau deploy.
- Tuỳ chọn `MINIAPP_PAGES_PROJECT`, `ADMIN_PAGES_PROJECT`, `STOREFRONT_PAGES_PROJECT` nếu dùng tên Pages khác mặc định.

Tên Pages phải tồn tại trước khi gọi `wrangler pages deploy`. Dùng các tên trên hoặc cập nhật Variables để tên trong workflow khớp với tên dự án ở Cloudflare.

Sau đó:
1. Mở tab GitHub Actions, chạy **CI Test** và bảo đảm thành công.
2. Chạy **Deploy Workers**; xem từng bước tạo queue, migration và deploy.
3. Chạy **Deploy Mini App**.
4. Chạy **Deploy Web Frontends**.
5. Kiểm tra URL Pages, API Worker, CORS và nhật ký Workers.

Không đưa token vào `.env.example`, mã nguồn, build command hay URL. Chỉ lưu token trong mục Secrets.

## 5. Chẩn đoán lỗi

- **Wrong project name / Worker name mismatch:** đổi Project name thành `hendy-platform-api`, hoặc đảm bảo khớp với `name` trong Wrangler config.
- **No such file / Wrangler config not found:** Root directory phải là `/` nếu dùng build command trong mục 2.
- **Unresolved Cloudflare placeholder:** xác minh `CLOUDFLARE_D1_DATABASE_ID` và chạy configure script trong build command.
- **Binding / bucket / queue not found:** tạo D1, R2, Queues với tên đúng trong Wrangler config.
- **Pages cannot find output directory:** kiểm tra đúng output path tương ứng với app; đây là đường dẫn tính từ repository root.
- **Frontend build thành công nhưng API không hoạt động:** đặt `VITE_API_BASE_URL` thành URL HTTPS thật của Worker, rebuild Pages và cấu hình CORS cho đúng origin.
- **GitHub Actions thất bại trước khi có log bước:** mở từng job → View raw logs; xác minh Actions đang được bật, quyền Actions policy và Secrets/Variables trong Environment `production`. Không coi việc tạo được Worker/Pages là bằng chứng deploy thành công.

Chạy kiểm tra cấu trúc từ máy có Node.js 22.12+ và pnpm 10.18.0:

```bash
pnpm install --no-frozen-lockfile
pnpm run preflight:cloudflare:pages
pnpm run build:cloudflare:storefront
pnpm run build:cloudflare:admin
pnpm run build:cloudflare:miniapp
pnpm check
pnpm test
```

Bản build phải kết thúc với exit code 0 và tạo `index.html` tại output directory nêu trên. Deployment chỉ được xác nhận sau khi Cloudflare báo thành công và URL thật hoạt động.
