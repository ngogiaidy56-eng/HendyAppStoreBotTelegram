import { requireAdmin } from '../auth/session.js';
import { HttpError, json } from '../utils/http.js';
export const ADMIN_STREAM_PROTOCOL = 'hendy-admin-stream-v1';
const AUTH_PROTOCOL_PREFIX = 'hendy-auth.';
function cleanText(value, max = 160) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max); }
/** Exposes allowlisted metadata only; never serializes secret values, tokens or arbitrary payloads. */
export function normalizeAdminEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Event must be an object');
  const allowedTypes = new Set(['audit','queue','deployment','release','system']);
  const type = cleanText(input.type, 24);
  if (!allowedTypes.has(type)) throw new TypeError('Unsupported live event type');
  const allowedStatuses = new Set(['recorded','queued','processing','completed','retry','dead_letter','failed','healthy','warning']);
  const status = cleanText(input.status || 'recorded', 24);
  if (!allowedStatuses.has(status)) throw new TypeError('Unsupported live event status');
  const at = Number(input.at);
  return { type, at: Number.isSafeInteger(at) && at > 0 ? at : Math.floor(Date.now()/1000), action: cleanText(input.action || type,120), targetType: cleanText(input.targetType || '',80), targetId: cleanText(input.targetId || '',160), status };
}
export async function publishAdminEvent(env, input) {
  if (!env?.ADMIN_LIVE_SESSIONS) return { skipped:true, reason:'durable_object_not_bound' };
  const event = normalizeAdminEvent(input);
  const id = env.ADMIN_LIVE_SESSIONS.idFromName('hendy-admin-live-stream');
  const response = await env.ADMIN_LIVE_SESSIONS.get(id).fetch('https://admin-live.internal/publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(event)});
  if (!response.ok) throw new Error('Admin live event publish failed ('+response.status+')');
  return response.json();
}
export async function handleAdminWebSocket(request, env) {
  if(request.method!=='GET'||(request.headers.get('upgrade')||'').toLowerCase()!=='websocket') return json({error:{code:'WEBSOCKET_UPGRADE_REQUIRED',message:'Use a WebSocket upgrade request'}},426);
  if(!env.ADMIN_LIVE_SESSIONS) throw new HttpError(503,'Live status streaming is not configured','LIVE_STREAM_NOT_CONFIGURED');
  const origin = request.headers.get('origin');
  const allowedOrigins = (env.CORS_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (origin && !allowedOrigins.includes(origin)) throw new HttpError(403, 'Origin is not allowed to connect to the live stream', 'ORIGIN_NOT_ALLOWED');
  const offered=(request.headers.get('sec-websocket-protocol')||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!offered.includes(ADMIN_STREAM_PROTOCOL)) throw new HttpError(400,'Required WebSocket subprotocol is missing','LIVE_STREAM_PROTOCOL_REQUIRED');
  const credential=offered.find(x=>x.startsWith(AUTH_PROTOCOL_PREFIX));
  const token=credential?credential.slice(AUTH_PROTOCOL_PREFIX.length):'';
  if(!token||token.length>4096||/[\s,]/.test(token)) throw new HttpError(401,'Sign in before opening the live stream','UNAUTHORIZED');
  const authHeaders=new Headers(request.headers); authHeaders.set('authorization','Bearer '+token);
  await requireAdmin(new Request(request,{headers:authHeaders}),env);
  const forwardHeaders=new Headers(request.headers); forwardHeaders.delete('authorization'); forwardHeaders.set('sec-websocket-protocol',ADMIN_STREAM_PROTOCOL);
  const forwarded=new Request(request,{headers:forwardHeaders});
  const id=env.ADMIN_LIVE_SESSIONS.idFromName('hendy-admin-live-stream');
  return env.ADMIN_LIVE_SESSIONS.get(id).fetch(forwarded);
}
