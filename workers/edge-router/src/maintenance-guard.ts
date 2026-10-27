export async function maintenanceResponse(request: Request, env: { DB?: D1Database }): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/') || url.pathname.startsWith('/api/admin/') || url.pathname === '/api/auth/telegram') return null;
  if (!env.DB) return null;
  const row = await env.DB.prepare("SELECT value_json FROM bot_configs WHERE config_key='maintenance_enabled'").first<{value_json:string}>();
  if (!row) return null;
  let enabled = false; try { enabled = JSON.parse(row.value_json) === true; } catch { return null; }
  if (!enabled) return null;
  const msg = await env.DB.prepare("SELECT value_json FROM bot_configs WHERE config_key='maintenance_message'").first<{value_json:string}>();
  let message = 'Hệ thống đang bảo trì, vui lòng quay lại sau.'; try { message = JSON.parse(msg?.value_json || '""') || message; } catch { /* default */ }
  return Response.json({error:{code:'MAINTENANCE_MODE',message}}, {status:503,headers:{'cache-control':'no-store','retry-after':'300'}});
}
