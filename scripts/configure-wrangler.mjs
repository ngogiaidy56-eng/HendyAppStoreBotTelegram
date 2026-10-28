import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const requestedTarget = String(process.env.CLOUDFLARE_WORKER_TARGET || 'all').trim().toLowerCase();
const supportedTargets = ['platform-api', 'queue-processor', 'edge-router', 'self-healing-bot'];
if (requestedTarget !== 'all' && !supportedTargets.includes(requestedTarget)) {
  console.error('CLOUDFLARE_WORKER_TARGET must be all or one of: ' + supportedTargets.join(', '));
  process.exit(1);
}
const selectedTargets = requestedTarget === 'all' ? supportedTargets : [requestedTarget];
const needsD1 = selectedTargets.some((name) => ['platform-api', 'queue-processor', 'edge-router'].includes(name));
const needsKv = selectedTargets.includes('self-healing-bot');
const d1 = String(process.env.CLOUDFLARE_D1_DATABASE_ID || '').trim();
const kv = String(process.env.CLOUDFLARE_DEDUPE_KV_NAMESPACE_ID || '').trim();
if (needsD1 && !/^[a-f0-9-]{32,36}$/i.test(d1)) throw new Error('Set CLOUDFLARE_D1_DATABASE_ID to the hendyappstore-db UUID.');
if (needsKv && !/^[a-f0-9]{32}$/i.test(kv)) throw new Error('Set CLOUDFLARE_DEDUPE_KV_NAMESPACE_ID to the hendy-appstore-dedupe ID.');

function setTomlVariable(contents, key, value) {
  if (value === undefined || value === null || String(value).trim() === '') return contents;
  const assignment = key + ' = ' + JSON.stringify(String(value));
  const pattern = new RegExp('^' + key + '\\s*=.*$', 'm');
  if (pattern.test(contents)) return contents.replace(pattern, assignment);
  const varsHeader = /^(\[vars\]\s*)$/m;
  if (varsHeader.test(contents)) return contents.replace(varsHeader, '$1\n' + assignment);
  return contents.replace(/\s*$/, '') + '\n\n[vars]\n' + assignment + '\n';
}

const workerOverrides = {
  'platform-api': [
    'APP_URL','ADMIN_URL','STOREFRONT_URL','CORS_ORIGINS','BOT_USERNAME','GITHUB_OWNER','GITHUB_REPO',
    'MIN_DEPOSIT_VND','MAX_DEPOSIT_VND','DAILY_CHECKIN_REWARD_VND','REFERRAL_REWARD_VND',
    'SESSION_TTL_SECONDS','MAX_INIT_DATA_AGE_SECONDS','BANK_ID','BANK_ACCOUNT_NUMBER',
    'BANK_ACCOUNT_NAME','TASKS_CONFIG_JSON','MINIGAME_CONFIG_JSON',
  ],
  'queue-processor': ['TASKS_CONFIG_JSON','MINIGAME_CONFIG_JSON','BANK_SYNC_URL','GITHUB_OWNER','GITHUB_REPO'],
  'self-healing-bot': ['GITHUB_OWNER','GITHUB_REPO'],
};

const workerRoot = path.join(root, 'workers');
const entries = await readdir(workerRoot, { withFileTypes: true });
let updated = 0;
for (const entry of entries.filter((item) => item.isDirectory() && selectedTargets.includes(item.name))) {
  const file = path.join(workerRoot, entry.name, 'wrangler.toml');
  let contents;
  try { contents = await readFile(file, 'utf8'); }
  catch { throw new Error('Missing Wrangler config for worker: ' + entry.name); }
  let next = contents;
  if (needsD1) next = next.replaceAll('REPLACE_WITH_D1_DATABASE_ID', d1);
  if (needsKv) next = next.replaceAll('REPLACE_WITH_DEDUPE_KV_NAMESPACE_ID', kv);
  for (const key of workerOverrides[entry.name] || []) next = setTomlVariable(next, key, process.env[key]);
  if (next.includes('REPLACE_WITH_')) throw new Error('Unresolved Cloudflare placeholder in ' + path.relative(root, file) + '.');
  if (next !== contents) { await writeFile(file, next); updated += 1; }
}
console.log('Configured ' + selectedTargets.join(', ') + '; updated ' + updated + ' Wrangler file(s).');
