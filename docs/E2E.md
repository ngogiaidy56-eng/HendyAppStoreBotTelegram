# End-to-end browser tests

The fast pull-request CI runs package unit tests and production builds. To run the Playwright browser suite, open GitHub Actions, select **CI Test**, and choose **Run workflow**. The `miniapp-e2e` job installs Chromium, builds the Mini App, starts Vite preview, and runs `apps/mini-app/e2e/app.spec.ts`.

Keeping E2E dispatchable avoids making every code-review run wait on downloading browser binaries while preserving an explicit browser-test path.
