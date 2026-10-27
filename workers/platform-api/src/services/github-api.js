import { encryptGitHubSecret } from './github-crypto.js';

function repositoryPath(env, suffix = '') {
  const owner = String(env.GITHUB_OWNER || '');
  const repo = String(env.GITHUB_REPO || '');
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) {
    throw new Error('GitHub owner/repository configuration is invalid');
  }
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${suffix}`;
}

async function githubRequest(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    // Never echo response bodies: GitHub error details can contain sensitive metadata.
    throw new Error(`GitHub API request failed (${response.status})`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

const allowedVariableNames = new Set([
  'APP_URL','ADMIN_URL','STOREFRONT_URL','MINIAPP_PUBLIC_URL','ADMIN_PUBLIC_URL','STOREFRONT_PUBLIC_URL',
  'MINIAPP_DOMAIN_OVERRIDE','ADMIN_DOMAIN_OVERRIDE','STOREFRONT_DOMAIN_OVERRIDE','VITE_API_BASE_URL','CORS_ORIGINS',
  'BOT_USERNAME','MIN_DEPOSIT_VND','MAX_DEPOSIT_VND','DAILY_CHECKIN_REWARD_VND','REFERRAL_REWARD_VND',
  'SESSION_TTL_SECONDS','MAX_INIT_DATA_AGE_SECONDS','BANK_ID','BANK_ACCOUNT_NUMBER','BANK_ACCOUNT_NAME','BANK_SYNC_URL',
  'TASKS_CONFIG_JSON','MINIGAME_CONFIG_JSON','MAINTENANCE_MESSAGE','TASKS_ENABLED','MINIGAME_ENABLED',
  'AUTO_REDEPLOY_WORKERS_AFTER_DOMAIN_SYNC'
]);

export async function getGitHubActionsVariables(env) {
  if (!env.GITHUB_TOKEN) throw new Error('GitHub token is not configured');
  const payload = await githubRequest(repositoryPath(env, '/actions/variables?per_page=100'), env.GITHUB_TOKEN);
  const variables = Array.isArray(payload?.variables) ? payload.variables : [];
  return Object.fromEntries(variables.filter((item) => allowedVariableNames.has(item.name)).map((item) => [item.name, String(item.value ?? '')]));
}

export async function syncGitHubActionsVariables(env, variables) {
  if (!env.GITHUB_TOKEN) throw new Error('GitHub token is not configured');
  const entries = Object.entries(variables || {});
  if (!entries.length) return [];
  for (const [name, value] of entries) {
    if (!allowedVariableNames.has(name)) throw new Error('GitHub Actions variable is not allowlisted');
    if (typeof value !== 'string' || value.length > 48000) throw new Error('GitHub Actions variable has an invalid value');
  }
  const payload = await githubRequest(repositoryPath(env, '/actions/variables?per_page=100'), env.GITHUB_TOKEN);
  const existing = new Set((Array.isArray(payload?.variables) ? payload.variables : []).map((item) => item.name));
  const synced = [];
  for (const [name, value] of entries) {
    const suffix = '/actions/variables/' + encodeURIComponent(name);
    if (existing.has(name)) {
      await githubRequest(repositoryPath(env, suffix), env.GITHUB_TOKEN, { method: 'PATCH', body: JSON.stringify({ name, value }) });
    } else {
      await githubRequest(repositoryPath(env, '/actions/variables'), env.GITHUB_TOKEN, { method: 'POST', body: JSON.stringify({ name, value }) });
      existing.add(name);
    }
    synced.push(name);
  }
  return synced;
}

export async function listGitHubActionsSecretNames(env) {
  if (!env.GITHUB_TOKEN) throw new Error('GitHub token is not configured');
  const payload = await githubRequest(repositoryPath(env, '/actions/secrets?per_page=100'), env.GITHUB_TOKEN);
  return (Array.isArray(payload?.secrets) ? payload.secrets : []).map((item) => item.name).filter((name) => /^[A-Z0-9_]{1,100}$/.test(name));
}

export async function syncGitHubActionsSecrets(env, secrets) {
  if (!env.GITHUB_TOKEN) throw new Error('GitHub token is not configured');
  const publicKey = await githubRequest(repositoryPath(env, '/actions/secrets/public-key'), env.GITHUB_TOKEN);
  if (!publicKey?.key || !publicKey?.key_id) throw new Error('GitHub repository public key is unavailable');
  const results = [];
  for (const [name, value] of Object.entries(secrets)) {
    const encrypted_value = await encryptGitHubSecret(publicKey.key, value);
    await githubRequest(repositoryPath(env, `/actions/secrets/${encodeURIComponent(name)}`), env.GITHUB_TOKEN, {
      method: 'PUT', body: JSON.stringify({ encrypted_value, key_id: publicKey.key_id }),
    });
    results.push(name);
  }
  return results;
}

export async function dispatchGitHubWorkflow(env, workflow, inputs = {}) {
  if (!env.GITHUB_TOKEN) throw new Error('GitHub token is not configured');
  await githubRequest(repositoryPath(env, `/actions/workflows/${encodeURIComponent(workflow)}/dispatches`), env.GITHUB_TOKEN, {
    method: 'POST', body: JSON.stringify({ ref: 'main', ...(Object.keys(inputs).length ? { inputs } : {}) }),
  });
  return { workflow, ref: 'main' };
}
