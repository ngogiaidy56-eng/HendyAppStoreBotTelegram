import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = String(process.argv[2] || 'all').toLowerCase();
if (!['all', 'pages', 'workers', 'single'].includes(mode)) {
  console.error('Usage: node scripts/cloudflare-preflight.mjs <all|pages|workers|single>');
  process.exit(2);
}
const requiredFiles = ['package.json', 'pnpm-workspace.yaml', '.nvmrc'];
if (mode === 'single') requiredFiles.push('wrangler.toml', 'src/index.ts', 'scripts/build-cloudflare-single-worker.mjs', 'scripts/provision-cloudflare-resources.mjs');
if (mode !== 'workers' && mode !== 'single') {
  requiredFiles.push('apps/mini-app/package.json','apps/mini-app/index.html','apps/web-admin/package.json','apps/web-admin/index.html','apps/web-user/package.json','apps/web-user/index.html','scripts/cloudflare-build.mjs');
}
if (mode !== 'pages' && mode !== 'single') {
  requiredFiles.push('workers/platform-api/wrangler.toml','workers/telegram-bot/wrangler.toml','workers/queue-processor/wrangler.toml','workers/edge-router/wrangler.toml','workers/self-healing-bot/wrangler.toml','scripts/configure-wrangler.mjs');
}
const missing = requiredFiles.filter((file) => !existsSync(path.join(root, file)));
if (missing.length) {
  console.error('Missing required project files:\n' + missing.map((file) => ' - ' + file).join('\n'));
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.packageManager !== 'pnpm@10.18.0') {
  console.error('Expected packageManager pnpm@10.18.0 in package.json.');
  process.exit(1);
}
console.log('Project files and package-manager declaration: OK.');
if (mode === 'single') {
  const config = readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
  if (!config.includes('main = "src/index.ts"') || !config.includes('directory = "./public"')) {
    console.error('Root wrangler.toml must point to src/index.ts and ./public.');
    process.exit(1);
  }
}
console.log(mode === 'single' ? 'Single Worker preflight completed.' : 'Preflight completed.');
