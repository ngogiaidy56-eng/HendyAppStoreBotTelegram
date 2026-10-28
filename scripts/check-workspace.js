#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'apps/mini-app/package.json', 'apps/web-user/package.json', 'apps/web-admin/package.json',
  'workers/platform-api/wrangler.toml', 'workers/queue-processor/wrangler.toml',
  'workers/edge-router/wrangler.toml', 'workers/self-healing-bot/wrangler.toml',
  'database/migrations/0001_core_schema.sql', 'database/migrations/0008_feature_flags.sql',
  '.github/workflows/ci-test.yml', '.github/workflows/deploy-cloudflare.yml',
  '.github/workflows/secrets-sync.yml', '.github/workflows/matrix-build.yml',
  'scripts/check-cloudflare-topology.mjs', 'scripts/provision-cloudflare-resources.mjs',
  'scripts/generate-release-manifest.mjs', 'scripts/upload-release-r2.mjs',
];
const errors = [];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`Missing required path: ${file}`);
}
for (const file of ['package.json', 'pnpm-workspace.yaml', 'turbo.json']) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`Missing root config: ${file}`);
}
const manifests = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === 'package.json') manifests.push(full);
  }
}
walk(root);
for (const file of manifests) {
  try { JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { errors.push(`Invalid JSON in ${path.relative(root, file)}: ${error.message}`); }
}
const migrationsDir = path.join(root, 'database/migrations');
const migrations = fs.readdirSync(migrationsDir).filter((name) => /^\d{4}_[a-z0-9_-]+\.sql$/.test(name)).sort();
if (migrations.length < 8) errors.push(`Expected at least 8 migrations, found ${migrations.length}`);
for (let i = 0; i < migrations.length; i++) {
  const expected = String(i + 1).padStart(4, '0');
  if (!migrations[i].startsWith(`${expected}_`)) errors.push(`Migration numbering gap at ${migrations[i]} (expected ${expected}_...)`);
}
for (const file of ['.env', '.dev.vars', 'workers/platform-api/.dev.vars']) {
  if (fs.existsSync(path.join(root, file))) errors.push(`Do not commit local secret file: ${file}`);
}
if (fs.existsSync(path.join(root, 'workers/telegram-bot/wrangler.toml'))) {
  errors.push('Telegram Bot Worker is disabled; remove the old Worker config and webhook code.');
}
if (fs.existsSync(path.join(root, 'scripts/configure-telegram-webhook.mjs'))) {
  errors.push('Telegram webhook automation should not be present when Bot features are disabled.');
}
if (errors.length) {
  console.error('Workspace validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Workspace validation passed (${manifests.length} package manifests, ${migrations.length} migrations, four Workers, three Pages).`);
}
