import { routeApi } from './routes/api.js';
import { handleBinaryDownload } from './routes/api.js';
import { HttpError, json, nowSeconds } from './utils/http.js';


async function cleanupExpiredUploads(env) {
  if (!env.DB || !env.ARTIFACTS) return;
  const now = nowSeconds();
  const { results } = await env.DB.prepare(`SELECT id,r2_key,r2_upload_id FROM release_uploads
    WHERE status='uploading' AND expires_at<=? LIMIT 50`).bind(now).all();
  for (const upload of results) {
    try { await env.ARTIFACTS.resumeMultipartUpload(upload.r2_key, upload.r2_upload_id).abort(); }
    catch (error) {
      // Keep the row in 'uploading' so a later cron can retry the abort.
      console.warn('expired_upload_abort_failed', { uploadId: upload.id, error: error?.message || 'unknown' });
      continue;
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE release_uploads SET status='expired' WHERE id=? AND status='uploading'").bind(upload.id),
      env.DB.prepare('DELETE FROM release_upload_parts WHERE upload_session_id=?').bind(upload.id),
    ]);
  }
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  const allowed = (env.CORS_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean);
  const headers = { 'vary': 'Origin', 'access-control-allow-methods': 'GET,HEAD,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'Authorization,Content-Type,X-Telegram-Bot-Api-Secret-Token,X-Signature', 'access-control-max-age': '86400' };
  if (origin && allowed.includes(origin)) headers['access-control-allow-origin'] = origin;
  return headers;
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(cleanupExpiredUploads(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') {
      if (request.headers.get('origin') && !cors['access-control-allow-origin']) return json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed' } }, 403);
      return new Response(null, { status: 204, headers: cors });
    }
    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        const db = await env.DB.prepare('SELECT 1 AS ok').first();
        return json({ ok: db?.ok === 1, service: 'hendy-app-store-api', timestamp: nowSeconds() }, 200, cors);
      }
      if (url.pathname.startsWith('/downloads/')) {
        const response = await handleBinaryDownload(request, env, url);
        const headers = new Headers(response.headers);
        for (const [key, value] of Object.entries(cors)) headers.set(key, value);
        return new Response(response.body, { status: response.status, headers });
      }
      if (url.pathname.startsWith('/api/') || url.pathname === '/webhooks/bank') {
        return await routeApi(request, env, url).then((response) => {
          const headers = new Headers(response.headers);
          for (const [key, value] of Object.entries(cors)) headers.set(key, value);
          return new Response(response.body, { status: response.status, headers });
        });
      }
      return json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404, cors);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 500) console.error('request_failed', { path: url.pathname, error: error?.message || 'unknown' });
      const body = { error: { code: error?.code || 'INTERNAL_ERROR', message: status >= 500 ? 'Internal server error' : error.message } };
      return json(body, status, cors);
    }
  },
};
