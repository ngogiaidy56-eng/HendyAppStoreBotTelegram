# Dependency security and supported toolchain

- CI uses Node.js >=22.12.0 and Vitest 5.1.x.
- Vitest 5 requires Vite >=6.4.0; keep the Vite/Vitest versions aligned when changing the frontend toolchain.
- Avoid pinning vulnerable transitive versions. Run `pnpm audit --audit-level high` after dependency updates and verify resolved versions using `pnpm why tinypool`.
- Commit and review `pnpm-lock.yaml` for reproducible builds before treating a release as production-ready. The current CI temporarily uses `pnpm install --no-frozen-lockfile` because the initial source tree did not contain a lockfile.
- Security audit findings block release until addressed or documented with an explicit, time-limited exception.
