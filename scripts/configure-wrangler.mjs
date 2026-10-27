import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const d1 = String(process.env.CLOUDFLARE_D1_DATABASE_ID || '').trim();
const kv = String(process.env.CLOUDFLARE_DEDUPE_KV_NAMESPACE_ID || '').trim();
if (!/^[a-f0-9-]{32,36}$/i.test(d1)) {
  console.error('Set the GitHub Actions variable CLOUDFLARE_D1_DATABASE_ID to the existing D1 UUID.');
  process.exit(1);
}
if (!/^[a-f0-9]{32}$/i.test(kv)) {
  console.error('Set the GitHub Actions variable CLOUDFLARE_DEDUPE_KV_NAMESPACE_ID to the self-healing KV namespace ID.');
  process.exit(1);
}

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
    'APP_URL','ADMIN_URL','CORS_ORIGINS','BOT_USERNAME','MIN_DEPOSIT_VND','MAX_DEPOSIT_VND',
    'DAILY_CHECKIN_REWARD_VND','REFERRAL_REWARD_VND','SESSION_TTL_SECONDS','MAX_INIT_DATA_AGE_SECONDS',
    'BANK_ID','BANK_ACCOUNT_NUMBER','BANK_ACCOUNT_NAME','TASKS_CONFIG_JSON','MINIGAME_CONFIG_JSON',
  ],
  'telegram-bot': ['APP_URL','ADMIN_URL','BOT_USERNAME','REFERRAL_REWARD_VND','TASKS_CONFIG_JSON','MINIGAME_CONFIG_JSON'],
  'queue-processor': ['TASKS_CONFIG_JSON','MINIGAME_CONFIG_JSON','BANK_SYNC_URL'],
};

const workerRoot = path.join(root, 'workers');
const entries = await readdir(workerRoot, { withFileTypes: true });
let updated = 0;
for (const entry of entries.filter((item) => item.isDirectory())) {
  const file = path.join(workerRoot, entry.name, 'wrangler.toml');
  let contents;
  try { contents = await readFile(file, 'utf8'); } catch { continue; }
  let next = contents
    .replaceAll('REPLACE_WITH_D1_DATABASE_ID', d1)
    .replaceAll('REPLACE_WITH_DEDUPE_KV_NAMESPACE_ID', kv);
  for (const key of workerOverrides[entry.name] || []) {
    next = setTomlVariable(next, key, process.env[key]);
  }
  if (next.includes('REPLACE_WITH_')) throw new Error('Unresolved Cloudflare placeholder in ' + path.relative(root, file));
  if (next !== contents) { await writeFile(file, next); updated += 1; }
}
console.log('Configured Cloudflare identifiers and allowlisted runtime variables in ' + updated + ' Wrangler files for this CI run.');
