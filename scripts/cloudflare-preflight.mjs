import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = String(process.argv[2] || 'all').toLowerCase();
if (!['all', 'pages', 'workers'].includes(mode)) {
  console.error('Usage: node scripts/cloudflare-preflight.mjs <all|pages|workers>');
  process.exit(2);
}

const requiredFiles = ['package.json', 'pnpm-workspace.yaml', '.nvmrc'];
if (mode !== 'workers') {
  requiredFiles.push(
    'apps/mini-app/package.json',
    'apps/mini-app/index.html',
    'apps/web-admin/package.json',
    'apps/web-admin/index.html',
    'apps/web-user/package.json',
    'apps/web-user/index.html',
    'scripts/cloudflare-build.mjs',
  );
}
if (mode !== 'pages') {
  requiredFiles.push(
    'workers/platform-api/wrangler.toml',
    'workers/telegram-bot/wrangler.toml',
    'workers/queue-processor/wrangler.toml',
    'workers/edge-router/wrangler.toml',
    'workers/self-healing-bot/wrangler.toml',
    'scripts/configure-wrangler.mjs',
  );
}

const missing = requiredFiles.filter((file) => !existsSync(path.join(root, file)));
if (missing.length) {
  console.error('Missing required project files:\n' + missing.map((file) => ' - ' + file).join('\n'));
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
if (packageJson.packageManager !== 'pnpm@10.18.0') {
  console.error('Expected packageManager pnpm@10.18.0 in the root package.json.');
  process.exit(1);
}
console.log('Project files and package-manager declaration: OK.');

if (mode !== 'pages') {
  for (const worker of ['platform-api', 'telegram-bot', 'queue-processor', 'edge-router', 'self-healing-bot']) {
    const config = readFileSync(path.join(root, 'workers', worker, 'wrangler.toml'), 'utf8');
    if (config.includes('REPLACE_WITH_')) {
      console.warn('Worker ' + worker + ' still has resource-ID placeholders. Configure real IDs before deploying it.');
    }
  }
}
console.log('Preflight completed. Run the build command for the exact app you intend to publish.');
