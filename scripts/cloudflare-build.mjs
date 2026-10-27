import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = {
  'mini-app': { packageName: '@hendy/mini-app', output: 'apps/mini-app/dist' },
  'web-admin': { packageName: '@hendy/web-admin', output: 'apps/web-admin/dist' },
  'web-user': { packageName: '@hendy/web-user', output: 'apps/web-user/dist' },
};
const target = String(process.argv[2] || '').trim();
const app = targets[target];

if (!app) {
  console.error('Usage: node scripts/cloudflare-build.mjs <mini-app|web-admin|web-user>');
  process.exit(2);
}

if (!process.env.VITE_API_BASE_URL) {
  console.warn('VITE_API_BASE_URL is empty. The frontend may call /api on the Pages domain instead of the API Worker.');
}

console.log('Building ' + app.packageName + ' from monorepo root.');
const result = spawnSync('pnpm', ['--filter', app.packageName, 'build'], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error('Could not start pnpm. Ensure Node.js 22.12+ and pnpm 10.18.0 are available.', result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status || 1);

const indexFile = path.join(root, app.output, 'index.html');
if (!existsSync(indexFile)) {
  console.error('Build command completed but output is missing: ' + app.output + '/index.html');
  process.exit(1);
}
console.log('Cloudflare Pages output directory: ' + app.output);
