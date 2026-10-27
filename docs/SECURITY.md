# Security checklist

- Keep all real tokens, passwords, private signing keys and certificates in Cloudflare Worker secrets or protected GitHub Actions secrets. Never put secret values in frontend environment variables.
- Telegram login validates raw `initData` HMAC and freshness in the Worker. Browser profile values are untrusted until matched to verified Telegram data.
- Set a long random `SESSION_SECRET`; rotate it carefully because existing signed sessions will stop working.
- Use an admin allowlist and server-side permission checks on every admin route. Protect the admin Pages project with Cloudflare Access in production.
- The secrets-sync endpoint allows only a fixed list of secret names, requires explicit confirmation, encrypts values with GitHub's repository public key and never reads stored secret values back. Use a least-privilege token and review each key before syncing.
- Verify bank signatures over exact raw bytes. Reject invalid/missing signatures, bind crediting to a pending reference and exact amount, and enforce unique provider transaction IDs. The provided HMAC example is a contract template, not a completed integration with a particular bank.
- Use idempotency keys, SQL unique constraints, atomic D1 batches and unique wallet-ledger references for purchases/rewards/deposits.
- Do not put inventory code, session tokens or secret values in logs. Sanitize exceptions and audit sensitive admin actions.
- Keep R2 private. Download tickets are short-lived and tied to a release; don't expose permanent object keys to anonymous callers.
- GitHub workflow dispatch is allowlisted. Self-healing responds only to valid signed webhooks and allowlisted workflows; keep production environment approval enabled and avoid automatic arbitrary patches.
- Run dependency/security workflow, keep Dependabot enabled, review permissions on `GITHUB_TOKEN`, and avoid `pull_request_target` for untrusted fork code.
- Configure automated backup, test restores, set rate limits on auth/purchase/reward endpoints and monitor abuse.
