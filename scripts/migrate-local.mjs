import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = path.join(root, 'workers', 'platform-api');
const configPath = path.join(workerDir, 'wrangler.toml');
const localPath = path.join(workerDir, 'wrangler.local.generated.toml');
await access(configPath);
try {
  await access(localPath);
  throw new Error('Local generated Wrangler config already exists. Stop the dev server before migrating.');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
const original = await readFile(configPath, 'utf8');
const local = original
  .replaceAll('REPLACE_WITH_D1_DATABASE_ID', '11111111-1111-4111-8111-111111111111')
  .replaceAll('REPLACE_WITH_DEDUPE_KV_NAMESPACE_ID', '11111111111111111111111111111111');
if (local.includes('REPLACE_WITH_')) throw new Error('Could not resolve all local-only resource placeholders.');
await writeFile(localPath, local);
try {
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'hendyappstore-db', '--local', '--config', path.relative(root, localPath)],
    { cwd: root, stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, shell: process.platform === 'win32' });
  if (result.error) throw new Error('Could not start Wrangler: ' + result.error.message);
  if (result.status !== 0) throw new Error('Local D1 migration failed (exit ' + result.status + ').');
} finally {
  await rm(localPath, { force: true });
}
