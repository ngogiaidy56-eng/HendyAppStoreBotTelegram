import { nowSeconds } from '../utils/http.js';
import { publishAdminEvent } from '../realtime/ws-handler.js';

/** Record security-relevant metadata only; callers must not pass credentials or private payloads. */
export async function recordAudit(env, actorId, action, targetType = '', targetId = '', details = {}) {
  const safeDetails = details && typeof details === 'object' ? details : {};
  await env.DB.prepare('INSERT INTO audit_logs (actor_telegram_id, action, target_type, target_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(actorId || null, String(action).slice(0, 120), String(targetType).slice(0, 80), String(targetId).slice(0, 160), JSON.stringify(safeDetails), nowSeconds()).run();
  if (env.ADMIN_LIVE_SESSIONS) {
    try { await publishAdminEvent(env, { type:'audit', action:String(action).slice(0,120), targetType:String(targetType).slice(0,80), targetId:String(targetId).slice(0,160), status:'recorded', at:nowSeconds() }); }
    catch (error) { console.warn('admin_live_event_failed',{error:error?.message||'unknown'}); }
  }
}
