export async function isMaintenanceEnabled(env: { DB: D1Database }) {
  const row = await env.DB.prepare("SELECT value_json FROM bot_configs WHERE config_key='maintenance_enabled'").first<{value_json:string}>();
  try { return JSON.parse(row?.value_json || 'false') === true; } catch { return false; }
}
