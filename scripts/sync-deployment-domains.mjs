const cfToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const githubToken = String(process.env.HENDY_GITHUB_TOKEN || '').trim();
const repository = String(process.env.GITHUB_REPOSITORY || '').trim();
const target = String(process.argv[2] || 'all').toLowerCase();

if (!cfToken || !accountId || !githubToken || !/^[^/]+\/[^/]+$/.test(repository)) {
  throw new Error('Domain sync needs CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, HENDY_GITHUB_TOKEN, and GITHUB_REPOSITORY. Use a GitHub token allowed to update Actions variables and dispatch workflows.');
}
if (!['miniapp','web','all'].includes(target)) throw new Error('Target must be miniapp, web, or all.');

const [owner, repo] = repository.split('/');
const projects = [
  { key: 'miniapp', name: String(process.env.MINIAPP_PAGES_PROJECT || 'hendy-mini-app').trim(), overrideKey: 'MINIAPP_DOMAIN_OVERRIDE', variable: 'MINIAPP_PUBLIC_URL', appVariable: 'APP_URL' },
  { key: 'admin', name: String(process.env.ADMIN_PAGES_PROJECT || 'hendy-web-admin').trim(), overrideKey: 'ADMIN_DOMAIN_OVERRIDE', variable: 'ADMIN_PUBLIC_URL', appVariable: 'ADMIN_URL' },
  { key: 'storefront', name: String(process.env.STOREFRONT_PAGES_PROJECT || 'hendy-app-storefront').trim(), overrideKey: 'STOREFRONT_DOMAIN_OVERRIDE', variable: 'STOREFRONT_PUBLIC_URL', appVariable: 'STOREFRONT_URL' },
];
const required = target === 'miniapp' ? new Set(['miniapp']) : target === 'web' ? new Set(['admin','storefront']) : new Set(projects.map((p) => p.key));
const headersCf = { authorization: 'Bearer ' + cfToken, accept: 'application/json' };
const headersGh = { authorization: 'Bearer ' + githubToken, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json' };

async function github(path, init = {}) {
  const response = await fetch('https://api.github.com/repos/' + owner + '/' + repo + path, { ...init, headers: { ...headersGh, ...(init.headers || {}) } });
  if (!response.ok) throw new Error('GitHub API request failed (' + response.status + ') for ' + path);
  if (response.status === 204) return null;
  return response.json();
}

async function cloudflareProject(project) {
  const response = await fetch('https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(accountId) + '/pages/projects/' + encodeURIComponent(project.name), { headers: headersCf });
  if (response.status === 404 && !required.has(project.key)) {
    console.log('Skipping Pages project that is not configured yet: ' + project.name);
    return null;
  }
  if (!response.ok) throw new Error('Cloudflare Pages lookup failed for ' + project.name + ' (' + response.status + ')');
  const data = await response.json();
  if (!data.success || !data.result) throw new Error('Cloudflare Pages returned no project metadata for ' + project.name);
  const projectData = data.result;
  const domains = Array.isArray(projectData.domains) ? projectData.domains.filter((item) => typeof item === 'string') : [];
  const custom = domains.find((domain) => !domain.toLowerCase().endsWith('.pages.dev'));
  const hostname = custom || (projectData.subdomain ? String(projectData.subdomain) + '.pages.dev' : '');
  if (!hostname) throw new Error('Cloudflare Pages project does not expose a domain: ' + project.name);
  return 'https://' + hostname.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

const varsResponse = await github('/actions/variables?per_page=100');
const variables = Object.fromEntries((varsResponse.variables || []).map((item) => [item.name, String(item.value ?? '')]));
const detected = {};
for (const project of projects) {
  try {
    const discovered = await cloudflareProject(project);
    if (discovered) detected[project.key] = discovered;
  } catch (error) {
    if (required.has(project.key)) throw error;
    console.warn('Optional Pages domain could not be detected for ' + project.key + ': ' + String(error.message || error));
  }
}
for (const project of projects) {
  if (!detected[project.key]) continue;
  const override = String(variables[project.overrideKey] || '').trim();
  const publishedUrl = override || detected[project.key];
  let parsed;
  try { parsed = new URL(publishedUrl); } catch { throw new Error('Invalid domain override in GitHub Actions variable ' + project.overrideKey); }
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(project.overrideKey + ' must contain an HTTPS origin only.');
  }
  variables[project.variable] = publishedUrl.replace(/\/+$/, '');
  variables[project.appVariable] = publishedUrl.replace(/\/+$/, '');
  console.log(project.key + ' URL synchronized: ' + variables[project.appVariable]);
}
const frontendUrls = ['APP_URL','ADMIN_URL','STOREFRONT_URL'].map((name) => variables[name]).filter(Boolean);
variables.CORS_ORIGINS = [...new Set(frontendUrls.map((value) => new URL(value).origin))].join(',');
const updates = ['MINIAPP_PUBLIC_URL','ADMIN_PUBLIC_URL','STOREFRONT_PUBLIC_URL','APP_URL','ADMIN_URL','STOREFRONT_URL','CORS_ORIGINS']
  .filter((name) => variables[name] !== undefined)
  .map((name) => ({ name, value: variables[name] }));
const existingNames = new Set((varsResponse.variables || []).map((item) => item.name));
for (const item of updates) {
  const suffix = '/actions/variables/' + encodeURIComponent(item.name);
  if (existingNames.has(item.name)) {
    await github(suffix, { method: 'PATCH', body: JSON.stringify(item) });
  } else {
    await github('/actions/variables', { method: 'POST', body: JSON.stringify(item) });
    existingNames.add(item.name);
  }
}
console.log('Updated GitHub Actions variables: ' + updates.map((item) => item.name).join(', '));
const autoDeploy = String(variables.AUTO_REDEPLOY_WORKERS_AFTER_DOMAIN_SYNC ?? 'true').toLowerCase() !== 'false';
if (autoDeploy) {
  await github('/actions/workflows/deploy-workers.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
  console.log('Dispatched deploy-workers.yml so CORS and runtime URLs are refreshed.');
} else {
  console.log('Worker redeployment after domain sync is disabled by AUTO_REDEPLOY_WORKERS_AFTER_DOMAIN_SYNC.');
}
