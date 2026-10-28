#!/usr/bin/env bash
set -euo pipefail
cat <<'TXT'
Configure these as Cloudflare Worker secrets (not frontend VITE_ variables):
  BOT_TOKEN (only if the Telegram Mini App remains enabled; not used by a bot Worker)
  BOT_TOKEN
  SESSION_SECRET (>= 32 random characters)
  ADMIN_TELEGRAM_IDS (comma-separated numeric Telegram user IDs)
  BANK_WEBHOOK_SECRET (only when a provider adapter is configured)

GitHub Actions repository secrets:
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ACCOUNT_ID
TXT
