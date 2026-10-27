import { nowSeconds } from '../utils/http.js';

/** Record security-relevant metadata only; callers must not pass credentials or private payloads. */
export async function recordAudit(env, actorId, action, targetType = '', targetId = '', details = {}) {
  const safeDetails = details && typeof details === 'object' ? details : {};
  await env.DB.prepare('INSERT INTO audit_logs (actor_telegram_id, action, target_type, target_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(actorId || null, String(action).slice(0, 120), String(targetType).slice(0, 80), String(targetId).slice(0, 160), JSON.stringify(safeDetails), nowSeconds()).run();
}
