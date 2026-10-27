const required = [
  'BOT_TOKEN', 'BOT_WEBHOOK_SECRET', 'SESSION_SECRET', 'ADMIN_TELEGRAM_IDS',
  'GITHUB_WEBHOOK_SECRET', 'HENDY_GITHUB_TOKEN',
  'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID',
];
const missing = required.filter((key) => !String(process.env[key] || '').trim());
if (process.env.SESSION_SECRET && new TextEncoder().encode(process.env.SESSION_SECRET).byteLength < 32) {
  missing.push('SESSION_SECRET (must be at least 32 bytes)');
}
if (missing.length) {
  console.error(`Missing/invalid runtime secret names: ${[...new Set(missing)].join(', ')}`);
  process.exit(1);
}
console.log(`Validated ${required.length} required secret names without printing values.`);
