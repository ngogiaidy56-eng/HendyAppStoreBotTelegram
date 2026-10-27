import { hmacBytes, bytesToBase64Url, base64UrlToBytes, bytesToUtf8 } from '../utils/crypto.js';
import { HttpError, nowSeconds } from '../utils/http.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function signSession(payload, secret, ttlSeconds = 3600, now = nowSeconds()) {
  if (!secret || secret.length < 32) throw new HttpError(503, 'SESSION_SECRET must be configured with at least 32 characters', 'SESSION_NOT_CONFIGURED');
  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = bytesToBase64Url(encoder.encode(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds })));
  const input = `${header}.${body}`;
  const signature = bytesToBase64Url(await hmacBytes(secret, input));
  return `${input}.${signature}`;
}

export async function verifySession(token, secret, now = nowSeconds()) {
  if (!secret || secret.length < 32) throw new HttpError(503, 'SESSION_SECRET is not configured', 'SESSION_NOT_CONFIGURED');
  if (typeof token !== 'string' || token.length > 4096) throw new HttpError(401, 'Unauthorized', 'UNAUTHORIZED');
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Invalid session', 'INVALID_SESSION');
  let header, payload;
  try {
    header = JSON.parse(decoder.decode(base64UrlToBytes(parts[0])));
    payload = JSON.parse(decoder.decode(base64UrlToBytes(parts[1])));
  } catch { throw new HttpError(401, 'Invalid session', 'INVALID_SESSION'); }
  if (header.alg !== 'HS256' || typeof payload.exp !== 'number' || payload.exp <= now || typeof payload.telegramId !== 'string') {
    throw new HttpError(401, 'Session expired or invalid', 'INVALID_SESSION');
  }
  const expected = bytesToBase64Url(await hmacBytes(secret, `${parts[0]}.${parts[1]}`));
  // Constant-time comparison through the decoded fixed-length HMAC bytes.
  let a; let b;
  try { a = base64UrlToBytes(parts[2]); b = base64UrlToBytes(expected); }
  catch { throw new HttpError(401, 'Invalid session signature', 'INVALID_SESSION'); }
  if (a.length !== b.length) throw new HttpError(401, 'Invalid session signature', 'INVALID_SESSION');
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) throw new HttpError(401, 'Invalid session signature', 'INVALID_SESSION');
  return payload;
}

export async function requireSession(request, env) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, 'Sign in through Telegram first', 'UNAUTHORIZED');
  const session = await verifySession(match[1], env.SESSION_SECRET, nowSeconds());
  const user = await env.DB.prepare('SELECT id, telegram_id, username, first_name, last_name, balance_vnd, total_spent_vnd, vip_level, is_banned FROM users WHERE telegram_id = ?').bind(session.telegramId).first();
  if (!user || user.is_banned) throw new HttpError(403, 'Account is not allowed to access this service', 'ACCOUNT_BLOCKED');
  return { session, user };
}

export function isAdmin(telegramId, env) {
  const allowed = (env.ADMIN_TELEGRAM_IDS || '').split(',').map((value) => value.trim()).filter(Boolean);
  return allowed.includes(String(telegramId));
}

export async function requireAdmin(request, env) {
  const identity = await requireSession(request, env);
  if (!isAdmin(identity.user.telegram_id, env)) throw new HttpError(403, 'Administrator permission required', 'ADMIN_REQUIRED');
  return identity;
}
