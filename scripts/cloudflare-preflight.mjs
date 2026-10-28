import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = String(process.argv[2] || 'all').toLowerCase();
if (!['all', 'pages', 'workers'].includes(mode)) {
  console.error('Usage: node scripts/cloudflare-preflight.mjs <all|pages|workers>');
  process.exit(2);
}
const required = ['package.json', 'pnpm-workspace.yaml', '.nvmrc'];
if (mode !== 'workers') required.push(
  'apps/web-admin/package.json', 'apps/web-admin/index.html',
  'apps/mini-app/package.json', 'apps/mini-app/index.html',
  'apps/web-user/package.json', 'apps/web-user/index.html',
);
if (mode !== 'pages') required.push(
  'workers/platform-api/wrangler.toml',
  'workers/queue-processor/wrangler.toml',
  'workers/edge-router/wrangler.toml',
  'workers/self-healing-bot/wrangler.toml',
  'scripts/configure-wrangler.mjs',
  'scripts/provision-cloudflare-resources.mjs',
  'scripts/sync-deployment-domains.mjs',
);
const missing = required.filter((file) => !existsSync(path.join(root, file)));
if (missing.length) {
  console.error('Missing deployment files:\n' + missing.map((file) => ' - ' + file).join('\n'));
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.packageManager !== 'pnpm@10.18.0') throw new Error('Expected packageManager pnpm@10.18.0.');
for (const app of ['web-admin', 'mini-app', 'web-user']) {
  const data = JSON.parse(readFileSync(path.join(root, 'apps', app, 'package.json'), 'utf8'));
  if (!data.scripts?.build) throw new Error('Missing build script for ' + app);
}
if (mode !== 'pages') {
  const expected = {
    'platform-api': 'hendy-platform-api',
    'queue-processor': 'hendy-queue-processor',
    'edge-router': 'hendy-edge-router',
    'self-healing-bot': 'hendy-self-healing-bot',
  };
  for (const [dir, name] of Object.entries(expected)) {
    const config = readFileSync(path.join(root, 'workers', dir, 'wrangler.toml'), 'utf8');
    if (!config.includes('name = "' + name + '"') || !config.includes('main = ')) {
      throw new Error('Invalid Wrangler config for ' + name);
    }
  }
}
console.log('Cloudflare preflight passed for four Workers and three Pages; Telegram Bot Worker is disabled.');
