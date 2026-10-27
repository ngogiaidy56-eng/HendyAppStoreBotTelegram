# CI validation strategy

The default `pnpm test` command intentionally runs tests through the owning package's supported entry point:

1. Platform API tests.
2. SQLite migrations and commerce idempotency tests.
3. Shared feature-flag evaluator tests.
4. Mini App tests via `pnpm --filter @hendy/mini-app test`, which loads the app's `vitest.config.ts`.

Use package-level test scripts when a workspace-specific runner configuration is required. Frontend production builds and Playwright E2E run as separate CI jobs.
