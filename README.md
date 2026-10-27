# HendyAppStoreBotTelegram

Monorepo cho Telegram Mini App + bot shop + API/Cloudflare Workers + Admin Studio + storefront phân phối ứng dụng. Thiết kế ưu tiên bảo toàn số dư/giao dịch trong D1, UI riêng từng ứng dụng và triển khai tự động qua GitHub Actions.

## Repository map

- `apps/mini-app`: Telegram Mini App (React + TypeScript + Vite), shop code, nạp tiền, lịch sử, nhiệm vụ, điểm danh, vòng quay, referral, notifications và profile.
- `apps/web-user`: cổng phát hành theo thiết bị, các giao diện tải binary Android/iOS/Windows/macOS.
- `apps/web-admin`: bảng điều khiển quản trị bằng tiếng Việt cho sản phẩm, kho mã, người dùng, thông báo, nhiệm vụ, bảo trì, cờ tính năng, cấu hình/domain sync, GitHub secrets và phát hành ứng dụng.
- `workers/platform-api`: xác thực Telegram, shop/wallet, deposit webhook adapter, task/referral/reward APIs, feature flags, releases và quản trị.
- `workers/telegram-bot`: Telegram webhook + command dispatcher. Đây là Worker duy nhất nên nhận webhook bot.
- `workers/queue-processor`: broadcast/retry/queue + dead-letter handling.
- `workers/edge-router`: định tuyến theo thiết bị, layout resolver và maintenance guard.
- `workers/self-healing-bot`: xác thực GitHub webhook và rerun workflow trong allowlist.
- `packages/feature-flags`, `packages/types`, `packages/shared-hooks`, `packages/shared-ui`, `packages/logger`: mã dùng chung.
- `database/migrations`: migrations tăng dần `0001`–`0009`; không sửa migration đã chạy trên production, hãy thêm migration mới.
- `.github/workflows`: kiểm thử CI, triển khai Workers/Pages, quét bảo mật, đồng bộ secrets và đồng bộ domain.

## Requirements

- Node.js 22+
- PNPM 10.18+
- Python 3.10+ để chạy kiểm thử SQLite migration/invariants
- Tài khoản Cloudflare và GitHub để triển khai

## Develop and verify

```bash
pnpm install
pnpm dev:worker
pnpm dev:miniapp
pnpm dev:admin
pnpm dev:web
pnpm check
pnpm test
pnpm build
```

Các ứng dụng có thể chạy riêng. Cấu hình local để trong `.dev.vars` của Worker và `.env.local` không commit. `.env.example` chỉ chứa tên/giá trị mẫu. Không đặt secrets có tiền tố `VITE_`.

## Deployment

Làm theo [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), cấu hình GitHub Environment `production`, tạo D1/R2/KV/Queues/Pages resources và thiết lập secrets. `Deploy Workers` chạy migrations và deploy Workers. `Deploy Mini App` và `Deploy Web` deploy Pages. Telegram webhook phải trỏ đến `workers/telegram-bot`, không phải platform API.

## Notes / limits

- VietQR tạo nội dung QR dựa trên cấu hình tài khoản; việc tự cộng tiền chỉ được bật sau khi tích hợp và kiểm thử chữ ký callback thực tế từ nhà cung cấp ngân hàng.
- Dịch vụ mạng xã hội/Vietsub cần adapter và credentials của nhà cung cấp; không có API đối tác mặc định.
- Repo hiện không kèm mã nguồn project native Android/iOS/Windows/macOS hoặc quy trình build/ký phát hành hoàn chỉnh cho các nền tảng đó. Không có binary giả được tạo ra; hãy build và ký ứng dụng bằng toolchain tương ứng, sau đó tải bản phát hành thật lên R2 từ Admin Studio.
- Secrets Sync chỉ chấp nhận allowlist và mã hóa với GitHub repository public key; phải cấu hình token/quyền Actions và xác nhận thủ công.
- Không triển khai production chỉ dựa vào test cục bộ; xem lại các checklist bảo mật, variables, CORS, webhook và ngân hàng trước khi mở dịch vụ.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment runbook](docs/DEPLOYMENT.md)
- [Security](docs/SECURITY.md)
- [Environment variables](docs/ENVIRONMENT.md)
- [Central Configuration Control Plane](docs/CENTRAL-CONFIG.md)
- [Review report](docs/REVIEW-REPORT.md)


## Cloudflare deployment (updated)

This is a monorepo, not a single root-level Vite application. Do not use one generic `npm run build` plus `dist` to publish the entire repository. Use a separate Pages project for each frontend and deploy each Worker from its own Wrangler configuration, or use the repository's GitHub Actions workflows.

- Detailed dashboard steps for the exact Workers & Pages setup screen: [docs/CLOUDFLARE-DEPLOYMENT.md](docs/CLOUDFLARE-DEPLOYMENT.md)
- Build only the user storefront: `pnpm run build:cloudflare:storefront` → `apps/web-user/dist`
- Build only the admin interface: `pnpm run build:cloudflare:admin` → `apps/web-admin/dist`
- Build only the Telegram Mini App: `pnpm run build:cloudflare:miniapp` → `apps/mini-app/dist`
- Run a local file/configuration check: `pnpm run preflight:cloudflare:pages`

The root `.nvmrc` pins Node.js 22.12.0. Production builds also need a real `VITE_API_BASE_URL` pointing at the deployed API Worker.


## Import source into GitHub


This project includes a helper for importing the complete source into `hendyngo-servers/HendyAppStoreBotTelegram`, including when the remote already has a README or setup commits. From the project root, run:

- Windows PowerShell: `scripts\push-to-github.ps1`
- Linux/macOS: `bash scripts/push-to-github.sh`

The helper clones the target into a sibling working directory, copies source files while excluding local secrets, certificates, dependencies and build outputs, removes the interrupted `.bootstrap` staging directory, then commits and pushes to `main` without force-push. Git and Python 3 must be installed, GitHub write access must already be configured locally, and Git commit name/email must be configured. See [deployment notes](docs/DEPLOYMENT.md) before production setup.
